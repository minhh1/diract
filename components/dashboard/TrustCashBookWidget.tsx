"use client";

// Trust cash book -- every transaction across every matter, in date order,
// for a chosen period, with a whole-account running total (an opening
// balance carried in from everything before the period, then a cumulative
// total row by row) -- the standard trust accounting "cash book" report,
// distinct from a single matter's ledger statement
// (TrustLedgerStatementWidget) or the trial-balance-by-matter view
// (TrustReconciliationWidget). A dashboard widget like any other (see
// lib/dashboardWidgets/types.ts's TrustCashBookWidget).
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { formatDateAU } from "@/lib/formatDate";
import { generateTrustCashBookPdf } from "@/lib/trust/generateTrustCashBookPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TrustCashBookWidget({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName } = useCompany();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const sorted = useMemo(
    () => records.slice().sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || ''))),
    [records]
  );

  const matterIds = useMemo(() => [...new Set(sorted.map(r => String(r.values.matter || '')).filter(Boolean))], [sorted]);
  const matterNames = useRecordNames('projects', matterIds);
  const matterNumbers = useMatterNumbers(matterIds);

  const { openingBalance, rows, periodIn, periodOut } = useMemo(() => {
    let openingBalance = 0;
    let running = 0;
    let periodIn = 0, periodOut = 0;
    const rows: { record: CustomTableRecord; running: number }[] = [];
    for (const r of sorted) {
      const date = String(r.values.date || '').slice(0, 10);
      const inAmt = Number(r.values.amount_in) || 0;
      const outAmt = Number(r.values.amount_out) || 0;
      if (date && date < from) {
        openingBalance += inAmt - outAmt;
        continue;
      }
      if (!date || date > to) continue;
      running = (rows.length ? rows[rows.length - 1].running : openingBalance) + inAmt - outAmt;
      periodIn += inAmt;
      periodOut += outAmt;
      rows.push({ record: r, running });
    }
    return { openingBalance, rows, periodIn, periodOut };
  }, [sorted, from, to]);

  const closingBalance = rows.length ? rows[rows.length - 1].running : openingBalance;

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateTrustCashBookPdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      from, to, openingBalance, periodIn, periodOut, closingBalance,
      rows: rows.map(({ record: r, running }) => {
        const matterId = String(r.values.matter || '');
        return {
          date: r.values.date || null,
          receiptNumber: r.values.receipt_number || null,
          matterNumber: matterNumbers.get(matterId) || null,
          matterName: matterNames.get(matterId) || null,
          particulars: r.values.payor_payee || r.values.purpose || '—',
          amountIn: Number(r.values.amount_in) || 0,
          amountOut: Number(r.values.amount_out) || 0,
          running,
        };
      }),
    });
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
    setPreviewUrl(URL.createObjectURL(blob));
    setPrinting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <BookOpen size={18} className="text-amber-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trust Cash Book</p>
            <p className="text-[11px] text-slate-400">All transactions in date order, with a whole-account running total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-amber-100" />
          <span className="text-slate-300 text-[11px]">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-amber-100" />
          <button onClick={handlePrint} disabled={printing} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-amber-300 transition-all disabled:opacity-50">
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Receipt No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Particulars</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">In</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Out</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Running total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-50 bg-slate-50/50">
              <td className="px-4 py-2 text-slate-400 italic" colSpan={7}>Opening balance (before {formatDateAU(from)})</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-600">{aud.format(openingBalance)}</td>
            </tr>
            {rows.map(({ record: r, running }) => {
              const matterId = String(r.values.matter || '');
              return (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 text-slate-500">{formatDateAU(r.values.date)}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{r.values.receipt_number || '—'}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{matterNumbers.get(matterId) || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {matterId ? (
                      <button onClick={() => router.push(`/dashboard/projects?id=${matterId}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                        {matterNames.get(matterId) || '—'}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.values.payor_payee || r.values.purpose || '—'}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{r.values.amount_in ? aud.format(Number(r.values.amount_in)) : ''}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{r.values.amount_out ? aud.format(Number(r.values.amount_out)) : ''}</td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900">{aud.format(running)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-[11px] text-slate-300 italic">No trust transactions in this period</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={5}>Period totals</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900">{aud.format(periodIn)}</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900">{aud.format(periodOut)}</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900">{aud.format(closingBalance)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          orientation="landscape"
          title="Trust Cash Book"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}
