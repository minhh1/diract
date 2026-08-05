// lib/invoices/hydrateInvoice.ts
// Shared "load one issued invoice + everything a renderer needs" step --
// factored out of app/api/invoices/[invoiceId]/pdf/route.ts once a second
// (docx) and a third (was already the case: template-preview, though that
// one hydrates a SYNTHETIC sample invoice, not a real one, so it doesn't use
// this) consumer needed the identical data. Reads the invoice's own EAV
// fields, company branding/terms, and the frozen invoice_line_items
// snapshot (never the live Time & Fee Entry/Disbursement rows -- an issued
// invoice must never change if the source entry is edited later).
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_INVOICE_DISPLAY, DEFAULT_INVOICE_LAYOUT,
  type GenerateInvoicePdfInput, type InvoiceTemplateDisplay, type InvoiceLayout,
} from "./generateInvoicePdf";
import type { InvoiceTemplateConfig } from "./types";

type ValueRow = { record_id: string; field_id: string; value_text: string | null; value_number: number | null; value_date: string | null; value_boolean: boolean | null; value_record_id: string | null };

// A company's logo changes rarely (Settings > uploaded once, basically
// never re-uploaded), but every PDF/docx generation used to re-fetch it
// over the network from scratch -- a real, synchronous cost added to every
// single invoice download on top of the actual PDF rendering. Cached
// in-process per server instance, keyed by URL (so a genuine re-upload,
// which gets a new storage path, isn't served stale); TTL is generous
// since a wrong cached logo is at worst wrong for LOGO_CACHE_TTL_MS after a
// same-URL overwrite, which this storage convention doesn't do anyway.
const LOGO_CACHE_TTL_MS = 30 * 60 * 1000;
const logoCache = new Map<string, { bytes: Uint8Array; isPng: boolean; fetchedAt: number }>();

async function fetchLogoCached(logoUrl: string): Promise<{ bytes: Uint8Array; isPng: boolean } | null> {
  const cached = logoCache.get(logoUrl);
  if (cached && Date.now() - cached.fetchedAt < LOGO_CACHE_TTL_MS) return cached;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return cached ?? null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const isPng = !/\.jpe?g(\?|$)/i.test(logoUrl);
    const entry = { bytes, isPng, fetchedAt: Date.now() };
    logoCache.set(logoUrl, entry);
    return entry;
  } catch {
    // Logo fetch failing shouldn't block generating the rest of the
    // invoice -- fall back to a still-usable stale cache entry if there is
    // one, otherwise no logo.
    return cached ?? null;
  }
}

function hydrateValues(valueRows: ValueRow[], fieldKeyById: Map<string, string>): Record<string, any> {
  const row: Record<string, any> = {};
  for (const v of valueRows) {
    const key = fieldKeyById.get(v.field_id);
    if (!key) continue;
    row[key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
  }
  return row;
}

function initials(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  return parts.map(p => p[0]?.toUpperCase()).join('').slice(0, 3) || null;
}

export interface HydratedInvoice {
  invoiceNumber: string;
  input: GenerateInvoicePdfInput;
  selectedTemplate: InvoiceTemplateConfig | undefined;
}

export async function hydrateInvoiceForRender(
  admin: SupabaseClient, invoiceId: string, companyId: string
): Promise<HydratedInvoice | null> {
  const { data: invoiceRecord } = await admin
    .from('company_table_records').select('id, table_id')
    .eq('id', invoiceId).eq('company_id', companyId).is('deleted_at', null).maybeSingle();
  if (!invoiceRecord) return null;

  // invoiceValueRows only needs invoiceId (already known), not
  // invoiceRecord.table_id -- these two used to run sequentially even
  // though nothing here actually depends on the other's result, adding a
  // full extra round trip to every single PDF/docx generation for no
  // reason.
  const [{ data: invoiceFields }, { data: invoiceValueRows }] = await Promise.all([
    admin.from('company_table_fields').select('id, field_key')
      .eq('table_id', invoiceRecord.table_id).is('deleted_at', null),
    admin.from('company_table_values')
      .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
      .eq('record_id', invoiceId),
  ]);
  const invoiceKeyById = new Map((invoiceFields || []).map(f => [f.id, f.field_key]));
  const invoice = hydrateValues((invoiceValueRows || []) as ValueRow[], invoiceKeyById);

  // Debtor allows more than one entity (see supabase/invoices_debtor_multi.sql
  // -- e.g. joint purchasers), so unlike every other single-entity relation
  // here it's read via company_table_value_links, not a scalar
  // company_table_values.value_record_id.
  const debtorFieldId = (invoiceFields || []).find(f => f.field_key === 'debtor')?.id;

  const [{ data: company }, { data: matter }, { data: debtorLinks }, { data: responsiblePartner }, { data: lineItems }] = await Promise.all([
    admin.from('companies').select('name, abn, invoice_settings, logo_url').eq('id', companyId).maybeSingle(),
    invoice.matter ? admin.from('projects').select('name').eq('id', invoice.matter).maybeSingle() : Promise.resolve({ data: null }),
    debtorFieldId
      ? admin.from('company_table_value_links').select('value_record_id').eq('record_id', invoiceId).eq('field_id', debtorFieldId)
      : Promise.resolve({ data: [] as { value_record_id: string }[] }),
    invoice.responsible_partner ? admin.from('entities').select('name').eq('id', invoice.responsible_partner).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('invoice_line_items').select('*').eq('invoice_record_id', invoiceId).order('entry_date'),
  ]);

  const debtorIds = (debtorLinks || []).map(l => l.value_record_id);
  const { data: debtorEntities } = debtorIds.length
    ? await admin.from('entities').select('name').in('id', debtorIds).order('name')
    : { data: [] as { name: string }[] };
  const debtorNames = (debtorEntities || []).map(e => e.name);

  const invoiceSettings = (company?.invoice_settings as any) || {};
  const templates: InvoiceTemplateConfig[] = invoiceSettings.templates || [];
  const selectedTemplate = templates.find(t => t.id === invoice.template_id) || templates.find(t => t.isDefault) || templates[0];
  // This one invoice's own choice (CreateInvoiceModal.tsx's 2 checkboxes)
  // wins over the template's default when explicitly set (not null/
  // undefined -- every invoice created before this existed, and any where
  // the checkbox was left at the template's own default, has no override
  // stored at all).
  const display: InvoiceTemplateDisplay = {
    ...DEFAULT_INVOICE_DISPLAY,
    ...(selectedTemplate?.display || {}),
    ...(invoice.show_professional_fees_table != null ? { showProfessionalFeesTable: invoice.show_professional_fees_table } : {}),
    ...(invoice.show_summary_fees_by_lawyer_table != null ? { showSummaryFeesByLawyerTable: invoice.show_summary_fees_by_lawyer_table } : {}),
  };
  const layout: InvoiceLayout = { ...DEFAULT_INVOICE_LAYOUT, ...(selectedTemplate?.layout || {}) };

  let logoBytes: Uint8Array | null = null;
  let logoIsPng = true;
  if (company?.logo_url) {
    const logo = await fetchLogoCached(company.logo_url);
    if (logo) { logoBytes = logo.bytes; logoIsPng = logo.isPng; }
  }

  const feeLines = (lineItems || []).filter(l => l.source_type === 'fee').map(l => ({
    date: l.entry_date, staffInitials: initials(l.staff_name), description: l.description,
    rate: l.rate, hours: l.hours, originalAmount: Number(l.original_amount), billedAmount: Number(l.billed_amount),
    gstAmount: Number(l.gst_amount) || 0, staffPosition: l.staff_position || null, gstStatus: l.gst_status || null,
    staffName: l.staff_name as string | null, isFixedFee: !!l.is_fixed_fee,
  }));
  const disbursementLines = (lineItems || []).filter(l => l.source_type === 'disbursement').map(l => ({
    date: l.entry_date, description: l.description, amount: Number(l.billed_amount),
    gstAmount: Number(l.gst_amount) || 0, gstStatus: l.gst_status || null,
  }));

  const input: GenerateInvoicePdfInput = {
    company: {
      name: company?.name || '', abn: company?.abn || null,
      address: invoiceSettings.firmAddress || null,
      logoBytes, logoIsPng,
    },
    creditTerms: invoiceSettings.creditTerms || '',
    otherTerms: invoiceSettings.otherTerms || '',
    bankDetails: invoiceSettings.bankDetails || null,
    display,
    layout,
    invoice: {
      invoiceNumber: invoice.invoice_number || '', issueDate: invoice.issue_date || null, dueDate: invoice.due_date || null,
      matterName: (matter as any)?.name || null, debtorNames,
      subtotal: Number(invoice.subtotal) || 0, gst: Number(invoice.gst) || 0, totalIncGst: Number(invoice.total_inc_gst) || 0,
      trustApplied: Number(invoice.trust_applied) || 0, payments: Number(invoice.payments) || 0,
      waivedAmount: Number(invoice.waived_amount) || 0, amountDue: Number(invoice.amount_due) || 0,
      priorBalance: 0,
      responsiblePartnerName: (responsiblePartner as any)?.name || null,
      ourReference: invoice.our_reference || null, yourReference: invoice.your_reference || null,
      periodEnd: invoice.period_end || null, paymentTermsDays: invoiceSettings.paymentTermsDays ?? 14,
      professionalFeesDescription: invoice.professional_fees_description || null,
    },
    feeLines,
    disbursementLines,
  };

  return { invoiceNumber: invoice.invoice_number || 'invoice', input, selectedTemplate };
}
