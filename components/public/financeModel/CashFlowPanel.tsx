"use client";

// Per-budget-line timing editor + the resulting monthly cash flow table
// and chart -- the foundation the debt-drawdown simulation and returns
// engine (XIRR/leveraged IRR/etc) build on top of. A line's timing comes
// from its linked Timeline task when set (locking the date fields, since
// the task IS the source of truth then) or a manual date fallback.
import { useState } from "react";
import { Info } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import CashFlowChart from "./CashFlowChart";
import type { MonthlyCashFlow, TimedBudgetLine, TimingProfile } from "@/lib/cashFlowEngine";

const TIMING_PROFILES: TimingProfile[] = ["Lump Sum at Start", "Lump Sum at End", "Even Spread", "S-Curve"];

export type CashFlowBudgetLine = TimedBudgetLine;

interface TimelineTaskOption {
  id: string;
  name: string;
  start_date: string | null;
  due_date: string | null;
}

interface Props {
  budgetLines: CashFlowBudgetLine[];
  tasks: TimelineTaskOption[];
  monthlyRows: MonthlyCashFlow[];
  unresolvedLines: CashFlowBudgetLine[];
  onUpdateLineTiming: (lineId: string, updates: { linkedTaskId?: string | null; timingProfile?: TimingProfile | null; timingStartDate?: string | null; timingEndDate?: string | null }) => void;
}

export default function CashFlowPanel({ budgetLines, tasks, monthlyRows, unresolvedLines, onUpdateLineTiming }: Props) {
  const [saving, setSaving] = useState<string | null>(null);

  const handleChange = async (lineId: string, updates: Parameters<Props["onUpdateLineTiming"]>[1]) => {
    setSaving(lineId);
    await onUpdateLineTiming(lineId, updates);
    setSaving(null);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Cash Flow</p>

      {unresolvedLines.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 text-[11px] text-amber-700 flex items-start gap-2">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>{unresolvedLines.length} budget line{unresolvedLines.length === 1 ? "" : "s"} have no timing set (no linked task, no manual dates) and are excluded from the cash flow below: {unresolvedLines.map(l => l.label).join(", ")}.</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px] min-w-[720px]">
          <thead>
            <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
              <th className="py-1.5 pr-2">Line</th>
              <th className="py-1.5 px-2">Linked task</th>
              <th className="py-1.5 px-2">Profile</th>
              <th className="py-1.5 px-2">Start</th>
              <th className="py-1.5 px-2">End</th>
            </tr>
          </thead>
          <tbody>
            {budgetLines.map(line => {
              const hasTask = !!line.linkedTaskId;
              const isDim = saving === line.id;
              return (
                <tr key={line.id} className={`border-t border-slate-50 ${isDim ? "opacity-50" : ""}`}>
                  <td className="py-1.5 pr-2 text-slate-700 font-medium whitespace-nowrap">{line.category ? `${line.category} — ` : ""}{line.label}</td>
                  <td className="py-1.5 px-2">
                    <select
                      value={line.linkedTaskId || ""}
                      onChange={e => handleChange(line.id, { linkedTaskId: e.target.value || null })}
                      className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 max-w-[220px]"
                    >
                      <option value="">None (manual dates)</option>
                      {tasks.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    <select
                      value={line.timingProfile || ""}
                      onChange={e => handleChange(line.id, { timingProfile: (e.target.value || null) as TimingProfile | null })}
                      className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600"
                    >
                      <option value="">Lump Sum at End (default)</option>
                      {TIMING_PROFILES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="date" disabled={hasTask} value={line.timingStartDate || ""}
                      onChange={e => handleChange(line.id, { timingStartDate: e.target.value || null })}
                      className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 disabled:opacity-40 disabled:bg-slate-50"
                    />
                  </td>
                  <td className="py-1.5 px-2">
                    <input
                      type="date" disabled={hasTask} value={line.timingEndDate || ""}
                      onChange={e => handleChange(line.id, { timingEndDate: e.target.value || null })}
                      className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600 disabled:opacity-40 disabled:bg-slate-50"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-100 pt-4">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cumulative Net Cash Position</p>
        <CashFlowChart rows={monthlyRows} />
      </div>

      {monthlyRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[480px]">
            <thead>
              <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                <th className="py-1 pr-2">Month</th>
                <th className="py-1 px-2 text-right">Cash In</th>
                <th className="py-1 px-2 text-right">Cash Out</th>
                <th className="py-1 px-2 text-right">Net</th>
                <th className="py-1 px-2 text-right">Cumulative</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map(r => (
                <tr key={r.month} className="border-t border-slate-50">
                  <td className="py-1 pr-2 text-slate-500">{r.month}</td>
                  <td className="py-1 px-2 text-right text-emerald-600">{r.cashIn > 0 ? money(r.cashIn) : "—"}</td>
                  <td className="py-1 px-2 text-right text-rose-600">{r.cashOut > 0 ? money(r.cashOut) : "—"}</td>
                  <td className={`py-1 px-2 text-right font-medium ${r.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(r.net)}</td>
                  <td className={`py-1 px-2 text-right font-bold ${r.cumulative >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{money(r.cumulative)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
