"use client";

// The Trust Account page's "Transactions" tab -- the Smokeball-style action
// bar (Deposit/Transfer/Protect/Print Cheques) + ledger table, scoped to
// whichever trust account app/dashboard/trust-account/page.tsx currently has
// selected. Reads/writes the EXISTING Trust Transactions ledger table via
// the same insert_ledger_record()/createRecord() mechanics every other
// ledger table in this app uses -- nothing here is a new data structure.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, ArrowLeftRight, ShieldPlus, Printer, Send, Eye } from "lucide-react";
import type { useCustomTable, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import DepositFundsModal from "./DepositFundsModal";
import TransferFundsModal from "./TransferFundsModal";
import ProtectFundsModal from "./ProtectFundsModal";
import PrintChequesModal from "./PrintChequesModal";
import TrustPaymentModal from "./TrustPaymentModal";
import PdfPreviewModal from "../dashboard/PdfPreviewModal";

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU'); } catch { return d; }
}

// A short human summary for the Description column -- deliberately derived
// at render time, not a stored field, so it can't drift from the row's real
// type/payor_payee/matter values.
function describe(r: CustomTableRecord): string {
  const type = r.values.type || '';
  const who = r.values.payor_payee || '';
  const matter = r.displayValues?.matter || '';
  if (type === 'Deposit') return who ? `${type} from ${who}` : type;
  if (type?.startsWith('Withdrawal')) return who ? `Payment to ${who}${matter ? ` for ${matter}` : ''}` : type;
  if (type === 'Journal Transfer') return matter ? `Transfer for ${matter}` : type;
  return type || '—';
}

export default function TrustTransactionsTab({
  companyId, userId, trustAccountId, trustAccounts, trustTable, protectedTable, records, availableBalance,
}: {
  companyId: string;
  userId: string;
  trustAccountId: string;
  trustAccounts: CustomTableRecord[];
  trustTable: ReturnType<typeof useCustomTable>;
  protectedTable: ReturnType<typeof useCustomTable>;
  records: CustomTableRecord[];
  availableBalance: number;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<'deposit' | 'transfer' | 'protect' | 'cheque' | 'payment' | null>(null);
  const [preview, setPreview] = useState<{ kind: 'receipt' | 'payment'; key: string; label: string } | null>(null);

  const sorted = [...records].sort((a, b) => String(b.values.date || '').localeCompare(String(a.values.date || '')));
  const matterIds = useMemo(() => [...new Set(sorted.map(r => String(r.values.matter || '')).filter(Boolean))], [sorted]);
  const matterNumbers = useMatterNumbers(matterIds);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setModal('deposit')} className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white rounded-full text-[11px] font-bold hover:bg-teal-800 transition-all">
          <Plus size={13} /> Deposit Funds
        </button>
        <button onClick={() => setModal('transfer')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold hover:border-teal-300 transition-all">
          <ArrowLeftRight size={13} /> Transfer Funds
        </button>
        <button onClick={() => setModal('protect')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold hover:border-amber-300 transition-all">
          <ShieldPlus size={13} /> Protect Funds
        </button>
        <button onClick={() => setModal('payment')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold hover:border-slate-400 transition-all">
          <Send size={13} /> Trust Payment
        </button>
        <button onClick={() => setModal('cheque')} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold hover:border-slate-400 transition-all">
          <Printer size={13} /> Print Cheques
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              <th className="text-left px-4 py-2.5">Transaction Date</th>
              <th className="text-left px-4 py-2.5">Entered Date</th>
              <th className="text-left px-4 py-2.5">Description</th>
              <th className="text-left px-4 py-2.5">Receipt No.</th>
              <th className="text-left px-4 py-2.5">Matter No.</th>
              <th className="text-left px-4 py-2.5">Matter</th>
              <th className="text-right px-4 py-2.5">Debit</th>
              <th className="text-right px-4 py-2.5">Credit</th>
              <th className="text-right px-4 py-2.5">Balance</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              // trustTable.recordsLoading, not a new prop -- this is already
              // available on the trustTable object every caller passes in.
              // Confirmed live (screenshot, cold mobile Safari load): without
              // this check, "No transactions yet" showed for ~1s on a first
              // visit while trustTable.records was still empty because
              // recordsLoading hadn't resolved yet -- misleading, since the
              // account wasn't actually empty. Renders nothing (not a
              // spinner) while loading -- the page's own progress bar
              // (useProgressBarWhile) is what signals "still working".
              trustTable.recordsLoading ? null : (
                <tr><td colSpan={9} className="text-center py-12 text-[11px] text-slate-300 italic">No transactions yet for this account</td></tr>
              )
            ) : sorted.map(r => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-2.5 text-slate-600">{formatDate(r.values.date)}</td>
                <td className="px-4 py-2.5 text-slate-400">{formatDate(r.created_at)}</td>
                <td className="px-4 py-2.5 text-slate-700 font-medium">{describe(r)}</td>
                <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{r.values.receipt_number || r.values.payment_number || r.values.journal_number || r.values.cheque_number || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500 font-mono text-[11px]">{matterNumbers.get(String(r.values.matter || '')) || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">
                  {r.values.matter ? (
                    <button onClick={() => router.push(`/dashboard/projects?id=${r.values.matter}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                      {r.displayValues?.matter || '—'}
                    </button>
                  ) : (r.displayValues?.matter || '—')}
                </td>
                <td className="px-4 py-2.5 text-right text-slate-700">{r.values.amount_out ? money(Number(r.values.amount_out)) : ''}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{r.values.amount_in ? money(Number(r.values.amount_in)) : ''}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{r.values.running_balance != null ? money(Number(r.values.running_balance)) : '—'}</td>
                <td className="px-2 py-2.5">
                  {r.values.receipt_number ? (
                    <button onClick={() => setPreview({ kind: 'receipt', key: r.values.receipt_number, label: `Receipt ${r.values.receipt_number}` })} title="View receipt" className="p-1.5 text-slate-300 hover:text-teal-600">
                      <Eye size={13} />
                    </button>
                  ) : r.values.payment_number ? (
                    <button onClick={() => setPreview({ kind: 'payment', key: r.id, label: `Payment ${r.values.payment_number}` })} title="View payment" className="p-1.5 text-slate-300 hover:text-teal-600">
                      <Eye size={13} />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === 'deposit' && (
        <DepositFundsModal
          companyId={companyId} userId={userId} trustAccountId={trustAccountId} trustAccounts={trustAccounts}
          trustTable={trustTable}
          onClose={() => setModal(null)}
          onDeposited={(receiptNumber) => { setModal(null); trustTable.refetch(); setPreview({ kind: 'receipt', key: receiptNumber, label: `Receipt ${receiptNumber}` }); }}
        />
      )}
      {modal === 'transfer' && (
        <TransferFundsModal
          companyId={companyId} userId={userId} trustAccountId={trustAccountId}
          trustTable={trustTable}
          onClose={() => setModal(null)}
          onTransferred={() => { setModal(null); trustTable.refetch(); }}
        />
      )}
      {modal === 'protect' && (
        <ProtectFundsModal
          companyId={companyId} userId={userId} trustAccountId={trustAccountId}
          availableBalance={availableBalance}
          onClose={() => setModal(null)}
          onProtected={() => { setModal(null); protectedTable.refetch(); }}
        />
      )}
      {modal === 'payment' && (
        <TrustPaymentModal
          companyId={companyId} userId={userId} trustAccountId={trustAccountId} trustAccounts={trustAccounts}
          trustTable={trustTable}
          onClose={() => setModal(null)}
          onProcessed={() => { setModal(null); trustTable.refetch(); }}
        />
      )}
      {modal === 'cheque' && (
        <PrintChequesModal
          companyId={companyId} userId={userId} trustAccountId={trustAccountId}
          trustTable={trustTable}
          onClose={() => setModal(null)}
          onPrinted={() => { setModal(null); trustTable.refetch(); }}
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
    </div>
  );
}
