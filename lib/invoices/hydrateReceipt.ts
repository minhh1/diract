// lib/invoices/hydrateReceipt.ts
// "Load one Receipts-ledger row + everything the PDF renderer needs" --
// mirrors lib/invoices/hydrateInvoice.ts's shape (company branding, the
// linked invoice's own EAV fields, debtor names via company_table_value_links
// since debtor allows more than one entity).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateReceiptPdfInput } from "./generateReceiptPdf";

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

export interface HydratedReceipt {
  receiptNumber: string;
  input: GenerateReceiptPdfInput;
}

export async function hydrateReceiptForRender(
  admin: SupabaseClient, receiptId: string, companyId: string
): Promise<HydratedReceipt | null> {
  const { data: receiptRecord } = await admin
    .from('company_table_records').select('id, table_id')
    .eq('id', receiptId).eq('company_id', companyId).is('deleted_at', null).maybeSingle();
  if (!receiptRecord) return null;

  const { data: receiptFields } = await admin
    .from('company_table_fields').select('id, field_key')
    .eq('table_id', receiptRecord.table_id).is('deleted_at', null);
  const receiptKeyById = new Map((receiptFields || []).map(f => [f.id, f.field_key]));

  const { data: receiptValueRows } = await admin
    .from('company_table_values')
    .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
    .eq('record_id', receiptId);
  const receipt = hydrateValues((receiptValueRows || []) as ValueRow[], receiptKeyById);

  const [{ data: company }, { data: matter }] = await Promise.all([
    admin.from('companies').select('name, abn, invoice_settings, logo_url').eq('id', companyId).maybeSingle(),
    receipt.matter ? admin.from('projects').select('name').eq('id', receipt.matter).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  // The linked invoice -- invoice_number, total_inc_gst, cumulative payments
  // (to derive "previously paid"), and its debtor(s).
  let invoiceNumber = '';
  let totalIncGst = 0;
  let priorPaid = 0;
  let debtorNames: string[] = [];
  if (receipt.invoice) {
    const { data: invoiceRecord } = await admin
      .from('company_table_records').select('id, table_id').eq('id', receipt.invoice).maybeSingle();
    if (invoiceRecord) {
      const { data: invoiceFields } = await admin
        .from('company_table_fields').select('id, field_key')
        .eq('table_id', invoiceRecord.table_id).is('deleted_at', null);
      const invoiceKeyById = new Map((invoiceFields || []).map(f => [f.id, f.field_key]));
      const { data: invoiceValueRows } = await admin
        .from('company_table_values')
        .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
        .eq('record_id', receipt.invoice);
      const invoice = hydrateValues((invoiceValueRows || []) as ValueRow[], invoiceKeyById);
      invoiceNumber = invoice.invoice_number || '';
      totalIncGst = Number(invoice.total_inc_gst) || 0;
      const amountReceived = Number(receipt.amount_received) || 0;
      priorPaid = Math.max(0, (Number(invoice.payments) || 0) - amountReceived);

      const debtorFieldId = (invoiceFields || []).find(f => f.field_key === 'debtor')?.id;
      const { data: debtorLinks } = debtorFieldId
        ? await admin.from('company_table_value_links').select('value_record_id').eq('record_id', receipt.invoice).eq('field_id', debtorFieldId)
        : { data: [] as { value_record_id: string }[] };
      const debtorIds = (debtorLinks || []).map(l => l.value_record_id);
      const { data: debtorEntities } = debtorIds.length
        ? await admin.from('entities').select('name').in('id', debtorIds).order('name')
        : { data: [] as { name: string }[] };
      debtorNames = (debtorEntities || []).map(e => e.name);
    }
  }

  const invoiceSettings = (company?.invoice_settings as any) || {};
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
      // Logo fetch failing shouldn't block generating the rest of the receipt.
    }
  }

  const input: GenerateReceiptPdfInput = {
    company: {
      name: company?.name || '', abn: company?.abn || null,
      address: invoiceSettings.firmAddress || null,
      logoBytes, logoIsPng,
    },
    receipt: {
      receiptNumber: receipt.receipt_number || '',
      date: receipt.date || null,
      paymentMethod: receipt.payment_method || null,
      bankReference: receipt.bank_reference || null,
      receivedBy: receipt.received_by || null,
      amountReceived: Number(receipt.amount_received) || 0,
      waivedAmount: Number(receipt.waived_amount) || 0,
      waivedReason: receipt.waived_reason || null,
      balanceAfter: Number(receipt.balance_after) || 0,
    },
    invoice: {
      invoiceNumber, matterName: (matter as any)?.name || null, debtorNames, totalIncGst, priorPaid,
    },
  };

  return { receiptNumber: receipt.receipt_number || 'receipt', input };
}
