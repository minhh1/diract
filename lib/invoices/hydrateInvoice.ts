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

  const { data: invoiceFields } = await admin
    .from('company_table_fields').select('id, field_key')
    .eq('table_id', invoiceRecord.table_id).is('deleted_at', null);
  const invoiceKeyById = new Map((invoiceFields || []).map(f => [f.id, f.field_key]));

  const { data: invoiceValueRows } = await admin
    .from('company_table_values')
    .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
    .eq('record_id', invoiceId);
  const invoice = hydrateValues((invoiceValueRows || []) as ValueRow[], invoiceKeyById);

  const [{ data: company }, { data: matter }, { data: debtor }, { data: responsiblePartner }, { data: lineItems }] = await Promise.all([
    admin.from('companies').select('name, abn, invoice_settings, logo_url').eq('id', companyId).maybeSingle(),
    invoice.matter ? admin.from('projects').select('name').eq('id', invoice.matter).maybeSingle() : Promise.resolve({ data: null }),
    invoice.debtor ? admin.from('entities').select('name').eq('id', invoice.debtor).maybeSingle() : Promise.resolve({ data: null }),
    invoice.responsible_partner ? admin.from('entities').select('name').eq('id', invoice.responsible_partner).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('invoice_line_items').select('*').eq('invoice_record_id', invoiceId).order('entry_date'),
  ]);

  const invoiceSettings = (company?.invoice_settings as any) || {};
  const templates: InvoiceTemplateConfig[] = invoiceSettings.templates || [];
  const selectedTemplate = templates.find(t => t.id === invoice.template_id) || templates.find(t => t.isDefault) || templates[0];
  const display: InvoiceTemplateDisplay = { ...DEFAULT_INVOICE_DISPLAY, ...(selectedTemplate?.display || {}) };
  const layout: InvoiceLayout = { ...DEFAULT_INVOICE_LAYOUT, ...(selectedTemplate?.layout || {}) };

  let logoBytes: Uint8Array | null = null;
  let logoIsPng = true;
  if (company?.logo_url) {
    try {
      const res = await fetch(company.logo_url);
      if (res.ok) {
        logoBytes = new Uint8Array(await res.arrayBuffer());
        logoIsPng = !/\.jpe?g(\?|$)/i.test(company.logo_url);
      }
    } catch {
      // Logo fetch failing shouldn't block generating the rest of the invoice.
    }
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
      matterName: (matter as any)?.name || null, debtorName: (debtor as any)?.name || null,
      subtotal: Number(invoice.subtotal) || 0, gst: Number(invoice.gst) || 0, totalIncGst: Number(invoice.total_inc_gst) || 0,
      trustApplied: Number(invoice.trust_applied) || 0, payments: Number(invoice.payments) || 0, amountDue: Number(invoice.amount_due) || 0,
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
