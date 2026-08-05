"use client";

// Time & fees recorded per staff member over a chosen period -- the primary
// replacement for browsing the raw Time & Fee Entries table (see
// components/Sidebar.tsx's TABLE_HIDDEN_FROM_SIDEBAR list). Reads `records`
// exactly as loaded by the dashboard (already RLS-scoped -- see supabase/
// migrations/20260728220000_time_entry_view_scope.sql): a company admin
// sees every staff member's row here, a non-admin only ever sees their own
// row, because the database already filtered `records` down to that before
// this component ever runs. No admin/user branching needed in this file.
//
// Editing individual entries (fields/tableId/companyId/onChanged below) is
// optional -- wired up by both DashboardWidgetRenderer's record-scoped
// (per-matter) dashboards and LawFirmQuickGlance's company-wide usage.
// Any caller that can't supply a real tableId/companyId (e.g. a
// builder-preview context) just gets a read-only widget; staff rows still
// expand there, just without the edit affordance.
import { Fragment, useMemo, useState } from "react";
import { Clock, ChevronDown, ChevronRight, Pencil, X } from "lucide-react";
import { useRecordNames } from "@/lib/hooks/useRecordNames";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { updateRecord } from "@/lib/services/customTableService";
import FieldValueInput from "./FieldValueInput";
import { ymdInSydney } from "@/lib/companyLocalDate";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

type RangePreset = "this_month" | "this_week" | "all_time" | "custom";
const PRESET_LABELS: Record<RangePreset, string> = {
  this_month: "This month", this_week: "This week", all_time: "All time", custom: "Custom",
};

// How the table below is grouped -- 'timekeeper' (the original/default
// behaviour) rolls every entry up per staff member; 'time' rolls up per
// date instead; 'entries' skips grouping entirely and shows one row per
// entry, which is also the fastest way to reach the edit pencil (no
// expand click first).
type GroupBy = "timekeeper" | "time" | "entries";
const GROUP_LABELS: Record<GroupBy, string> = {
  timekeeper: "By timekeeper", time: "By time", entries: "By entries",
};

function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1) - day; // back up to Monday
  const res = new Date(d);
  res.setDate(d.getDate() + diff);
  res.setHours(0, 0, 0, 0);
  return res;
}

const toDateInput = (d: Date) => ymdInSydney(d);

interface Props {
  records: CustomTableRecord[];
  // Everything below is optional -- editing an individual entry only makes
  // sense with a real tableId/companyId to write through, so any caller
  // that can't supply them just gets a read-only widget; staff rows still
  // expand there, just without the edit affordance.
  fields?: CustomTableField[];
  tableId?: string;
  companyId?: string;
  isAdmin?: boolean;
  onChanged?: () => void;
}

export default function TimeFeesReportWidget({ records, fields, tableId, companyId, onChanged }: Props) {
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const [groupBy, setGroupBy] = useState<GroupBy>("timekeeper");
  const now = useMemo(() => new Date(), []);
  const [customStart, setCustomStart] = useState(() => toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(() => toDateInput(now));
  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<CustomTableRecord | null>(null);
  // Matches DashboardGrid.tsx's convention: isAdmin gates layout/admin-only
  // actions, not basic record editing, which is open to any company member
  // (the underlying RLS policies on company_table_values are the real gate).
  const canEdit = !!(fields && tableId && companyId && onChanged);

  const { start, end } = useMemo(() => {
    if (preset === "this_month") return { start: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), end: toDateInput(now) };
    if (preset === "this_week") return { start: toDateInput(startOfWeek(now)), end: toDateInput(now) };
    if (preset === "all_time") return { start: null as string | null, end: null as string | null };
    return { start: customStart, end: customEnd };
  }, [preset, now, customStart, customEnd]);

  const periodEntries = useMemo(() => records.filter(r => {
    const staffId = String(r.values.staff || "");
    if (!staffId) return false;
    const date = String(r.values.date || "").slice(0, 10);
    if (start && date < start) return false;
    if (end && date > end) return false;
    return true;
  }), [records, start, end]);

  // 'timekeeper' groups by staff, 'time' groups by date -- same shape
  // either way (a group key + its own entries + rolled-up totals), so both
  // reuse the same expandable-group table below; only how the key is
  // derived and displayed differs.
  const { rows, entriesByGroup } = useMemo(() => {
    const byGroup = new Map<string, { hours: number; billableHours: number; amount: number; count: number }>();
    const entries = new Map<string, CustomTableRecord[]>();
    for (const r of periodEntries) {
      const key = groupBy === "time" ? String(r.values.date || "").slice(0, 10) : String(r.values.staff || "");
      const hours = Number(r.values.duration_hours) || 0;
      const amount = Number(r.values.amount) || 0;
      const entry = byGroup.get(key) || { hours: 0, billableHours: 0, amount: 0, count: 0 };
      entry.hours += hours;
      if (r.values.billable) entry.billableHours += hours;
      entry.amount += amount;
      entry.count += 1;
      byGroup.set(key, entry);
      const list = entries.get(key) || [];
      list.push(r);
      entries.set(key, list);
    }
    for (const list of entries.values()) list.sort((a, b) => String(b.values.date || "").localeCompare(String(a.values.date || "")));
    const rows = [...byGroup.entries()].map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => groupBy === "time" ? b.key.localeCompare(a.key) : b.hours - a.hours);
    return { rows, entriesByGroup: entries };
  }, [periodEntries, groupBy]);

  // 'entries' mode: no grouping at all, just every entry in the period as
  // its own row, newest first -- the quickest path to the edit pencil.
  const flatEntries = useMemo(
    () => [...periodEntries].sort((a, b) => String(b.values.date || "").localeCompare(String(a.values.date || ""))),
    [periodEntries]
  );

  // Keep the modal showing live values -- e.g. after one field's onCommit
  // triggers onChanged()'s refetch, the next field rendered should reflect
  // what's actually saved, not a stale snapshot from when the modal opened.
  const liveEditingEntry = useMemo(
    () => (editingEntry ? records.find(r => r.id === editingEntry.id) || editingEntry : null),
    [editingEntry, records]
  );

  // Every staff id appearing anywhere in the period, not just the group
  // keys -- 'time' mode's groups are dates, and 'entries' mode has no
  // groups at all, so individual entry rows in both need to show their own
  // staff name directly (implied by the group header in 'timekeeper' mode,
  // where this is a superset that still resolves fine).
  const staffIds = useMemo(() => [...new Set(periodEntries.map(r => String(r.values.staff || "")))], [periodEntries]);
  const staffNames = useRecordNames("entities", staffIds);

  const totals = useMemo(() => periodEntries.reduce((acc, r) => {
    const hours = Number(r.values.duration_hours) || 0;
    return {
      hours: acc.hours + hours,
      billableHours: acc.billableHours + (r.values.billable ? hours : 0),
      amount: acc.amount + (Number(r.values.amount) || 0),
      count: acc.count + 1,
    };
  }, { hours: 0, billableHours: 0, amount: 0, count: 0 }), [periodEntries]);

  // Same immediate-commit-per-field convention as DashboardGrid's cell
  // editing -- there's no separate "Save" button, each field writes through
  // as soon as it's changed.
  const handleFieldCommit = async (recordId: string, field: CustomTableField, value: any) => {
    if (!tableId || !companyId || !fields) return;
    const result = await updateRecord(recordId, tableId, companyId, { [field.field_key]: value }, fields);
    if (result && 'error' in result) { window.alert(result.error); return; }
    onChanged?.();
  };

  const groupLabel = (key: string) =>
    groupBy === "time"
      ? new Date(key + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : staffNames.get(key) || key.slice(0, 8);

  // Shared row markup for one entry -- used both inside an expanded group
  // ('timekeeper'/'time' modes) and directly in the flat 'entries' table.
  // showStaff is false in 'timekeeper' mode, where the group header above
  // it already names the staff member.
  const EntryRow = ({ entry, showStaff }: { entry: CustomTableRecord; showStaff: boolean }) => (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-white border border-slate-100 rounded-xl text-[11px]">
      <span className="text-slate-400 w-20 shrink-0">{String(entry.values.date || "").slice(0, 10)}</span>
      {showStaff && (
        <span className="text-slate-600 font-medium w-24 shrink-0 truncate">
          {staffNames.get(String(entry.values.staff || "")) || "-"}
        </span>
      )}
      <span className="flex-1 min-w-0 truncate text-slate-600">{entry.values.description || <span className="italic text-slate-300">No description</span>}</span>
      <span className="text-slate-500 shrink-0">{Number(entry.values.duration_hours) || 0}h</span>
      <span className="text-slate-500 shrink-0">${Number(entry.values.rate) || 0}/hr</span>
      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${entry.values.billable ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
        {entry.values.billable ? 'Billable' : 'Non-billable'}
      </span>
      <span className="font-semibold text-slate-900 w-16 text-right shrink-0">{aud.format(Number(entry.values.amount) || 0)}</span>
      {canEdit && (
        <button
          onClick={e => { e.stopPropagation(); setEditingEntry(entry); }}
          className="p-1 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 rounded-full transition-all shrink-0"
          title="Adjust this entry"
        >
          <Pencil size={11} />
        </button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Clock size={18} className="text-indigo-700" />
          </div>
          <div>
            <p className="text-[13px] font-bold text-slate-800">Time & Fees Report</p>
            <p className="text-[11px] text-slate-400">
              {groupBy === "time" ? "Time recorded per day" : groupBy === "entries" ? "Every entry recorded" : "Time recorded per staff member"}
              {start ? ` · ${start}${end && end !== start ? ` to ${end}` : ""}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 rounded-full p-0.5 text-[10px] font-bold">
            {(Object.keys(GROUP_LABELS) as GroupBy[]).map(g => (
              <button key={g} onClick={() => { setGroupBy(g); setExpandedGroupKey(null); }}
                className={`px-3 py-1.5 rounded-full transition-all ${groupBy === g ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                {GROUP_LABELS[g]}
              </button>
            ))}
          </div>
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

      {groupBy === "entries" ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1">
          {flatEntries.map(entry => <EntryRow key={entry.id} entry={entry} showStaff />)}
          {flatEntries.length === 0 && (
            <p className="text-center py-8 text-[11px] text-slate-300 italic">No time recorded in this period</p>
          )}
          {flatEntries.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 mt-2 font-bold text-[11px]">
              <span className="flex-1">Total ({totals.count})</span>
              <span className="text-slate-700">{totals.hours.toFixed(1)}h</span>
              <span className="text-slate-900">{aud.format(totals.amount)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-[12px] table-fixed min-w-[560px]">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-[34%]">{groupBy === "time" ? "Date" : "Staff"}</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-[14%]">Entries</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-[14%]">Hours</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-[18%]">Billable hours</th>
                <th className="text-right px-4 py-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest w-[20%]">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const isExpanded = expandedGroupKey === r.key;
                return (
                  <Fragment key={r.key}>
                    <tr
                      onClick={() => setExpandedGroupKey(isExpanded ? null : r.key)}
                      className="border-b border-slate-50 cursor-pointer hover:bg-slate-50/60 transition-colors"
                    >
                      <td className="px-4 py-2 font-medium text-slate-700">
                        <span className="flex items-center gap-1.5">
                          {isExpanded ? <ChevronDown size={12} className="text-slate-300 shrink-0" /> : <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                          {groupLabel(r.key)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-500">{r.count}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{r.hours.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right text-slate-500">{r.billableHours.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{aud.format(r.amount)}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <td colSpan={5} className="px-4 py-3">
                          <div className="space-y-1">
                            {(entriesByGroup.get(r.key) || []).map(entry => (
                              <EntryRow key={entry.id} entry={entry} showStaff={groupBy === "time"} />
                            ))}
                            {(entriesByGroup.get(r.key) || []).length === 0 && (
                              <p className="text-[11px] text-slate-300 italic px-3 py-1.5">No individual entries in this period</p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
      )}

      {editingEntry && liveEditingEntry && fields && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
          <div className="bg-white rounded-[32px] p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-light uppercase tracking-wide text-slate-900">Adjust entry</h3>
              <button onClick={() => setEditingEntry(null)} className="p-2 text-slate-300 hover:text-black">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              {fields.filter(f => !f.formula_type).map(field => (
                <div key={field.id}>
                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
                    {field.label}
                  </label>
                  <FieldValueInput
                    field={field}
                    value={liveEditingEntry.values[field.field_key]}
                    displayValue={liveEditingEntry.displayValues?.[field.field_key]}
                    onCommit={value => handleFieldCommit(liveEditingEntry.id, field, value)}
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => setEditingEntry(null)}
              className="w-full mt-5 py-3 bg-slate-900 text-white rounded-full text-[11px] font-bold uppercase tracking-widest"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
