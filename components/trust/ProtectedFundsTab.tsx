"use client";

// Trust Account page's "Protected Funds" tab -- lists active holds (see
// ProtectFundsModal.tsx's doc comment: not a ledger movement, just a marker
// that reduces "Available" in the page header) with a release action, plus
// its own Protect Funds entry point matching the reference screenshot.
import { useState } from "react";
import { ShieldPlus, Loader2 } from "lucide-react";
import type { useCustomTable, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { updateRecord as updateCustomRecord } from "@/lib/services/customTableService";
import ProtectFundsModal from "./ProtectFundsModal";
import { auTodayStr } from "@/lib/companyLocalDate";

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU'); } catch { return d; }
}

export default function ProtectedFundsTab({
  companyId, userId, trustAccountId, protectedTable, trustTable, protectedRecords, allProtectedRecords,
}: {
  companyId: string; userId: string; trustAccountId: string;
  protectedTable: ReturnType<typeof useCustomTable>;
  trustTable: ReturnType<typeof useCustomTable>;
  protectedRecords: CustomTableRecord[];
  allProtectedRecords: CustomTableRecord[];
}) {
  const [showModal, setShowModal] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const availableForProtect = trustTable.records.reduce((s, r) => s + (Number(r.values.amount_in) || 0) - (Number(r.values.amount_out) || 0), 0)
    - protectedRecords.reduce((s, r) => s + (Number(r.values.amount) || 0), 0);

  const handleRelease = async (record: CustomTableRecord) => {
    const reason = window.prompt('Reason for releasing these protected funds?');
    if (reason === null) return;
    setReleasingId(record.id);
    await updateCustomRecord(record.id, protectedTable.tableDef!.id, companyId, {
      released_at: auTodayStr(), released_reason: reason.trim() || null,
    }, protectedTable.fields);
    setReleasingId(null);
    protectedTable.refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 text-white rounded-full text-[11px] font-bold hover:bg-amber-700 transition-all">
          <ShieldPlus size={13} /> Protect Funds
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              <th className="text-left px-4 py-2.5">Date</th>
              <th className="text-left px-4 py-2.5">Matter</th>
              <th className="text-left px-4 py-2.5">Reason</th>
              <th className="text-right px-4 py-2.5">Amount</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {protectedRecords.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-12 text-[11px] text-slate-300 italic">No protected funds on this account</td></tr>
            ) : protectedRecords.map(r => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-2.5 text-slate-600">{formatDate(r.values.date_protected)}</td>
                <td className="px-4 py-2.5 text-slate-700 font-medium">{r.displayValues?.matter || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{r.values.reason || '—'}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-800">{money(Number(r.values.amount) || 0)}</td>
                <td className="px-2 py-2.5 text-right">
                  <button onClick={() => handleRelease(r)} disabled={releasingId === r.id} className="px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50">
                    {releasingId === r.id ? <Loader2 size={11} className="animate-spin" /> : 'Release'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {allProtectedRecords.some(r => r.values.released_at) && (
        <details className="text-[11px] text-slate-400">
          <summary className="cursor-pointer font-bold uppercase tracking-widest text-[9px]">Released ({allProtectedRecords.filter(r => r.values.released_at).length})</summary>
          <div className="mt-2 space-y-1">
            {allProtectedRecords.filter(r => r.values.released_at).map(r => (
              <p key={r.id}>{formatDate(r.values.released_at)} — {r.displayValues?.matter} — {money(Number(r.values.amount) || 0)} — {r.values.released_reason || '—'}</p>
            ))}
          </div>
        </details>
      )}

      {showModal && (
        <ProtectFundsModal
          companyId={companyId} userId={userId} trustAccountId={trustAccountId}
          availableBalance={availableForProtect}
          onClose={() => setShowModal(false)}
          onProtected={() => { setShowModal(false); protectedTable.refetch(); }}
        />
      )}
    </div>
  );
}
