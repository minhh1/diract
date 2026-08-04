// lib/trust/hydrateTrustCheque.ts
// "Load one Trust Transactions withdrawal-by-cheque row + everything the
// cheque PDF needs" -- same single-record hydration shape as
// lib/invoices/hydrateReceipt.ts, just reading cheque_number/payor_payee/
// amount_out instead of the operating-account Receipts fields.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateTrustChequePdfInput } from "./generateTrustChequePdf";
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

export interface HydratedTrustCheque {
  chequeNumber: string;
  input: GenerateTrustChequePdfInput;
}

export async function hydrateTrustChequeForRender(
  admin: SupabaseClient, recordId: string, companyId: string
): Promise<HydratedTrustCheque | null> {
  const { data: record } = await admin
    .from('company_table_records').select('id, table_id').eq('id', recordId).eq('company_id', companyId).is('deleted_at', null).maybeSingle();
  if (!record) return null;

  const { data: fields } = await admin
    .from('company_table_fields').select('id, field_key').eq('table_id', record.table_id).is('deleted_at', null);
  const fieldKeyById = new Map((fields || []).map(f => [f.id, f.field_key]));

  const { data: valueRows } = await admin
    .from('company_table_values')
    .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
    .eq('record_id', recordId);
  const values = hydrateValues((valueRows || []) as ValueRow[], fieldKeyById);

  const { data: matter } = values.matter
    ? await admin.from('projects').select('name').eq('id', values.matter).maybeSingle()
    : { data: null };
  const matterNumberById = values.matter ? await resolveMatterNumbers(admin, companyId, [values.matter]) : new Map<string, string>();

  const { data: company } = await admin.from('companies').select('name, abn, invoice_settings, logo_url').eq('id', companyId).maybeSingle();
  const invoiceSettings = (company?.invoice_settings as any) || {};
  let logoBytes: Uint8Array | null = null;
  let logoIsPng = true;
  if (company?.logo_url) {
    try {
      const res = await fetch(company.logo_url);
      if (res.ok) { logoBytes = new Uint8Array(await res.arrayBuffer()); logoIsPng = !/\.jpe?g(\?|$)/i.test(company.logo_url); }
    } catch { /* logo fetch failing shouldn't block the cheque */ }
  }

  const chequeNumber = values.cheque_number || 'cheque';
  const input: GenerateTrustChequePdfInput = {
    company: { name: company?.name || '', abn: company?.abn || null, address: invoiceSettings.firmAddress || null, logoBytes, logoIsPng },
    cheque: {
      chequeNumber, date: values.date || null, payTo: values.payor_payee || null,
      amount: Number(values.amount_out) || 0, memo: values.purpose || null,
      matterNumber: values.matter ? (matterNumberById.get(values.matter) || null) : null,
      matterName: (matter as any)?.name || null,
    },
  };

  return { chequeNumber, input };
}
