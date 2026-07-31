"use client";

// Trust Account page's "Bank Reconciliation" tab -- the full draft/checklist
// /reconcile workflow. Reads the EXISTING Trust Transactions ledger table
// (never a new data structure) and its own bespoke, non-ledger
// Bank Reconciliations table (period/status/bank_statement_balance/
// prepared+reviewed by+at). Ticking a row off and clicking "Reconcile" links
// it via mark_trust_transactions_reconciled() -- Trust Transactions is
// append-only (see 20260731130000_bank_reconciliation_workflow.sql's header
// comment), so that RPC is the only way `reconciled_in` is ever set, and
// only ever once per row.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X, Printer, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createRecord as createCustomRecord, updateRecord as updateCustomRecord, deleteRecord as deleteCustomRecord } from "@/lib/services/customTableService";
import { useCustomTable, type CustomTableRecord } from "@/lib/hooks/useCustomTable";
import PdfPreviewModal from "../dashboard/PdfPreviewModal";

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU'); } catch { return d; }
}

function todayStr(): string { return new Date().toISOString().slice(0, 10); }

function describe(r: CustomTableRecord): string {
  const type = r.values.type || '';
  const who = r.values.payor_payee || '';
  const matter = r.displayValues?.matter || '';
  if (type === 'Deposit') return who ? `${type} from ${who}` : type;
  if (type?.startsWith('Withdrawal')) return who ? `Payment to ${who}${matter ? ` for ${matter}` : ''}` : type;
  if (type === 'Journal Transfer') return matter ? `Transfer for ${matter}` : type;
  return type || '—';
}

export default function BankReconciliationTab({
  companyId, userId, trustAccountId, trustAccount, trustTable, records,
}: {
  companyId: string; userId: string; trustAccountId: string;
  trustAccount: CustomTableRecord | null;
  trustTable: ReturnType<typeof useCustomTable>;
  records: CustomTableRecord[];
}) {
  const reconTable = useCustomTable('bank-reconciliations');

  const [view, setView] = useState<'list' | 'workspace'>('list');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState(todayStr());
  const [bankBalanceInput, setBankBalanceInput] = useState('');
  const [preparedBy, setPreparedBy] = useState('');
  const [subTab, setSubTab] = useState<'main' | 'adjustments'>('main');
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [isPartner, setIsPartner] = useState(false);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle();
      if (data?.full_name) setPreparedBy(prev => prev || data.full_name);
    })();
  }, [userId]);

  // Sign-off is only for a Partner -- entities.timekeeper_level (a custom
  // field, see supabase/template_law_firm_seed.sql's "Law-specific fields on
  // entities") on the caller's OWN Staff entity, not a generic admin flag.
  // This only gates whether the button is shown; the RPC re-checks it
  // server-side (sign_bank_reconciliation, see
  // 20260731140000_bank_reconciliation_partner_signoff.sql) since a client
  // check alone isn't real authorization.
  useEffect(() => {
    (async () => {
      const { data: field } = await supabase
        .from('company_custom_fields').select('id')
        .eq('company_id', companyId).eq('table_name', 'entities').eq('field_key', 'timekeeper_level').is('deleted_at', null).maybeSingle();
      if (!field) return;
      const { data: entity } = await supabase
        .from('entities').select('id').eq('company_id', companyId).eq('linked_profile_id', userId).is('deleted_at', null).maybeSingle();
      if (!entity) return;
      const { data: value } = await supabase
        .from('company_custom_field_values').select('value_text').eq('field_id', field.id).eq('record_id', entity.id).maybeSingle();
      setIsPartner(value?.value_text === 'Partner');
    })();
  }, [companyId, userId]);

  const reconciliations = useMemo(
    () => reconTable.records
      .filter(r => (r.values.trust_account || null) === trustAccountId)
      .sort((a, b) => String(b.values.period_end || '').localeCompare(String(a.values.period_end || ''))),
    [reconTable.records, trustAccountId]
  );

  // Every transaction on this account that's never been linked to a
  // reconciliation, dated on/before the period being worked on -- the
  // checklist.
  const outstanding = useMemo(
    () => records.filter(r => !r.values.reconciled_in && (!periodEnd || String(r.values.date || '') <= periodEnd))
      .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || ''))),
    [records, periodEnd]
  );
  const mainRows = useMemo(() => outstanding.filter(r => r.values.type !== 'Journal Transfer'), [outstanding]);
  const adjustmentRows = useMemo(() => outstanding.filter(r => r.values.type === 'Journal Transfer'), [outstanding]);

  const bankStatementBalance = parseFloat(bankBalanceInput) || 0;

  const summary = useMemo(() => {
    let openingCashBookBalance = 0, receiptsInPeriod = 0, paymentsInPeriod = 0, ledgerBalance = 0;
    let unbankedReceipts = 0, unpresentedPayments = 0;
    for (const r of records) {
      const amountIn = Number(r.values.amount_in) || 0;
      const amountOut = Number(r.values.amount_out) || 0;
      const date = String(r.values.date || '');
      if (periodStart && date && date < periodStart) openingCashBookBalance += amountIn - amountOut;
      if (!periodEnd || (date && date <= periodEnd)) {
        ledgerBalance += amountIn - amountOut;
        if (periodStart && date && date >= periodStart) { receiptsInPeriod += amountIn; paymentsInPeriod += amountOut; }
        if (!r.values.reconciled_in && !checkedIds.has(r.id)) { unbankedReceipts += amountIn; unpresentedPayments += amountOut; }
      }
    }
    const cashBookBalance = openingCashBookBalance + receiptsInPeriod - paymentsInPeriod;
    const reconciliationBalance = bankStatementBalance + unbankedReceipts - unpresentedPayments;
    return { openingCashBookBalance, receiptsInPeriod, paymentsInPeriod, cashBookBalance, ledgerBalance, unbankedReceipts, unpresentedPayments, reconciliationBalance };
  }, [records, periodStart, periodEnd, bankStatementBalance, checkedIds]);

  const balanced = Math.abs(summary.reconciliationBalance - summary.cashBookBalance) < 0.005;

  const startNew = () => {
    setDraftId(null);
    setPeriodStart('');
    setPeriodEnd(todayStr());
    setBankBalanceInput('');
    setCheckedIds(new Set());
    setSubTab('main');
    setError(null);
    setView('workspace');
  };

  const continueDraft = (r: CustomTableRecord) => {
    setDraftId(r.id);
    setPeriodStart(r.values.period_start || '');
    setPeriodEnd(r.values.period_end || todayStr());
    setBankBalanceInput(r.values.bank_statement_balance != null ? String(r.values.bank_statement_balance) : '');
    if (r.values.prepared_by) setPreparedBy(r.values.prepared_by);
    setCheckedIds(new Set());
    setSubTab('main');
    setError(null);
    setView('workspace');
  };

  const toggleChecked = (id: string) => setCheckedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const draftValues = () => ({
    trust_account: trustAccountId,
    period_start: periodStart || null,
    period_end: periodEnd || null,
    bank_statement_balance: bankStatementBalance,
    prepared_by: preparedBy.trim() || null,
  });

  const handleSaveDraft = async () => {
    if (!periodStart || !periodEnd) { setError('Set the period start and end dates first.'); return; }
    setSaving(true); setError(null);
    const values = { ...draftValues(), status: 'Draft' };
    const result = draftId
      ? await updateCustomRecord(draftId, reconTable.tableDef!.id, companyId, values, reconTable.fields)
      : await createCustomRecord(reconTable.tableDef!.id, companyId, userId, values, reconTable.fields);
    setSaving(false);
    if (result && 'error' in result) { setError(result.error); return; }
    reconTable.refetch();
    setView('list');
  };

  const handleCancelDraft = async () => {
    if (draftId) { setSaving(true); await deleteCustomRecord(draftId); setSaving(false); reconTable.refetch(); }
    setView('list');
  };

  const handleReconcile = async () => {
    if (!periodStart || !periodEnd) { setError('Set the period start and end dates first.'); return; }
    if (!preparedBy.trim()) { setError('Enter who prepared this reconciliation.'); return; }
    if (!balanced) { setError('This reconciliation is out of balance. Tick off items until the Reconciliation Balance matches the Cash Book Balance.'); return; }

    setSaving(true); setError(null);
    const values = { ...draftValues(), status: 'Reconciled', prepared_at: todayStr() };
    const result = draftId
      ? await updateCustomRecord(draftId, reconTable.tableDef!.id, companyId, values, reconTable.fields)
      : await createCustomRecord(reconTable.tableDef!.id, companyId, userId, values, reconTable.fields);
    if (result && 'error' in result) { setSaving(false); setError(result.error); return; }
    const reconciliationId = draftId || (result as { id: string }).id;

    if (checkedIds.size) {
      const { error: rpcError } = await supabase.rpc('mark_trust_transactions_reconciled', {
        p_table_id: trustTable.tableDef!.id,
        p_record_ids: [...checkedIds],
        p_reconciliation_id: reconciliationId,
      });
      if (rpcError) { setSaving(false); setError(rpcError.message); return; }
    }

    setSaving(false);
    trustTable.refetch();
    reconTable.refetch();
    setView('list');
    setPreviewId(reconciliationId);
  };

  const handleSign = async (r: CustomTableRecord) => {
    if (!window.confirm('Confirm and sign this reconciliation as reviewed? This records your name against it and can\'t be undone.')) return;
    setSigningId(r.id);
    setSignError(null);
    const { error: rpcError } = await supabase.rpc('sign_bank_reconciliation', { p_reconciliation_id: r.id });
    setSigningId(null);
    if (rpcError) {
      setSignError(rpcError.message.includes('NOT_A_PARTNER')
        ? 'Only a Partner (Timekeeper Level on your Staff record) can sign off a reconciliation.'
        : rpcError.message.includes('ALREADY_SIGNED')
        ? 'This reconciliation has already been signed.'
        : rpcError.message);
      return;
    }
    reconTable.refetch();
  };

  if (reconTable.loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-slate-300" /></div>;
  }

  if (view === 'list') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Reconciliations ({trustAccount?.values.account_name || 'Trust Account'})</p>
          <button onClick={startNew} className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white rounded-full text-[11px] font-bold hover:bg-teal-800 transition-all">
            <Plus size={13} /> New Reconciliation
          </button>
        </div>

        {signError && <p className="text-[11px] text-rose-600 font-medium">{signError}</p>}

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                <th className="text-left px-4 py-2.5">Period</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-right px-4 py-2.5">Bank Statement Balance</th>
                <th className="text-left px-4 py-2.5">Prepared By</th>
                <th className="text-left px-4 py-2.5">Reviewed By</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {reconciliations.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-[11px] text-slate-300 italic">No reconciliations for this account yet</td></tr>
              ) : reconciliations.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{formatDate(r.values.period_start)} – {formatDate(r.values.period_end)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest ${r.values.status === 'Reconciled' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                      {r.values.status || 'Draft'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{money(Number(r.values.bank_statement_balance) || 0)}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.values.prepared_by || '—'}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.values.reviewed_by ? (
                      <span title={`Signed ${formatDate(r.values.reviewed_at)}`}>{r.values.reviewed_by} <span className="text-emerald-500">✓</span></span>
                    ) : r.values.status !== 'Reconciled' ? '—' : isPartner ? (
                      <button onClick={() => handleSign(r)} disabled={signingId === r.id} className="text-teal-700 font-bold text-[10px] hover:underline disabled:opacity-50">
                        {signingId === r.id ? 'Signing…' : 'Confirm & Sign'}
                      </button>
                    ) : (
                      <span className="text-amber-500 text-[10px] font-medium">Awaiting Partner sign-off</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right whitespace-nowrap">
                    {r.values.status === 'Reconciled' ? (
                      <button onClick={() => setPreviewId(r.id)} title="Print" className="p-1.5 text-slate-300 hover:text-teal-600"><Printer size={14} /></button>
                    ) : (
                      <button onClick={() => continueDraft(r)} className="px-3 py-1 rounded-full text-[10px] font-bold text-teal-700 hover:bg-teal-50">Continue</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {previewId && (
          <PdfPreviewModal
            src={`/api/bank-reconciliations/${previewId}/pdf`}
            downloadSrc={`/api/bank-reconciliations/${previewId}/pdf?download=1`}
            title="Bank Reconciliation"
            onClose={() => setPreviewId(null)}
          />
        )}
      </div>
    );
  }

  const activeRows = subTab === 'main' ? mainRows : adjustmentRows;

  return (
    <div className="space-y-4">
      <button onClick={() => setView('list')} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-700">
        <ChevronLeft size={14} /> Back to reconciliations
      </button>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 grid grid-cols-3 gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Period start</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium outline-none" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Period end</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[13px] font-medium outline-none" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Bank statement balance</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-[13px]">$</span>
                <input type="number" step="0.01" value={bankBalanceInput} onChange={e => setBankBalanceInput(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 pl-7 pr-3.5 text-[13px] font-medium outline-none" placeholder="0.00" />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {(['main', 'adjustments'] as const).map(t => (
              <button key={t} onClick={() => setSubTab(t)}
                className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold transition-all ${subTab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500'}`}>
                {t === 'main' ? `Receipts & Payments (${mainRows.length})` : `Adjustments (${adjustmentRows.length})`}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <th className="px-4 py-2.5 w-8" />
                  <th className="text-left px-2 py-2.5">Date</th>
                  <th className="text-left px-2 py-2.5">Description</th>
                  <th className="text-left px-2 py-2.5">Ref.</th>
                  <th className="text-right px-4 py-2.5">Debit</th>
                  <th className="text-right px-4 py-2.5">Credit</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-[11px] text-slate-300 italic">Nothing outstanding here</td></tr>
                ) : activeRows.map(r => (
                  <tr key={r.id} onClick={() => toggleChecked(r.id)} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer">
                    <td className="px-4 py-2.5">
                      <input type="checkbox" checked={checkedIds.has(r.id)} onChange={() => toggleChecked(r.id)} onClick={e => e.stopPropagation()}
                        className="w-3.5 h-3.5 accent-teal-700" />
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">{formatDate(r.values.date)}</td>
                    <td className="px-2 py-2.5 text-slate-700 font-medium">{describe(r)}</td>
                    <td className="px-2 py-2.5 text-slate-500 font-mono text-[11px]">{r.values.receipt_number || r.values.cheque_number || '—'}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{r.values.amount_out ? money(Number(r.values.amount_out)) : ''}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{r.values.amount_in ? money(Number(r.values.amount_in)) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 h-fit space-y-1 sticky top-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Summary</p>
          {[
            ['Opening Cash Book Balance', summary.openingCashBookBalance],
            ['Add: Receipts', summary.receiptsInPeriod],
            ['Less: Payments', -summary.paymentsInPeriod],
          ].map(([label, value]) => (
            <div key={label as string} className="flex items-center justify-between text-[11px] text-slate-500 py-1">
              <span>{label}</span><span>{money(value as number)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between text-[12px] font-bold text-slate-800 py-1.5 border-t border-slate-100 mt-1">
            <span>Cash Book Balance</span><span>{money(summary.cashBookBalance)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 py-1">
            <span>Trust Ledger Balance</span><span>{money(summary.ledgerBalance)}</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 py-1 pt-3">
            <span>Bank Statement Balance</span><span>{money(bankStatementBalance)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 py-1">
            <span>Add: Unbanked Receipts</span><span>{money(summary.unbankedReceipts)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 py-1">
            <span>Less: Unpresented Cheques</span><span>{money(-summary.unpresentedPayments)}</span>
          </div>
          <div className="flex items-center justify-between text-[12px] font-bold text-slate-800 py-1.5 border-t border-slate-100 mt-1">
            <span>Reconciliation Balance</span><span>{money(summary.reconciliationBalance)}</span>
          </div>

          <div className={`mt-2 px-3 py-2 rounded-xl text-[10px] font-bold text-center ${balanced ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {balanced ? 'Balanced' : `Out of balance by ${money(summary.reconciliationBalance - summary.cashBookBalance)}`}
          </div>

          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 mt-3">Prepared by</label>
            <input value={preparedBy} onChange={e => setPreparedBy(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 px-3.5 text-[12px] font-medium outline-none" />
          </div>

          {error && <p className="text-[11px] text-rose-600 font-medium pt-1">{error}</p>}

          <div className="space-y-2 pt-2">
            <button onClick={handleReconcile} disabled={saving} className="w-full py-2.5 bg-teal-700 text-white rounded-full text-[11px] font-bold disabled:opacity-50 flex items-center justify-center gap-2">
              {saving && <Loader2 size={13} className="animate-spin" />} Reconcile
            </button>
            <div className="flex gap-2">
              <button onClick={handleSaveDraft} disabled={saving} className="flex-1 py-2.5 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 disabled:opacity-50">Save Draft</button>
              <button onClick={handleCancelDraft} disabled={saving} className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full text-[11px] font-bold hover:border-rose-300 hover:text-rose-500 disabled:opacity-50 flex items-center justify-center gap-1">
                <X size={12} /> Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
