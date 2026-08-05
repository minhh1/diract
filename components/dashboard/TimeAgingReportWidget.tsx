"use client";

// Old, unbilled time -- every Time & Fee Entries record with no Invoice
// link (billed vs unbilled is the Invoice relation being set, not the
// free-text `status` field -- see template_law_firm_seed.sql's own header
// comment on that table) whose own date is more than `agingDays` old,
// oldest first so the longest-outstanding work surfaces at the top.
// Written Off entries are excluded -- that status means it was deliberately
// decided this will never be billed, not that it's overdue to be.
//
// "Times" lists each qualifying entry individually; "Matters" groups them
// by matter and shows just the OLDEST unbilled date per matter, so an admin
// can see which matters have been sitting the longest without needing to
// scan every line. Reads `records` already RLS-scoped the same way
// TimeFeesReportWidget does -- see that file's header comment.
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import { useMatterNumbers } from "@/lib/hooks/useMatterNumbers";
import { formatDateAU } from "@/lib/formatDate";
import type { CustomTableRecord } from "@/lib/hooks/useCustomTable";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// No "show all" option -- an unbilled list with no floor at all tends
// toward "every entry ever," which is what made this widget too long to
// live in a compact space like Quick Glance in the first place.
const AGING_OPTIONS = [5, 10, 15, 30];

interface AgedItem {
  recordId: string;
  matterId: string;
  staffId: string;
  date: string;
  description: string;
  hours: number;
  daysUnbilled: number;
}

// `agingDays` seeds the initial selection (e.g. a dashboard-builder widget's
// admin-configured default) -- the quick-filter buttons below then own it,
// same "prop as initial state" shape as anything else in this app with a
// user-adjustable control.
export default function TimeAgingReportWidget({ records, agingDays }: { records: CustomTableRecord[]; agingDays: number }) {
  const [view, setView] = useState<"times" | "matters">("times");
  const [selectedAgingDays, setSelectedAgingDays] = useState(
    () => AGING_OPTIONS.includes(agingDays) ? agingDays : AGING_OPTIONS[AGING_OPTIONS.length - 1]
  );

  const items = useMemo(() => {
    const now = Date.now();
    const out: AgedItem[] = [];
    for (const r of records) {
      if (r.values.invoice) continue; // billed
      if (r.values.status === "Written Off") continue;
      const matterId = String(r.values.matter || "");
      const date = String(r.values.date || "").slice(0, 10);
      if (!matterId || !date) continue;
      const daysUnbilled = Math.floor((now - new Date(date).getTime()) / MS_PER_DAY);
      if (daysUnbilled < selectedAgingDays) continue;
      out.push({
        recordId: r.id, matterId, staffId: String(r.values.staff || ""), date,
        description: String(r.values.description || ""), hours: Number(r.values.duration_hours) || 0, daysUnbilled,
      });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date)); // oldest first
  }, [records, selectedAgingDays]);

  // items is already oldest-first, so the FIRST time a matter is seen while
  // walking it IS that matter's oldest unbilled entry -- count/hours still
  // accumulate every later (newer) entry for the same matter.
  const matterRows = useMemo(() => {
    const byMatter = new Map<string, { oldestDate: string; daysUnbilled: number; count: number; hours: number }>();
    for (const it of items) {
      const existing = byMatter.get(it.matterId);
      if (!existing) {
        byMatter.set(it.matterId, { oldestDate: it.date, daysUnbilled: it.daysUnbilled, count: 1, hours: it.hours });
      } else {
        existing.count += 1;
        existing.hours += it.hours;
      }
    }
    return [...byMatter.entries()].map(([matterId, v]) => ({ matterId, ...v })).sort((a, b) => a.oldestDate.localeCompare(b.oldestDate));
  }, [items]);

  const matterIds = useMemo(() => Array.from(new Set([...items.map(i => i.matterId), ...matterRows.map(m => m.matterId)])), [items, matterRows]);
  const staffIds = useMemo(() => items.map(i => i.staffId), [items]);
  const matterNames = useRecordNames("projects", matterIds);
  const matterNumbers = useMatterNumbers(matterIds);
  const staffNames = useRecordNames("entities", staffIds);
  const matterLabel = (id: string) => matterNumbers.get(id) || matterNames.get(id) || id.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
            <AlertTriangle size={18} className="text-amber-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Old Time ({selectedAgingDays}+ days unbilled)</p>
            <p className="text-[11px] text-slate-400">Time not yet invoiced, oldest first</p>
          </div>
        </div>
        <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold">
          <button onClick={() => setView("times")} className={`px-3 py-1.5 rounded-full transition-all ${view === "times" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>Times</button>
          <button onClick={() => setView("matters")} className={`px-3 py-1.5 rounded-full transition-all ${view === "matters" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>Matters</button>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mr-1">Older than</span>
        {AGING_OPTIONS.map(days => (
          <button
            key={days}
            onClick={() => setSelectedAgingDays(days)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
              selectedAgingDays === days ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {days}d
          </button>
        ))}
      </div>

      {/* Capped height + its own scroll -- this list previously grew to fit
          every unbilled entry ever, which made it the tallest thing on
          Quick Glance by far. Sticky thead so the column labels stay put
          while scrolling. */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="max-h-72 overflow-auto">
        {view === "times" ? (
          <table className="w-full text-[12px] min-w-[720px]">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter</th>
                <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Staff</th>
                <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Description</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Hours</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Days unbilled</th>
              </tr>
            </thead>
            <tbody>
              {items.map(it => (
                <tr key={it.recordId} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{matterLabel(it.matterId)}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{staffNames.get(it.staffId) || "-"}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateAU(it.date)}</td>
                  <td className="px-4 py-2 text-slate-500 max-w-xs truncate">{it.description}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{it.hours.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right font-bold text-amber-600">{it.daysUnbilled}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-[11px] text-slate-300 italic">Nothing unbilled past {selectedAgingDays} days</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-[12px] min-w-[640px]">
            <thead className="sticky top-0 z-10 bg-slate-50">
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Matter</th>
                <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Oldest unbilled date</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Days unbilled</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Unbilled entries</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Unbilled hours</th>
              </tr>
            </thead>
            <tbody>
              {matterRows.map(m => (
                <tr key={m.matterId} className="border-b border-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap">{matterLabel(m.matterId)}</td>
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">{formatDateAU(m.oldestDate)}</td>
                  <td className="px-4 py-2 text-right font-bold text-amber-600">{m.daysUnbilled}</td>
                  <td className="px-4 py-2 text-right text-slate-500">{m.count}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{m.hours.toFixed(1)}</td>
                </tr>
              ))}
              {matterRows.length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-[11px] text-slate-300 italic">Nothing unbilled past {selectedAgingDays} days</td></tr>
              )}
            </tbody>
          </table>
        )}
        </div>
      </div>
    </div>
  );
}
