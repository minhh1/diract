// lib/trust/hydrateTrustPayment.ts
// "Load one Trust Transactions withdrawal row + everything the payment
// advice PDF needs" -- same single-record hydration shape as
// lib/trust/hydrateTrustCheque.ts, generalised to cover Bank Transfer/
// Direct Debit/Trust Cheque as well as Bank Cheque.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateTrustPaymentPdfInput } from "./generateTrustPaymentPdf";
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

export interface HydratedTrustPayment {
  paymentNumber: string;
  input: GenerateTrustPaymentPdfInput;
}

export async function hydrateTrustPaymentForRender(
  admin: SupabaseClient, recordId: string, companyId: string
): Promise<HydratedTrustPayment | null> {
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

  let trustAccountName: string | null = null;
  if (values.trust_account) {
    const { data: accountRecord } = await admin.from('company_table_records').select('table_id').eq('id', values.trust_account).maybeSingle();
    if (accountRecord) {
      const { data: nameField } = await admin.from('company_table_fields').select('id').eq('table_id', accountRecord.table_id).eq('field_key', 'account_name').is('deleted_at', null).maybeSingle();
      if (nameField) {
        const { data: nameValue } = await admin.from('company_table_values').select('value_text').eq('record_id', values.trust_account).eq('field_id', nameField.id).maybeSingle();
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
    } catch { /* logo fetch failing shouldn't block the payment advice */ }
  }

  const paymentNumber = values.payment_number || 'payment';
  const input: GenerateTrustPaymentPdfInput = {
    company: { name: company?.name || '', abn: company?.abn || null, address: invoiceSettings.firmAddress || null, logoBytes, logoIsPng },
    payment: {
      paymentNumber, date: values.date || null, payTo: values.payor_payee || null,
      amount: Number(values.amount_out) || 0, paymentType: values.payment_method || null,
      transferType: values.transfer_type || null, accountName: values.account_name || null,
      bsb: values.payee_bsb || null, accountNumber: values.account_number || null,
      reason: values.purpose || null, matterName: (matter as any)?.name || null,
      matterNumber: values.matter ? (matterNumberById.get(values.matter) || null) : null,
      trustAccountName,
    },
  };

  return { paymentNumber, input };
}
