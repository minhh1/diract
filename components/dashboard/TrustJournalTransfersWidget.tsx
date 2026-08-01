"use client";

// Trust Journal Transfers report -- every Journal Transfer-type trust
// transaction (a movement between two matters' trust ledgers, or into the
// firm's costs, with no cash actually moving through the bank account) in a
// chosen period, with its own consecutive journal_number sequence. Sibling
// of the Receipts/Payments Cash Books -- see TrustReceiptsCashBookWidget.tsx.
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Printer, Loader2 } from "lucide-react";
import { useCompany } from "@/components/CompanyContext";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { formatDateAU } from "@/lib/formatDate";
import { generateTrustJournalTransfersPdf } from "@/lib/trust/generateTrustJournalTransfersPdf";
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

export default function TrustJournalTransfersWidget({ records, trustAccountName }: { records: CustomTableRecord[]; trustAccountName?: string }) {
  const router = useRouter();
  const { companyName } = useCompany();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [printing, setPrinting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const rows = useMemo(() => {
    return records
      .filter(r => String(r.values.type || '') === 'Journal Transfer')
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
  const clientNames = useRecordNames('entities', clientIds);

  const totalCredit = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.values.amount_in) || 0), 0), [rows]);
  const totalDebit = useMemo(() => rows.reduce((sum, r) => sum + (Number(r.values.amount_out) || 0), 0), [rows]);

  const handlePrint = async () => {
    setPrinting(true);
    const bytes = await generateTrustJournalTransfersPdf({
      companyName: companyName || '',
      trustAccountName: trustAccountName || 'Trust Account',
      from, to, totalCredit, totalDebit,
      rows: rows.map(r => {
        const matterId = String(r.values.matter || '');
        const clientId = String(r.values.client || '');
        return {
          date: r.values.date || null,
          journalNumber: r.values.journal_number || null,
          reason: r.values.purpose || null,
          matterNumber: matterNumbers.get(matterId) || null,
          clientName: clientNames.get(clientId) || null,
          description: matterNames.get(matterId) || null,
          authorisedBy: r.values.authority_reference || null,
          credit: Number(r.values.amount_in) || 0,
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
          <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <ArrowLeftRight size={18} className="text-indigo-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Trust Journal Transfers</p>
            <p className="text-[11px] text-slate-400">Movements between matters' trust ledgers, with their own journal number sequence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
          <span className="text-slate-300 text-[11px]">to</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-full py-2 px-4 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-100" />
          <button onClick={handlePrint} disabled={printing} title="Print"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[12px] font-semibold hover:border-indigo-300 transition-all disabled:opacity-50">
            {printing ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Print
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Date</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Journal No.</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Reason</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Matter Ref</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Client</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Matter Description</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Authorised By</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Credit</th>
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
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{r.values.journal_number || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{r.values.purpose || '—'}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-slate-500 whitespace-nowrap">{matterNumbers.get(matterId) || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{clientNames.get(clientId) || '—'}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {matterId ? (
                      <button onClick={() => router.push(`/dashboard/projects?id=${matterId}`)} className="text-teal-700 hover:underline text-left">
                        {matterNames.get(matterId) || '—'}
                      </button>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{r.values.authority_reference || '—'}</td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{r.values.amount_in ? aud.format(Number(r.values.amount_in)) : ''}</td>
                  <td className="px-4 py-2 text-right font-semibold text-slate-900 whitespace-nowrap">{r.values.amount_out ? aud.format(Number(r.values.amount_out)) : ''}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-[11px] text-slate-300 italic">No journal transfers in this period</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td className="px-4 py-2.5 font-bold text-slate-700" colSpan={7}>Period totals</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totalCredit)}</td>
              <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{aud.format(totalDebit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {previewUrl && (
        <PdfPreviewModal
          src={previewUrl}
          downloadSrc={previewUrl}
          title="Trust Journal Transfers"
          onClose={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}
        />
      )}
    </div>
  );
}
