"use client";

// Payments Cash Book -- every Withdrawal-type trust transaction (cheque or
// EFT) in a chosen period, in date order, with its own consecutive
// payment_number sequence, separate from receipts' receipt_number (see
// supabase/migrations/20260802160000_trust_split_payment_journal_numbers.sql).
// Sibling of TrustReceiptsCashBookWidget -- see that file's header for why
// neither carries a running trust balance.
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { useMatterTypes } from "@/lib/hooks/useMatterTypes";
import { formatDateAU } from "@/lib/formatDate";
import { generateTrustPaymentsCashBookPdf } from "@/lib/trust/generateTrustPaymentsCashBookPdf";
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

export default function TrustPaymentsCashBookWidget({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName } = useCompany();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const rows = useMemo(() => {
    return records
      .filter(r => String(r.values.type || '').startsWith('Withdrawal'))
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

  const totalDebit = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.values.amount_out) || 0), 0), [rows]);

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateTrustPaymentsCashBookPdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      from, to, totalDebit,
      rows: rows.map(r => {
        const matterId = String(r.values.matter || '');
        const clientId = String(r.values.client || '');
        return {
          date: r.values.date || null,
          paymentNumber: r.values.payment_number || null,
          paidTo: r.values.payor_payee || null,
          reason: r.values.purpose || null,
          matterNumber: matterNumbers.get(matterId) || null,
          clientName: clientNames.get(clientId) || null,
          matterType: matterTypes.get(matterId) || null,
          description: matterNames.get(matterId) || null,
          debit: Number(r.values.amount_out) || 0,
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
          <div className="h-9 w-9 rounded-xl bg-rose-50 flex items-center justify-center">
            <Banknote size={18} className="text-rose-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Payments Cash Book</p>
            <p className="text-[11px] text-slate-400">All trust withdrawals in date order, with their own payment number sequence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-rose-100" />
          <span className="text-slate-300 text-[11px]">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-rose-100" />
          <button onClick={handlePrint} disabled={printing} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-rose-300 transition-all disabled:opacity-50">
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Payment No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Paid To</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Reason</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Matter Ref</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Client</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Matter Type</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Description</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Debit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const matterId = String(r.values.matter || '');
              const clientId = String(r.values.client || '');
              return (
                <tr key={r.id} className="border-b border-slate-50">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateAU(r.values.date)}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{r.values.payment_number || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.values.payor_payee || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.values.purpose || '—'}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{matterNumbers.get(matterId) || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{clientNames.get(clientId) || '—'}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{matterTypes.get(matterId) || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {matterId ? (
                      <button onClick={() => router.push(`/dashboard/projects?id=${matterId}&tab=trust_account`)} className="text-teal-700 hover:underline text-left">
                        {matterNames.get(matterId) || '—'}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{aud.format(Number(r.values.amount_out) || 0)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-[11px] text-slate-300 italic">No payments in this period</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={8}>Period total</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totalDebit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          orientation="landscape"
          title="Payments Cash Book"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}
