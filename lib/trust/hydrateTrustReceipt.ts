// lib/trust/hydrateTrustReceipt.ts
// "Load every Trust Transactions row sharing one receipt number + everything
// the PDF renderer needs" -- mirrors lib/invoices/hydrateReceipt.ts's shape,
// but keyed by receipt_number (a text value), not a single record id, since
// one trust receipt can cover several matters (DepositFundsModal.tsx's
// shared-receipt-number deposit split).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateTrustReceiptPdfInput } from "./generateTrustReceiptPdf";
import { resolveMatterNumbers } from "./resolveMatterNumbers";

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

export interface HydratedTrustReceipt {
  receiptNumber: string;
  input: GenerateTrustReceiptPdfInput;
}

export async function hydrateTrustReceiptForRender(
  admin: SupabaseClient, receiptNumber: string, companyId: string
): Promise<HydratedTrustReceipt | null> {
  const { data: table } = await admin
    .from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'trust-transactions').is('deleted_at', null).maybeSingle();
  if (!table) return null;

  const { data: fields } = await admin
    .from('company_table_fields').select('id, field_key').eq('table_id', table.id).is('deleted_at', null);
  const fieldKeyById = new Map((fields || []).map(f => [f.id, f.field_key]));
  const receiptFieldId = (fields || []).find(f => f.field_key === 'receipt_number')?.id;
  if (!receiptFieldId) return null;

  const { data: receiptValues } = await admin
    .from('company_table_values').select('record_id').eq('field_id', receiptFieldId).eq('value_text', receiptNumber);
  const recordIds = [...new Set((receiptValues || []).map(v => v.record_id))];
  if (!recordIds.length) return null;

  const { data: liveRecords } = await admin
    .from('company_table_records').select('id').eq('table_id', table.id).eq('company_id', companyId).in('id', recordIds).is('deleted_at', null);
  const liveIds = (liveRecords || []).map(r => r.id);
  if (!liveIds.length) return null;

  const { data: allValueRows } = await admin
    .from('company_table_values')
    .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
    .in('record_id', liveIds);
  const byRecord = new Map<string, Record<string, any>>();
  for (const id of liveIds) byRecord.set(id, {});
  for (const v of (allValueRows || []) as ValueRow[]) {
    const key = fieldKeyById.get(v.field_id);
    if (!key) continue;
    byRecord.get(v.record_id)![key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
  }
  const rows = [...byRecord.values()];
  const first = rows[0];

  const matterIds = [...new Set(rows.map(r => r.matter).filter(Boolean))];
  const { data: matterRows } = matterIds.length
    ? await admin.from('projects').select('id, name').in('id', matterIds)
    : { data: [] as { id: string; name: string }[] };
  const matterNameById = new Map((matterRows || []).map(m => [m.id, m.name]));
  const matterNumberById = await resolveMatterNumbers(admin, companyId, matterIds);

  const trustAccountId = first.trust_account;
  let trustAccountName: string | null = null;
  if (trustAccountId) {
    const { data: accountsTable } = await admin.from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'trust-accounts').is('deleted_at', null).maybeSingle();
    if (accountsTable) {
      const { data: nameField } = await admin.from('company_table_fields').select('id').eq('table_id', accountsTable.id).eq('field_key', 'account_name').maybeSingle();
      if (nameField) {
        const { data: nameValue } = await admin.from('company_table_values').select('value_text').eq('record_id', trustAccountId).eq('field_id', nameField.id).maybeSingle();
        trustAccountName = nameValue?.value_text || null;
      }
    }
  }

  const { data: company } = await admin.from('companies').select('name, abn, invoice_settings, logo_url').eq('id', companyId).maybeSingle();
  const invoiceSettings = (company?.invoice_settings as any) || {};
  let logoBytes: Uint8Array | null = null;
  let logoIsPng = true;
  if (company?.logo_url) {
    try {
      const res = await fetch(company.logo_url);
      if (res.ok) { logoBytes = new Uint8Array(await res.arrayBuffer()); logoIsPng = !/\.jpe?g(\?|$)/i.test(company.logo_url); }
    } catch { /* logo fetch failing shouldn't block the receipt */ }
  }

  const isDeposit = rows.some(r => Number(r.amount_in) > 0);
  const input: GenerateTrustReceiptPdfInput = {
    company: { name: company?.name || '', abn: company?.abn || null, address: invoiceSettings.firmAddress || null, logoBytes, logoIsPng },
    receipt: {
      receiptNumber, date: first.date || null, paymentMethod: first.payment_method || null,
      payorPayee: first.payor_payee || null, purpose: first.purpose || null,
      trustAccountName, isDeposit,
    },
    lines: rows.map(r => ({
      matterNumber: r.matter ? (matterNumberById.get(r.matter) || null) : null,
      matterName: r.matter ? (matterNameById.get(r.matter) || 'Unknown matter') : '—',
      amount: Number(r.amount_in) || Number(r.amount_out) || 0,
    })),
    total: rows.reduce((s, r) => s + (Number(r.amount_in) || 0) + (Number(r.amount_out) || 0), 0),
  };

  return { receiptNumber, input };
}
