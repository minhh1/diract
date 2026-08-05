"use client";

// Unpaid invoices -- every Invoices record actually issued to the client
// (status Sent or Overdue -- see supabase/invoice_status_options_update.sql
// for the fixed option set: Under Review, Sent, Paid, Overdue, Void) and
// still outstanding. Under Review is deliberately excluded even though it
// isn't Paid/Void -- it's the pre-issue internal state, so surfacing it
// here would show the firm's own drafts as if they were amounts owed by a
// client. Sorted oldest first so the longest-outstanding invoice surfaces
// at the top. Same self-contained
// "reads records, computes its own list" shape as
// components/dashboard/TimeAgingReportWidget.tsx -- part of Quick Glance's
// Law Firm widget set (components/dashboard/quickGlance/LawFirmQuickGlance.tsx).
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { formatDateAU } from "@/lib/formatDate";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export default function UnpaidInvoicesWidget({ records }: { records: CustomTableRecord[] }) {
  const router = useRouter();

  const unpaid = useMemo(() => {
    return records
      .filter(r => ['Sent', 'Overdue'].includes(String(r.values.status || '')))
      .map(r => ({
        id: r.id,
        matterId: String(r.values.matter || ''),
        invoiceNumber: String(r.values.invoice_number || ''),
        issueDate: String(r.values.issue_date || r.values.date || '').slice(0, 10),
        status: String(r.values.status || ''),
        amountDue: Number(r.values.amount_due) || 0,
      }))
      .sort((a, b) => a.issueDate.localeCompare(b.issueDate));
  }, [records]);

  const matterIds = useMemo(() => unpaid.map(u => u.matterId).filter(Boolean), [unpaid]);
  const matterNames = useRecordNames('projects', matterIds);
  const matterNumbers = useMatterNumbers(matterIds);
  const totalDue = useMemo(() => unpaid.reduce((sum, u) => sum + u.amountDue, 0), [unpaid]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <Receipt size={18} className="text-amber-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Unpaid Invoices</p>
            <p className="text-[11px] text-slate-400">{unpaid.length} outstanding · {aud.format(totalDue)} due</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Invoice</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter</th>
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Issued</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Due</th>
            </tr>
          </thead>
          <tbody>
            {unpaid.map(u => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="px-4 py-2 font-mono text-[11px] text-slate-500">{u.invoiceNumber || '—'}</td>
                <td className="px-4 py-2 font-medium text-slate-700">
                  <button
                    onClick={() => u.matterId && router.push(`/dashboard/projects?id=${u.matterId}`)}
                    className="text-teal-700 hover:underline text-left"
                  >
                    {matterNames.get(u.matterId) || matterNumbers.get(u.matterId) || u.matterId.slice(0, 8) || '—'}
                  </button>
                </td>
                <td className="px-4 py-2 text-slate-500">{u.issueDate ? formatDateAU(u.issueDate) : '—'}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900">{aud.format(u.amountDue)}</td>
              </tr>
            ))}
            {unpaid.length === 0 && (
              <tr><td colSpan={4} className="text-center py-8 text-[11px] text-slate-300 italic">No unpaid invoices</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
