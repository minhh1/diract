// lib/trust/hydrateBankReconciliation.ts
// Loads one Bank Reconciliations record + everything the printable PDF
// needs: the summary figures (recomputed the same way
// BankReconciliationTab.tsx computes them live) and the Reconciled
// Receipts/Payments line items -- every Trust Transactions row whose
// `reconciled_in` points at this reconciliation (set once, atomically, by
// mark_trust_transactions_reconciled() at the moment "Reconcile" is
// clicked -- see 20260731130000_bank_reconciliation_workflow.sql).
//
// "Unbanked receipts" / "unpresented payments" reflect whichever
// Trust Transactions rows are dated on/before this period but still have no
// reconciled_in at all -- correct for the common case of reconciling
// strictly in period order; a row reconciled by a LATER period after this
// one was printed won't retroactively change this PDF once generated
// (reconciled_in never gets rewritten either way).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GenerateBankReconciliationPdfInput, BankReconciliationLine } from "./generateBankReconciliationPdf";

type ValueRow = { record_id: string; field_id: string; value_text: string | null; value_number: number | null; value_date: string | null; value_boolean: boolean | null; value_record_id: string | null };

function describe(row: Record<string, any>): string {
  const type = row.type || '';
  const who = row.payor_payee || '';
  const matter = row.matterName || '';
  if (type === 'Deposit') return who ? `Deposit from ${who}` : type;
  if (type?.startsWith('Withdrawal')) return who ? `Payment to ${who}${matter ? ` for ${matter}` : ''}` : type;
  if (type === 'Journal Transfer') return matter ? `Transfer (${matter})` : type;
  return type || '-';
}

export interface HydratedBankReconciliation {
  input: GenerateBankReconciliationPdfInput;
}

export async function hydrateBankReconciliationForRender(
  admin: SupabaseClient, reconciliationId: string, companyId: string
): Promise<HydratedBankReconciliation | null> {
  const { data: reconTable } = await admin
    .from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'bank-reconciliations').is('deleted_at', null).maybeSingle();
  if (!reconTable) return null;

  const { data: reconRecord } = await admin
    .from('company_table_records').select('id').eq('id', reconciliationId).eq('table_id', reconTable.id).is('deleted_at', null).maybeSingle();
  if (!reconRecord) return null;

  const { data: reconFields } = await admin.from('company_table_fields').select('id, field_key').eq('table_id', reconTable.id).is('deleted_at', null);
  const reconFieldKeyById = new Map((reconFields || []).map(f => [f.id, f.field_key]));
  const { data: reconValues } = await admin
    .from('company_table_values')
    .select('field_id, value_text, value_number, value_date, value_boolean, value_record_id')
    .eq('record_id', reconciliationId);
  const recon: Record<string, any> = {};
  for (const v of (reconValues || []) as Omit<ValueRow, 'record_id'>[]) {
    const key = reconFieldKeyById.get((v as any).field_id);
    if (!key) continue;
    recon[key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
  }

  const trustAccountId: string | null = recon.trust_account || null;
  const periodStart: string | null = recon.period_start || null;
  const periodEnd: string | null = recon.period_end || null;

  const { data: companyRow } = await admin.from('companies').select('name, abn').eq('id', companyId).maybeSingle();
  const company = { name: companyRow?.name || '', abn: companyRow?.abn || null };

  let trustAccountName = 'Trust Account';
  if (trustAccountId) {
    const { data: accountsTable } = await admin.from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'trust-accounts').is('deleted_at', null).maybeSingle();
    if (accountsTable) {
      const { data: nameField } = await admin.from('company_table_fields').select('id').eq('table_id', accountsTable.id).eq('field_key', 'account_name').maybeSingle();
      if (nameField) {
        const { data: nv } = await admin.from('company_table_values').select('value_text').eq('field_id', nameField.id).eq('record_id', trustAccountId).maybeSingle();
        if (nv?.value_text) trustAccountName = nv.value_text;
      }
    }
  }

  const { data: table } = await admin
    .from('company_tables').select('id').eq('company_id', companyId).eq('slug', 'trust-transactions').is('deleted_at', null).maybeSingle();

  const empty: GenerateBankReconciliationPdfInput = {
    trustAccountName, periodStart, periodEnd,
    openingCashBookBalance: 0, receiptsInPeriod: 0, paymentsInPeriod: 0, cashBookBalance: 0,
    ledgerBalance: 0, bankStatementBalance: Number(recon.bank_statement_balance) || 0,
    unbankedReceipts: 0, unpresentedPayments: 0, reconciliationBalance: Number(recon.bank_statement_balance) || 0,
    receiptRows: [], paymentRows: [],
    preparedBy: recon.prepared_by || null, preparedAt: recon.prepared_at || null,
    reviewedBy: recon.reviewed_by || null, reviewedAt: recon.reviewed_at || null,
    company,
  };
  if (!table || !trustAccountId) return { input: empty };

  const { data: fields } = await admin.from('company_table_fields').select('id, field_key').eq('table_id', table.id).is('deleted_at', null);
  const fieldKeyById = new Map((fields || []).map(f => [f.id, f.field_key]));
  const accountFieldId = (fields || []).find(f => f.field_key === 'trust_account')?.id;
  if (!accountFieldId) return { input: empty };

  const { data: accountValueRows } = await admin.from('company_table_values').select('record_id').eq('field_id', accountFieldId).eq('value_record_id', trustAccountId);
  const candidateIds = [...new Set((accountValueRows || []).map(v => v.record_id))];
  if (!candidateIds.length) return { input: empty };

  const { data: liveRecords } = await admin.from('company_table_records').select('id').eq('table_id', table.id).in('id', candidateIds).is('deleted_at', null);
  const liveIds = (liveRecords || []).map(r => r.id);
  if (!liveIds.length) return { input: empty };

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

  // Matter names, for the Description column (mirrors describe() in
  // TrustTransactionsTab.tsx/hydrateTrustLedger.ts).
  const matterIds = [...new Set([...byRecord.values()].map(r => r.matter).filter(Boolean))];
  const matterNameById = new Map<string, string>();
  if (matterIds.length) {
    const { data: matters } = await admin.from('projects').select('id, name').in('id', matterIds);
    for (const m of matters || []) matterNameById.set(m.id, m.name);
  }

  let openingCashBookBalance = 0, ledgerBalance = 0, receiptsInPeriod = 0, paymentsInPeriod = 0;
  let unbankedReceipts = 0, unpresentedPayments = 0;
  const receiptRows: BankReconciliationLine[] = [];
  const paymentRows: BankReconciliationLine[] = [];

  for (const [id, r] of byRecord) {
    const amountIn = Number(r.amount_in) || 0;
    const amountOut = Number(r.amount_out) || 0;
    const date: string | null = r.date || null;

    if (periodStart && date && date < periodStart) openingCashBookBalance += amountIn - amountOut;
    if (!periodEnd || (date && date <= periodEnd)) {
      ledgerBalance += amountIn - amountOut;
      if (periodStart && date && date >= periodStart) { receiptsInPeriod += amountIn; paymentsInPeriod += amountOut; }

      if (r.reconciled_in === reconciliationId) {
        const line: BankReconciliationLine = {
          date, description: describe({ ...r, matterName: r.matter ? matterNameById.get(r.matter) : null }),
          reference: r.receipt_number || r.cheque_number || null,
          amount: amountIn > 0 ? amountIn : amountOut,
        };
        if (amountIn > 0) receiptRows.push(line); else if (amountOut > 0) paymentRows.push(line);
      } else if (!r.reconciled_in) {
        unbankedReceipts += amountIn;
        unpresentedPayments += amountOut;
      }
    }
  }

  const cashBookBalance = openingCashBookBalance + receiptsInPeriod - paymentsInPeriod;
  const bankStatementBalance = Number(recon.bank_statement_balance) || 0;
  const reconciliationBalance = bankStatementBalance + unbankedReceipts - unpresentedPayments;

  const sortByDate = (a: BankReconciliationLine, b: BankReconciliationLine) => String(a.date || '').localeCompare(String(b.date || ''));

  return {
    input: {
      trustAccountName, periodStart, periodEnd,
      openingCashBookBalance, receiptsInPeriod, paymentsInPeriod, cashBookBalance,
      ledgerBalance, bankStatementBalance, unbankedReceipts, unpresentedPayments, reconciliationBalance,
      receiptRows: receiptRows.sort(sortByDate), paymentRows: paymentRows.sort(sortByDate),
      preparedBy: recon.prepared_by || null, preparedAt: recon.prepared_at || null,
      reviewedBy: recon.reviewed_by || null, reviewedAt: recon.reviewed_at || null,
      company,
    },
  };
}
