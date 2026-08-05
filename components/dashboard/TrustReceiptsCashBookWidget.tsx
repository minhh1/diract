"use client";

// Receipts Cash Book -- every Deposit-type trust transaction in a chosen
// period, in date order, with its own consecutive receipt_number sequence
// (see supabase/migrations/20260802160000_trust_split_payment_journal_numbers.sql).
// Split out of the combined TrustCashBookWidget so receipts and payments
// each get their own report, matching the real trust accounting system's
// separate Receipts/Payments Cash Books -- neither carries a running trust
// balance (that lives in the Trial Balance / combined ledger reports); each
// is just its own transactions in period, with a period total footer.
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { HandCoins, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { useMatterTypes } from "@/lib/hooks/useMatterTypes";
import { formatDateAU } from "@/lib/formatDate";
import { generateTrustReceiptsCashBookPdf } from "@/lib/trust/generateTrustReceiptsCashBookPdf";
import PdfPreviewModal from "./PdfPreviewModal";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { auTodayStr, auStartOfMonthStr } from "@/lib/companyLocalDate";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

function startOfMonth(): string {
  return auStartOfMonthStr();
}
function today(): string {
  return auTodayStr();
}

export default function TrustReceiptsCashBookWidget({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName } = useCompany();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const rows = useMemo(() => {
    return records
      .filter(r => String(r.values.type || '') === 'Deposit')
      .filter(r => {
        const date = String(r.values.date || '').slice(0, 10);
        return date && date >= from && date <= to;
      })
      .sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')));
  }, [records, from, to]);

  const matterIds = useMemo(() => [...new Set(rows.map(r => String(r.values.matter || '')).filter(Boolean))], [rows]);
  const clientIds = useMemo(() => [...new Set(rows.map(r => String(r.values.client || '')).filter(Boolean))], [rows]);
  const matterNames = useRecordNames('projects', matterIds);
  const matterNumbers = useMatterNumbers(matterIds);
  const matterTypes = useMatterTypes(matterIds);
  const clientNames = useRecordNames('entities', clientIds);

  const totalCredit = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.values.amount_in) || 0), 0), [rows]);

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateTrustReceiptsCashBookPdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      from, to, totalCredit,
      rows: rows.map(r => {
        const matterId = String(r.values.matter || '');
        const clientId = String(r.values.client || '');
        return {
          date: r.values.date || null,
          receiptNumber: r.values.receipt_number || null,
          formOfFunds: r.values.payment_method || null,
          receivedFrom: r.values.payor_payee || null,
          reason: r.values.purpose || null,
          matterNumber: matterNumbers.get(matterId) || null,
          clientName: clientNames.get(clientId) || null,
          matterType: matterTypes.get(matterId) || null,
          description: matterNames.get(matterId) || null,
          credit: Number(r.values.amount_in) || 0,
          banked: !!r.values.reconciled_in,
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
          <div className="h-9 w-9 rounded-xl bg-emerald-50 flex items-center justify-center">
            <HandCoins size={18} className="text-emerald-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Receipts Cash Book</p>
            <p className="text-[11px] text-slate-400">All trust deposits in date order, with their own receipt number sequence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-emerald-100" />
          <span className="text-slate-300 text-[11px]">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-emerald-100" />
          <button onClick={handlePrint} disabled={printing} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-emerald-300 transition-all disabled:opacity-50">
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Receipt No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Form of Funds</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Received From</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Reason</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Matter Ref</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Client</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Matter Type</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Description</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Credit</th>
              <th className="text-center px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Banked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const matterId = String(r.values.matter || '');
              const clientId = String(r.values.client || '');
              return (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateAU(r.values.date)}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{r.values.receipt_number || '-'}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{r.values.payment_method || '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.values.payor_payee || '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.values.purpose || '-'}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{matterNumbers.get(matterId) || '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{clientNames.get(clientId) || '-'}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{matterTypes.get(matterId) || '-'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {matterId ? (
                      <button onClick={() => router.push(`/dashboard/projects?id=${matterId}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                        {matterNames.get(matterId) || '-'}
                      </button>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{aud.format(Number(r.values.amount_in) || 0)}</td>
                  <td className="px-4 py-2 text-center text-slate-400">{r.values.reconciled_in ? '✓' : '-'}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={11} className="text-center py-8 text-[11px] text-slate-300 italic">No receipts in this period</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={9}>Period total</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totalCredit)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          title="Receipts Cash Book"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}
