// app/api/invoices/[invoiceId]/pdf/route.ts
// GET -> the tax invoice PDF for one Invoices-table record. Reads the
// invoice's own EAV fields (same hydrate pattern as app/api/ledes/[recordId]/route.ts),
// its frozen invoice_line_items snapshot (not the live Time & Fee Entry/
// Disbursement rows -- an issued invoice's PDF must never change if the
// source entry is edited later), the company's branding/terms/template
// settings, and hands it all to lib/invoices/generateInvoicePdf.ts.
// `?download=1` forces a Content-Disposition attachment; otherwise the PDF
// is served inline for the in-tab preview.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateInvoicePdf, DEFAULT_INVOICE_DISPLAY, type InvoiceTemplateDisplay } from "@/lib/invoices/generateInvoicePdf";

type ValueRow = { record_id: string; field_id: string; value_text: string | null; value_number: number | null; value_date: string | null; value_boolean: boolean | null; value_record_id: string | null };

function hydrate(valueRows: ValueRow[], fieldKeyById: Map<string, string>): Record<string, any> {
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { invoiceId } = await params;

  const { data: invoiceRecord } = await admin
    .from('company_table_records').select('id, table_id')
    .eq('id', invoiceId).eq('company_id', companyId).is('deleted_at', null).maybeSingle();
  if (!invoiceRecord) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const { data: invoiceFields } = await admin
    .from('company_table_fields').select('id, field_key')
    .eq('table_id', invoiceRecord.table_id).is('deleted_at', null);
  const invoiceKeyById = new Map((invoiceFields || []).map(f => [f.id, f.field_key]));

  const { data: invoiceValueRows } = await admin
    .from('company_table_values')
    .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
    .eq('record_id', invoiceId);
  const invoice = hydrate((invoiceValueRows || []) as ValueRow[], invoiceKeyById);

  const [{ data: company }, { data: matter }, { data: debtor }, { data: lineItems }] = await Promise.all([
    admin.from('companies').select('name, abn, invoice_settings, logo_url').eq('id', companyId).maybeSingle(),
    invoice.matter ? admin.from('projects').select('name').eq('id', invoice.matter).maybeSingle() : Promise.resolve({ data: null }),
    invoice.debtor ? admin.from('entities').select('name').eq('id', invoice.debtor).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('invoice_line_items').select('*').eq('invoice_record_id', invoiceId).order('entry_date'),
  ]);

  const invoiceSettings = (company?.invoice_settings as any) || {};
  const templates: { id: string; name: string; display?: Partial<InvoiceTemplateDisplay> }[] = invoiceSettings.templates || [];
  const selectedTemplate = templates.find(t => t.id === invoice.template_id) || templates.find((t: any) => t.isDefault) || templates[0];
  const display: InvoiceTemplateDisplay = { ...DEFAULT_INVOICE_DISPLAY, ...(selectedTemplate?.display || {}) };

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
  }));
  const disbursementLines = (lineItems || []).filter(l => l.source_type === 'disbursement').map(l => ({
    date: l.entry_date, description: l.description, amount: Number(l.billed_amount),
  }));

  const bytes = await generateInvoicePdf({
    company: {
      name: company?.name || '', abn: company?.abn || null,
      address: invoiceSettings.firmAddress || null,
      logoBytes, logoIsPng,
    },
    creditTerms: invoiceSettings.creditTerms || '',
    otherTerms: invoiceSettings.otherTerms || '',
    bankDetails: invoiceSettings.bankDetails || null,
    display,
    invoice: {
      invoiceNumber: invoice.invoice_number || '', issueDate: invoice.issue_date || null, dueDate: invoice.due_date || null,
      matterName: (matter as any)?.name || null, debtorName: (debtor as any)?.name || null,
      subtotal: Number(invoice.subtotal) || 0, gst: Number(invoice.gst) || 0, totalIncGst: Number(invoice.total_inc_gst) || 0,
      trustApplied: Number(invoice.trust_applied) || 0, payments: Number(invoice.payments) || 0, amountDue: Number(invoice.amount_due) || 0,
      priorBalance: 0,
    },
    feeLines,
    disbursementLines,
  });

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${(invoice.invoice_number || 'invoice').replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
    },
  });
}
