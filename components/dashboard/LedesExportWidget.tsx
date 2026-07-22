"use client";

// LEDES 1998B e-billing export -- a dashboard widget like any other (see
// lib/dashboardWidgets/types.ts's LedesExportWidget). Lists whatever table
// the dashboard is bound to, with a per-row download of the pipe-delimited
// LEDES file built by app/api/ledes/[recordId]/route.ts from each invoice's
// linked time entries and disbursements. Meaningful on an Invoices-shaped
// table (invoice_number/issue_date/status/total_inc_gst field_keys); an
// empty/blank state on any other table, same as any widget bound to the
// wrong shape of table.
import { FileDown } from "lucide-react";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

export default function LedesExportWidget({ records }: { records: CustomTableRecord[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-cyan-50 flex items-center justify-center">
          <FileDown size={18} className="text-cyan-700" />
        </div>
        <div>
          <p className="text-[13px] font-bold text-slate-800">LEDES Export</p>
          <p className="text-[11px] text-slate-400">LEDES 1998B e-billing files, built from each invoice&apos;s linked time entries and disbursements</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Invoice</th>
              <th className="text-left px-5 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Issue date</th>
              <th className="text-left px-5 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="text-right px-5 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total inc. GST</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-2.5 font-semibold text-slate-800">{r.values.invoice_number || '—'}</td>
                <td className="px-5 py-2.5 text-slate-500">{r.values.issue_date || '—'}</td>
                <td className="px-5 py-2.5 text-slate-500">{r.values.status || '—'}</td>
                <td className="px-5 py-2.5 text-right font-medium text-slate-800">
                  {r.values.total_inc_gst != null && r.values.total_inc_gst !== '' ? aud.format(Number(r.values.total_inc_gst) || 0) : '—'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <a
                    href={`/api/ledes/${r.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-cyan-50 text-cyan-700 rounded-full text-[10px] font-bold hover:bg-cyan-100 transition-all"
                  >
                    <FileDown size={11} /> LEDES
                  </a>
                </td>
              </tr>
            ))}
            {records.length === 0 && (
              <tr><td colSpan={5} className="text-center py-10 text-[11px] text-slate-300 italic">No invoices yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
