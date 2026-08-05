"use client";

// Trust Ledger Overdrawn report -- any matter whose trust ledger balance is
// negative as at a chosen date. insert_ledger_record()'s LEDGER_OVERDRAW
// check (company_table_ledger.sql) makes this impossible to reach through
// the app, so this report should always come back empty -- it exists as the
// statutory check itself (r 47), not because overdraws are expected.
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { generateTrustOverdrawnPdf } from "@/lib/trust/generateTrustOverdrawnPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { auTodayStr } from "@/lib/companyLocalDate";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function today(): string {
  return auTodayStr();
}

export default function TrustOverdrawnWidget({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName } = useCompany();
  const [asOf, setAsOf] = useState(today());
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const overdrawn = useMemo(() => {
    const byMatter = new Map<string, number>();
    for (const r of records) {
      const matterId = String(r.values.matter || '');
      if (!matterId) continue;
      const date = String(r.values.date || '').slice(0, 10);
      if (date && date > asOf) continue;
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      byMatter.set(matterId, (byMatter.get(matterId) || 0) + inAmt - outAmt);
    }
    return [...byMatter.entries()]
      .filter(([, balance]) => balance < -0.005)
      .map(([matterId, balance]) => ({ matterId, balance }))
      .sort((a, b) => a.balance - b.balance);
  }, [records, asOf]);

  const matterIds = useMemo(() => overdrawn.map(b => b.matterId), [overdrawn]);
  const matterNames = useRecordNames('projects', matterIds);
  const matterNumbers = useMatterNumbers(matterIds);

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateTrustOverdrawnPdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      asOf,
      rows: overdrawn.map(b => ({
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
          <div className="h-9 w-9 rounded-xl bg-rose-50 flex items-center justify-center">
            <ShieldAlert size={18} className="text-rose-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trust Ledger Overdrawn</p>
            <p className="text-[11px] text-slate-400">Matters whose trust ledger balance is negative as at the chosen date</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-300 text-[11px]">as at</span>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-rose-100" />
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
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Balance</th>
            </tr>
          </thead>
          <tbody>
            {overdrawn.map(b => (
              <tr key={b.matterId} className="border-b border-slate-50 bg-rose-50/50">
                <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{matterNumbers.get(b.matterId) || '—'}</td>
                <td className="px-4 py-2 font-medium text-slate-700">
                  <button onClick={() => router.push(`/dashboard/projects?id=${b.matterId}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                    {matterNames.get(b.matterId) || b.matterId.slice(0, 8)}
                  </button>
                </td>
                <td className="px-4 py-2 text-right font-semibold text-rose-600">{aud.format(b.balance)}</td>
              </tr>
            ))}
            {overdrawn.length === 0 && (
              <tr><td colSpan={3} className="text-center py-8 text-[11px] text-slate-300 italic">No entries found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          title="Trust Ledger Overdrawn"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}
