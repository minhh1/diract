"use client";

// Every matter currently holding trust money, regardless of how recently it
// last moved -- the plain "who's holding what" view, as distinct from
// TrustAgedBalancesWidget's dormancy check (money that's been sitting untouched
// past a threshold). Same per-matter balance aggregation as that widget, just
// without the age filter/highlighting.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { generateTrustLiveBalancesPdf } from "@/lib/trust/generateTrustLiveBalancesPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export default function TrustLiveBalancesWidget({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName } = useCompany();
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const balances = useMemo(() => {
    const byMatter = new Map<string, number>();
    for (const r of records) {
      const matterId = String(r.values.matter || '');
      if (!matterId) continue;
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      byMatter.set(matterId, (byMatter.get(matterId) || 0) + inAmt - outAmt);
    }
    return [...byMatter.entries()]
      .filter(([, balance]) => Math.abs(balance) >= 0.005)
      .map(([matterId, balance]) => ({ matterId, balance }))
      .sort((a, b) => b.balance - a.balance);
  }, [records]);

  const matterIds = useMemo(() => balances.map(b => b.matterId), [balances]);
  const matterNames = useRecordNames('projects', matterIds);
  const matterNumbers = useMatterNumbers(matterIds);
  const total = balances.reduce((sum, b) => sum + b.balance, 0);

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateTrustLiveBalancesPdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      total,
      balances: balances.map(b => ({
        matterNumber: matterNumbers.get(b.matterId) || null,
        matterName: matterNames.get(b.matterId) || b.matterId.slice(0, 8),
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
          <div className="h-9 w-9 rounded-xl bg-teal-50 flex items-center justify-center">
            <Wallet size={18} className="text-teal-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Matters Holding Trust Money</p>
            <p className="text-[11px] text-slate-400">Every matter with a live (non-zero) trust balance</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {balances.length > 0 && (
            <span className="text-[10px] font-bold text-teal-700 bg-teal-50 rounded-full px-3 py-1.5 uppercase tracking-wider">
              {balances.length} matter{balances.length === 1 ? '' : 's'} · {aud.format(total)}
            </span>
          )}
          <button onClick={handlePrint} disabled={printing} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-teal-300 transition-all disabled:opacity-50">
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
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Balance</th>
            </tr>
          </thead>
          <tbody>
            {balances.map(b => (
              <tr key={b.matterId} className="border-b border-slate-50">
                <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{matterNumbers.get(b.matterId) || '—'}</td>
                <td className="px-4 py-2 font-medium text-slate-700">
                  <button onClick={() => router.push(`/dashboard/projects?id=${b.matterId}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                    {matterNames.get(b.matterId) || b.matterId.slice(0, 8)}
                  </button>
                </td>
                <td className={`px-4 py-2 text-right font-semibold ${b.balance < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                  {aud.format(b.balance)}
                </td>
              </tr>
            ))}
            {balances.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-[11px] text-slate-300 italic">No matters with a live trust balance</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          title="Matters Holding Trust Money"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}
