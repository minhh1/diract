"use client";

// Dormant/aged trust balances -- every matter with a live (non-zero) trust
// balance, sorted by how long it's been since its last transaction, with
// anything past the widget's dormantDays threshold flagged. A common trust
// compliance check: money left sitting in a matter's trust ledger long
// after the matter itself has gone quiet is exactly what unclaimed-money
// rules are aimed at, and what an external examiner will ask about. A
// dashboard widget like any other (see lib/dashboardWidgets/types.ts's
// TrustAgedBalancesWidget).
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { formatDateAU } from "@/lib/formatDate";
import { generateDormantTrustBalancesPdf } from "@/lib/trust/generateDormantTrustBalancesPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function TrustAgedBalancesWidget({ records, dormantDays, trustAccountName }: { records: CustomTableRecord[]; dormantDays: number; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName } = useCompany();
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const balances = useMemo(() => {
    const byMatter = new Map<string, { balance: number; lastDate: string }>();
    for (const r of records) {
      const matterId = String(r.values.matter || '');
      if (!matterId) continue;
      const date = String(r.values.date || '').slice(0, 10);
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      const entry = byMatter.get(matterId) || { balance: 0, lastDate: '' };
      entry.balance += inAmt - outAmt;
      if (date > entry.lastDate) entry.lastDate = date;
      byMatter.set(matterId, entry);
    }

    const now = Date.now();
    return [...byMatter.entries()]
      .filter(([, v]) => Math.abs(v.balance) >= 0.005)
      .map(([matterId, v]) => ({
        matterId,
        balance: v.balance,
        lastDate: v.lastDate,
        daysDormant: v.lastDate ? Math.floor((now - new Date(v.lastDate).getTime()) / MS_PER_DAY) : Infinity,
      }))
      // A live balance alone isn't dormant -- this list is specifically the
      // ones past the threshold, not every live balance with the dormant
      // ones merely highlighted (that was the bug: every non-zero balance
      // showed up here regardless of age).
      .filter(b => b.daysDormant >= dormantDays)
      .sort((a, b) => b.daysDormant - a.daysDormant);
  }, [records, dormantDays]);

  const matterIds = useMemo(() => balances.map(b => b.matterId), [balances]);
  const matterNames = useRecordNames('projects', matterIds);
  const matterNumbers = useMatterNumbers(matterIds);
  const dormantCount = balances.length;

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateDormantTrustBalancesPdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      dormantDays,
      balances: balances.map(b => ({
        matterNumber: matterNumbers.get(b.matterId) || null,
        matterName: matterNames.get(b.matterId) || b.matterId.slice(0, 8),
        lastDate: b.lastDate || null,
        daysDormant: Number.isFinite(b.daysDormant) ? b.daysDormant : null,
        balance: b.balance,
      })),
    });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    setPreviewUrl(URL.createObjectURL(blob));
    setPrinting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-rose-50 flex items-center justify-center">
            <AlertTriangle size={18} className="text-rose-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Dormant Trust Balances</p>
            <p className="text-[11px] text-slate-400">Matters with a live balance and no transaction for {dormantDays}+ days</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dormantCount > 0 && (
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 rounded-full px-3 py-1.5 uppercase tracking-wider">
              {dormantCount} dormant balance{dormantCount === 1 ? '' : 's'}
            </span>
          )}
          <button onClick={handlePrint} disabled={printing} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-rose-300 transition-all disabled:opacity-50">
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Last transaction date</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Days dormant</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(b => {
              const isDormant = b.daysDormant >= dormantDays;
              return (
                <tr key={b.matterId} className={`border-b border-slate-50 ${isDormant ? 'bg-rose-50/50' : ''}`}>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{matterNumbers.get(b.matterId) || '—'}</td>
                  <td className="px-4 py-2 font-medium text-slate-700">
                    <button onClick={() => router.push(`/dashboard/projects?id=${b.matterId}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                      {matterNames.get(b.matterId) || b.matterId.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-slate-500">{formatDateAU(b.lastDate)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${isDormant ? 'text-rose-600' : 'text-slate-500'}`}>
                    {Number.isFinite(b.daysDormant) ? b.daysDormant : '—'}
                  </td>
                  <td className={`px-4 py-2 text-right font-semibold ${b.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                    {aud.format(b.balance)}
                  </td>
                </tr>
              );
            })}
            {balances.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-[11px] text-slate-300 italic">No dormant trust balances</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          title="Dormant Trust Balances"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}
