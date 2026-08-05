"use client";

// The "Trust Account" tab on a matter -- that matter's own trust ledger
// statement (every transaction against it, in date order, with its running
// balance), the per-matter equivalent of the company-wide Payments/Receipts
// Cash Books on /dashboard/trust-account. Auto-seeded onto every Matter for
// companies that have the Law Firm template's Trust Transactions table (see
// RecordDashboard.tsx's loadTabs, gated the same way Finance Model is) --
// replaces the earlier generic 'custom_dashboard' grid version of this tab
// (see supabase/migrations/20260802170000_trust_account_tab.sql, which
// migrated any matter that already had that grid over to this tab_type).
import { useMemo, useState } from "react";
import { Landmark, ExternalLink, Plus, Send, Eye, Ban } from "lucide-react";
import { useCustomTable, type CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { formatDateAU } from "@/lib/formatDate";
import DepositFundsModal from "@/components/trust/DepositFundsModal";
import TrustPaymentModal from "@/components/trust/TrustPaymentModal";
import VoidTransactionModal from "@/components/trust/VoidTransactionModal";
import PdfPreviewModal from "@/components/dashboard/PdfPreviewModal";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

// "Withdrawal - Cheque"/"Withdrawal - EFT" are the ledger's own internal
// type taxonomy (also what insert_ledger_record's auto-numbering CASE and
// the balance-scoping SQL key off) -- shown to a user as "Payment" instead,
// matching how the company-wide Transactions tab already describes these
// rows ("Payment to X"), not the raw internal value.
function displayType(rawType: string | null | undefined): string {
  if (!rawType) return '-';
  return rawType.startsWith('Withdrawal') ? 'Payment' : rawType;
}

export default function TrustAccountTab({ recordId, companyId, userId, isAdmin }: { recordId: string; companyId: string; userId: string; isAdmin: boolean }) {
  const trustTable = useCustomTable('trust-transactions');
  const accountsTable = useCustomTable('trust-accounts');
  const { records, recordsLoading } = trustTable;
  const [modal, setModal] = useState<'deposit' | 'payment' | null>(null);
  const [preview, setPreview] = useState<{ kind: 'receipt' | 'payment'; key: string; label: string } | null>(null);
  const [voidingRecord, setVoidingRecord] = useState<CustomTableRecord | null>(null);

  const activeAccounts = useMemo(
    () => accountsTable.records.filter(r => r.values.is_active !== false),
    [accountsTable.records]
  );
  // Default to whichever trust account this matter's most recent entry used,
  // falling back to the firm's first active account -- there's no "current
  // account" concept threaded down to the matter level (that only exists on
  // the company-wide /dashboard/trust-account page), so this is the same
  // best-effort default that page itself uses when nothing is selected yet.
  const defaultAccountId = useMemo(() => {
    const sorted = [...records].filter(r => String(r.values.matter || '') === recordId)
      .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')));
    return sorted[sorted.length - 1]?.values.trust_account || activeAccounts[0]?.id || null;
  }, [records, recordId, activeAccounts]);

  // The whole trust account's balance (every matter, not just this one) --
  // shown next to Deposit Trust/Trust Payment so a user can see what's
  // actually available in the account before acting, same "unattributed
  // row still counts when there's only one active account" fallback as
  // insert_ledger_record() and app/dashboard/trust-account/page.tsx use.
  const trustAccountBalance = useMemo(() => {
    if (!defaultAccountId) return 0;
    return records
      .filter(r => (r.values.trust_account || null) === defaultAccountId || (activeAccounts.length <= 1 && !r.values.trust_account))
      .reduce((s, r) => s + (Number(r.values.amount_in) || 0) - (Number(r.values.amount_out) || 0), 0);
  }, [records, defaultAccountId, activeAccounts.length]);

  const matterNames = useRecordNames('projects', [recordId]);
  const matterNumbers = useMatterNumbers([recordId]);
  const matterName = matterNames.get(recordId);
  const matterNumber = matterNumbers.get(recordId);
  // "Matter Number - Matter Name", matching how a matter is referenced
  // everywhere else in trust paperwork (cheque/ledger PDFs, the Trust
  // Transactions "Matter No." column) -- a bare name is ambiguous once a
  // firm has more than a handful of matters.
  const matterLabel = matterName ? (matterNumber ? `${matterNumber} - ${matterName}` : matterName) : undefined;

  const entries = useMemo(() => {
    return records
      .filter(r => String(r.values.matter || '') === recordId)
      .slice()
      .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')));
  }, [records, recordId]);

  const clientId = entries.length ? String(entries[entries.length - 1].values.client || '') : '';
  const clientNames = useRecordNames('entities', clientId ? [clientId] : []);

  const totals = entries.reduce((acc, r) => ({
    in: acc.in + (Number(r.values.amount_in) || 0),
    out: acc.out + (Number(r.values.amount_out) || 0),
  }), { in: 0, out: 0 });
  const closingBalance = entries.length ? Number(entries[entries.length - 1].values.running_balance) || 0 : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-teal-50 flex items-center justify-center">
            <Landmark size={18} className="text-teal-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trust Account</p>
            <p className="text-[11px] text-slate-400">Every trust transaction for this matter, with running balance</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {defaultAccountId && (
            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 rounded-full px-3 py-1.5 uppercase tracking-wider">
              Trust Account Balance {aud.format(trustAccountBalance)}
            </span>
          )}
          {defaultAccountId && (
            <>
              <button onClick={() => setModal('deposit')} className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white rounded-full text-[12px] font-semibold hover:bg-teal-800 transition-all">
                <Plus size={13} /> Deposit Trust
              </button>
              <button onClick={() => setModal('payment')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-slate-400 transition-all">
                <Send size={13} /> Trust Payment
              </button>
            </>
          )}
          <a
            href={`/api/trust-ledger/${recordId}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-teal-300 transition-all"
          >
            <ExternalLink size={13} /> Print ledger
          </a>
        </div>
      </div>

      {clientNames.get(clientId) && (
        <p className="text-[11px] text-slate-400">Client: <span className="text-slate-600 font-medium">{clientNames.get(clientId)}</span></p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Type</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">In</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Out</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Balance</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map(r => (
              <tr key={r.id} className="border-b border-slate-50">
                <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateAU(r.values.date)}</td>
                <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                  {r.values.receipt_number || r.values.payment_number || r.values.journal_number || '-'}
                </td>
                <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{displayType(r.values.type)}</td>
                <td className="px-4 py-2 text-slate-600">
                  {r.values.voided_at ? <span className="line-through text-slate-400">{r.values.payor_payee || r.values.purpose || '-'}</span> : (r.values.payor_payee || r.values.purpose || '-')}
                  {r.values.voided_at && <span className="ml-2 text-[9px] font-bold text-rose-500 uppercase tracking-wider">Voided</span>}
                  {r.values.reversal_of && <span className="ml-2 text-[9px] font-bold text-amber-500 uppercase tracking-wider">Reversal</span>}
                </td>
                <td className="px-4 py-2 text-right text-slate-700 whitespace-nowrap">{r.values.amount_in ? aud.format(Number(r.values.amount_in)) : ''}</td>
                <td className="px-4 py-2 text-right text-slate-700 whitespace-nowrap">{r.values.amount_out ? aud.format(Number(r.values.amount_out)) : ''}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{aud.format(Number(r.values.running_balance) || 0)}</td>
                <td className="px-2 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    {r.values.receipt_number ? (
                      <button onClick={() => setPreview({ kind: 'receipt', key: r.values.receipt_number, label: `Receipt ${r.values.receipt_number}` })} title="View receipt" className="p-1.5 text-slate-300 hover:text-teal-600">
                        <Eye size={13} />
                      </button>
                    ) : r.values.payment_number ? (
                      <button onClick={() => setPreview({ kind: 'payment', key: r.id, label: `Payment ${r.values.payment_number}` })} title="View payment" className="p-1.5 text-slate-300 hover:text-teal-600">
                        <Eye size={13} />
                      </button>
                    ) : null}
                    {isAdmin && !r.values.voided_at && (
                      <button onClick={() => setVoidingRecord(r)} title="Void transaction" className="p-1.5 text-slate-300 hover:text-rose-600">
                        <Ban size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-[11px] text-slate-300 italic">
                  {recordsLoading ? '' : 'No trust transactions for this matter'}
                </td>
              </tr>
            )}
          </tbody>
          {entries.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50">
                <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={4}>Totals</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totals.in)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totals.out)}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(closingBalance)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {modal === 'deposit' && defaultAccountId && (
        <DepositFundsModal
          companyId={companyId} userId={userId} trustAccountId={defaultAccountId} trustAccounts={activeAccounts}
          trustTable={trustTable}
          fixedMatterId={recordId} fixedMatterLabel={matterLabel || undefined}
          onClose={() => setModal(null)}
          onDeposited={(receiptNumber) => { setModal(null); trustTable.refetch(); setPreview({ kind: 'receipt', key: receiptNumber, label: `Receipt ${receiptNumber}` }); }}
        />
      )}
      {modal === 'payment' && defaultAccountId && (
        <TrustPaymentModal
          companyId={companyId} userId={userId} trustAccountId={defaultAccountId} trustAccounts={activeAccounts}
          trustTable={trustTable}
          fixedMatterId={recordId} fixedMatterLabel={matterLabel || undefined}
          onClose={() => setModal(null)}
          onProcessed={() => { setModal(null); trustTable.refetch(); }}
        />
      )}
      {preview && (
        <PdfPreviewModal
          src={preview.kind === 'receipt' ? `/api/trust-receipts/${encodeURIComponent(preview.key)}/pdf` : `/api/trust-payments/${preview.key}/pdf`}
          downloadSrc={preview.kind === 'receipt' ? `/api/trust-receipts/${encodeURIComponent(preview.key)}/pdf?download=1` : `/api/trust-payments/${preview.key}/pdf?download=1`}
          title={preview.label}
          onClose={() => setPreview(null)}
        />
      )}
      {voidingRecord && (
        <VoidTransactionModal
          tableId={trustTable.tableDef!.id} recordId={voidingRecord.id}
          description={voidingRecord.values.payor_payee || voidingRecord.values.purpose || displayType(voidingRecord.values.type)}
          onClose={() => setVoidingRecord(null)}
          onVoided={() => { setVoidingRecord(null); trustTable.refetch(); }}
        />
      )}
    </div>
  );
}
