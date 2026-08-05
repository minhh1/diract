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
// optional and only wired up by DashboardWidgetRenderer's record-scoped
// (per-matter) dashboards -- LawFirmQuickGlance's company-wide usage omits
// them, so a staff row still expands to show entries there, just read-only.
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
  // Everything below is optional -- only DashboardWidgetRenderer's
  // record-scoped (per-matter) dashboards wire these up, since editing an
  // individual entry only makes sense with a real tableId/companyId to
  // write through and an isAdmin flag to gate it. LawFirmQuickGlance's
  // company-wide usage omits them; staff rows still expand there, just
  // without the edit affordance.
  fields?: CustomTableField[];
  tableId?: string;
  companyId?: string;
  isAdmin?: boolean;
  onChanged?: () => void;
}

export default function TimeFeesReportWidget({ records, fields, tableId, companyId, isAdmin, onChanged }: Props) {
  const [preset, setPreset] = useState<RangePreset>("this_month");
  const now = useMemo(() => new Date(), []);
  const [customStart, setCustomStart] = useState(() => toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(() => toDateInput(now));
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<CustomTableRecord | null>(null);
  const canEdit = !!(isAdmin && fields && tableId && companyId && onChanged);

  const { start, end } = useMemo(() => {
    if (preset === "this_month") return { start: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), end: toDateInput(now) };
    if (preset === "this_week") return { start: toDateInput(startOfWeek(now)), end: toDateInput(now) };
    if (preset === "all_time") return { start: null as string | null, end: null as string | null };
    return { start: customStart, end: customEnd };
  }, [preset, now, customStart, customEnd]);

  const { rows, entriesByStaff } = useMemo(() => {
    const byStaff = new Map<string, { hours: number; billableHours: number; amount: number; count: number }>();
    const entries = new Map<string, CustomTableRecord[]>();
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
      const list = entries.get(staffId) || [];
      list.push(r);
      entries.set(staffId, list);
    }
    for (const list of entries.values()) list.sort((a, b) => String(b.values.date || "").localeCompare(String(a.values.date || "")));
    const rows = [...byStaff.entries()].map(([staffId, v]) => ({ staffId, ...v })).sort((a, b) => b.hours - a.hours);
    return { rows, entriesByStaff: entries };
  }, [records, start, end]);

  // Keep the modal showing live values -- e.g. after one field's onCommit
  // triggers onChanged()'s refetch, the next field rendered should reflect
  // what's actually saved, not a stale snapshot from when the modal opened.
  const liveEditingEntry = useMemo(
    () => (editingEntry ? records.find(r => r.id === editingEntry.id) || editingEntry : null),
    [editingEntry, records]
  );

  const staffIds = useMemo(() => rows.map(r => r.staffId), [rows]);
  const staffNames = useRecordNames("entities", staffIds);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    hours: acc.hours + r.hours, billableHours: acc.billableHours + r.billableHours, amount: acc.amount + r.amount, count: acc.count + r.count,
  }), { hours: 0, billableHours: 0, amount: 0, count: 0 }), [rows]);

  // Same immediate-commit-per-field convention as DashboardGrid's cell
  // editing -- there's no separate "Save" button, each field writes through
  // as soon as it's changed.
  const handleFieldCommit = async (recordId: string, field: CustomTableField, value: any) => {
    if (!tableId || !companyId || !fields) return;
    const result = await updateRecord(recordId, tableId, companyId, { [field.field_key]: value }, fields);
    if (result && 'error' in result) { window.alert(result.error); return; }
    onChanged?.();
  };

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
            {rows.map(r => {
              const isExpanded = expandedStaffId === r.staffId;
              return (
                <Fragment key={r.staffId}>
                  <tr
                    onClick={() => setExpandedStaffId(isExpanded ? null : r.staffId)}
                    className="border-b border-slate-50 cursor-pointer hover:bg-slate-50/60 transition-colors"
                  >
                    <td className="px-4 py-2 font-medium text-slate-700">
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? <ChevronDown size={12} className="text-slate-300 shrink-0" /> : <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                        {staffNames.get(r.staffId) || r.staffId.slice(0, 8)}
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
                          {(entriesByStaff.get(r.staffId) || []).map(entry => (
                            <div key={entry.id} className="flex items-center gap-3 px-3 py-1.5 bg-white border border-slate-100 rounded-xl text-[11px]">
                              <span className="text-slate-400 w-20 shrink-0">{String(entry.values.date || "").slice(0, 10)}</span>
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
                          ))}
                          {(entriesByStaff.get(r.staffId) || []).length === 0 && (
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
