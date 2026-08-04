// lib/trust/hydrateTrustLedger.ts
// "Load one matter's whole Trust Transactions history + everything the
// printable ledger PDF needs" -- grouped by trust account (a matter could
// in principle have entries against more than one), each section carrying
// its own running Debit/Credit/Balance rows plus a "Multi Amount" column
// showing the full deposit total when a row's receipt_number is shared
// across other matters (DepositFundsModal.tsx's multi-matter split).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateTrustLedgerPdfInput, TrustLedgerSection, TrustLedgerRow } from "./generateTrustLedgerPdf";
import { resolveMatterNumbers } from "./resolveMatterNumbers";

type ValueRow = { record_id: string; field_id: string; value_text: string | null; value_number: number | null; value_date: string | null; value_boolean: boolean | null; value_record_id: string | null };

function describe(row: Record<string, any>, matterName: string): string {
  const type = row.type || '';
  const who = row.payor_payee || '';
  if (type === 'Deposit') return who ? `Deposit from ${who}` : type;
  if (type?.startsWith('Withdrawal')) return who ? `Payment to ${who}` : type;
  if (type === 'Journal Transfer') return who ? `Transfer (${who})` : type;
  return type || '—';
}

export interface HydratedTrustLedger {
  matterName: string;
  input: GenerateTrustLedgerPdfInput;
}

export async function hydrateTrustLedgerForRender(
  admin: SupabaseClient, matterId: string, companyId: string
): Promise<HydratedTrustLedger | null> {
  const { data: matter } = await admin.from('projects').select('id, name').eq('id', matterId).maybeSingle();
  if (!matter) return null;
  const matterNumber = (await resolveMatterNumbers(admin, companyId, [matterId])).get(matterId) || null;

  const { data: companyRow } = await admin.from('companies').select('name, abn, logo_url').eq('id', companyId).maybeSingle();
  let logoBytes: Uint8Array | null = null;
  let logoIsPng = true;
  if (companyRow?.logo_url) {
    try {
      const res = await fetch(companyRow.logo_url);
      if (res.ok) { logoBytes = new Uint8Array(await res.arrayBuffer()); logoIsPng = !/\.jpe?g(\?|$)/i.test(companyRow.logo_url); }
    } catch { /* logo fetch failing shouldn't block the ledger */ }
  }
  const company = { name: companyRow?.name || '', abn: companyRow?.abn || null, logoBytes, logoIsPng };

  const { data: table } = await admin
    .from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'trust-transactions').is('deleted_at', null).maybeSingle();
  if (!table) return null;

  const { data: fields } = await admin
    .from('company_table_fields').select('id, field_key').eq('table_id', table.id).is('deleted_at', null);
  const fieldKeyById = new Map((fields || []).map(f => [f.id, f.field_key]));
  const matterFieldId = (fields || []).find(f => f.field_key === 'matter')?.id;
  if (!matterFieldId) return { matterName: matter.name, input: { matterNumber, matterName: matter.name, sections: [], company } };

  const { data: matterValues } = await admin.from('company_table_values').select('record_id').eq('field_id', matterFieldId).eq('value_record_id', matterId);
  const recordIds = [...new Set((matterValues || []).map(v => v.record_id))];
  if (!recordIds.length) return { matterName: matter.name, input: { matterNumber, matterName: matter.name, sections: [], company } };

  const { data: liveRecords } = await admin.from('company_table_records').select('id').eq('table_id', table.id).in('id', recordIds).is('deleted_at', null);
  const liveIds = (liveRecords || []).map(r => r.id);
  if (!liveIds.length) return { matterName: matter.name, input: { matterNumber, matterName: matter.name, sections: [], company } };

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

  // Multi Amount -- for a receipt_number shared with OTHER matters, the
  // full original deposit total (not just this matter's own allocated
  // slice). One extra query per distinct shared receipt number found.
  const receiptNumbers = [...new Set(rows.map(r => r.receipt_number).filter(Boolean))];
  const multiTotals = new Map<string, number>();
  if (receiptNumbers.length) {
    const receiptFieldId = (fields || []).find(f => f.field_key === 'receipt_number')?.id;
    const inFieldId = (fields || []).find(f => f.field_key === 'amount_in')?.id;
    if (receiptFieldId && inFieldId) {
      for (const num of receiptNumbers) {
        const { data: sharedRows } = await admin.from('company_table_values').select('record_id').eq('field_id', receiptFieldId).eq('value_text', num);
        const sharedIds = [...new Set((sharedRows || []).map(r => r.record_id))];
        if (sharedIds.length <= 1) continue;
        const { data: amounts } = await admin.from('company_table_values').select('value_number').eq('field_id', inFieldId).in('record_id', sharedIds);
        const total = (amounts || []).reduce((s, a) => s + (Number(a.value_number) || 0), 0);
        if (total > 0) multiTotals.set(num, total);
      }
    }
  }

  // Trust account names for section headers.
  const accountIds = [...new Set(rows.map(r => r.trust_account).filter(Boolean))];
  const accountNameById = new Map<string, string>();
  if (accountIds.length) {
    const { data: accountsTable } = await admin.from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'trust-accounts').is('deleted_at', null).maybeSingle();
    if (accountsTable) {
      const { data: nameField } = await admin.from('company_table_fields').select('id').eq('table_id', accountsTable.id).eq('field_key', 'account_name').maybeSingle();
      if (nameField) {
        const { data: nameValues } = await admin.from('company_table_values').select('record_id, value_text').eq('field_id', nameField.id).in('record_id', accountIds);
        for (const nv of nameValues || []) accountNameById.set(nv.record_id, nv.value_text || 'Trust Account');
      }
    }
  }

  const bySection = new Map<string, TrustLedgerRow[]>();
  for (const r of rows) {
    const key = r.trust_account || 'unassigned';
    if (!bySection.has(key)) bySection.set(key, []);
    bySection.get(key)!.push({
      transactionDate: r.date || null, enteredDate: null, // enteredDate filled in below from created_at
      reference: r.bank_reference || r.cheque_number || null,
      description: describe(r, matter.name),
      reason: r.purpose || null,
      paidBy: Number(r.amount_in) > 0 ? r.payor_payee || null : null,
      paidTo: Number(r.amount_out) > 0 ? r.payor_payee || null : null,
      multiAmount: r.receipt_number && multiTotals.has(r.receipt_number) ? multiTotals.get(r.receipt_number)! : null,
      debit: Number(r.amount_out) || 0,
      credit: Number(r.amount_in) || 0,
      balance: Number(r.running_balance) || 0,
    });
  }

  // created_at (Entered Date) isn't in company_table_values (it's on the
  // record row itself) -- fetch alongside and merge in by record id order.
  const { data: recordMeta } = await admin.from('company_table_records').select('id, created_at').in('id', liveIds);
  const createdAtById = new Map((recordMeta || []).map(r => [r.id, r.created_at]));
  const idsBySection = new Map<string, string[]>();
  for (const [id, values] of byRecord) {
    const key = values.trust_account || 'unassigned';
    if (!idsBySection.has(key)) idsBySection.set(key, []);
    idsBySection.get(key)!.push(id);
  }
  for (const [key, ids] of idsBySection) {
    const section = bySection.get(key)!;
    ids.forEach((id, i) => { section[i].enteredDate = createdAtById.get(id) || null; });
  }

  const sections: TrustLedgerSection[] = [...bySection.entries()].map(([accountId, sectionRows]) => ({
    trustAccountName: accountId === 'unassigned' ? 'Trust Account' : (accountNameById.get(accountId) || 'Trust Account'),
    rows: sectionRows.sort((a, b) => String(a.transactionDate || '').localeCompare(String(b.transactionDate || ''))),
  }));

  return { matterName: matter.name, input: { matterNumber, matterName: matter.name, sections, company } };
}
