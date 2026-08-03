"use client";

// Time & fees recorded per staff member over a chosen period -- the primary
// replacement for browsing the raw Time & Fee Entries table (see
// components/Sidebar.tsx's TABLE_HIDDEN_FROM_SIDEBAR list). Reads `records`
// exactly as loaded by the dashboard (already RLS-scoped -- see supabase/
// migrations/20260728220000_time_entry_view_scope.sql): a company admin
// sees every staff member's row here, a non-admin only ever sees their own
// row, because the database already filtered `records` down to that before
// this component ever runs. No admin/user branching needed in this file.
import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

type RangePreset = "this_month" | "this_week" | "all_time" | "custom";
const PRESET_LABELS: Record<RangePreset, string> = {
  this_month: "This month", this_week: "This week", all_time: "All time", custom: "Custom",
};

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // back up to Monday
  const res = new Date(d);
  res.setDate(d.getDate() + diff);
  res.setHours(0, 0, 0, 0);
  return res;
}

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

export default function TimeFeesReportWidget({ records }: { records: CustomTableRecord[] }) {
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const now = useMemo(() => new Date(), []);
  const [customStart, setCustomStart] = useState(() => toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(() => toDateInput(now));

  const { start, end } = useMemo(() => {
    if (preset === "this_month") return { start: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), end: toDateInput(now) };
    if (preset === "this_week") return { start: toDateInput(startOfWeek(now)), end: toDateInput(now) };
    if (preset === "all_time") return { start: null as string | null, end: null as string | null };
    return { start: customStart, end: customEnd };
  }, [preset, now, customStart, customEnd]);

  const rows = useMemo(() => {
    const byStaff = new Map<string, { hours: number; billableHours: number; amount: number; count: number }>();
    for (const r of records) {
      const staffId = String(r.values.staff || "");
      if (!staffId) continue;
      const date = String(r.values.date || "").slice(0, 10);
      if (start && date < start) continue;
      if (end && date > end) continue;
      const hours = Number(r.values.duration_hours) || 0;
      const amount = Number(r.values.amount) || 0;
      const entry = byStaff.get(staffId) || { hours: 0, billableHours: 0, amount: 0, count: 0 };
      entry.hours += hours;
      if (r.values.billable) entry.billableHours += hours;
      entry.amount += amount;
      entry.count += 1;
      byStaff.set(staffId, entry);
    }
    return [...byStaff.entries()].map(([staffId, v]) => ({ staffId, ...v })).sort((a, b) => b.hours - a.hours);
  }, [records, start, end]);

  const staffIds = useMemo(() => rows.map(r => r.staffId), [rows]);
  const staffNames = useRecordNames("entities", staffIds);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    hours: acc.hours + r.hours, billableHours: acc.billableHours + r.billableHours, amount: acc.amount + r.amount, count: acc.count + r.count,
  }), { hours: 0, billableHours: 0, amount: 0, count: 0 }), [rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Clock size={18} className="text-indigo-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Time & Fees Report</p>
            <p className="text-[11px] text-slate-400">Time recorded per staff member{start ? ` · ${start}${end && end !== start ? ` to ${end}` : ""}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold">
            {(Object.keys(PRESET_LABELS) as RangePreset[]).map(p => (
              <button key={p} onClick={() => setPreset(p)}
                className={`px-3 py-1.5 rounded-full transition-all ${preset === p ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                {PRESET_LABELS[p]}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-1.5">
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-full text-[11px] font-bold outline-none" />
              <span className="text-slate-300">–</span>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-full text-[11px] font-bold outline-none" />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Staff</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Entries</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Hours</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Billable hours</th>
              <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.staffId} className="border-b border-slate-50">
                <td className="px-4 py-2 font-medium text-slate-700">{staffNames.get(r.staffId) || r.staffId.slice(0, 8)}</td>
                <td className="px-4 py-2 text-right text-slate-500">{r.count}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900">{r.hours.toFixed(1)}</td>
                <td className="px-4 py-2 text-right text-slate-500">{r.billableHours.toFixed(1)}</td>
                <td className="px-4 py-2 text-right font-semibold text-slate-900">{aud.format(r.amount)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center py-8 text-[11px] text-slate-300 italic">No time recorded in this period</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 font-bold">
                <td className="px-4 py-2 text-slate-700">Total</td>
                <td className="px-4 py-2 text-right text-slate-700">{totals.count}</td>
                <td className="px-4 py-2 text-right text-slate-900">{totals.hours.toFixed(1)}</td>
                <td className="px-4 py-2 text-right text-slate-700">{totals.billableHours.toFixed(1)}</td>
                <td className="px-4 py-2 text-right text-slate-900">{aud.format(totals.amount)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
