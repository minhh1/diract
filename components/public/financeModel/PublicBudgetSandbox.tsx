"use client";

// An editable example budget for the public demo link.
//
// Same reason the feasibility sandbox exists: a prospect should be able to
// ADD a budget line, change an amount and watch the totals and variance
// move, without a login. It runs entirely in React state -- no fetch, no
// write endpoint, nothing persisted -- so there is no way for anything
// typed here to reach real project data.
//
// Uses EXAMPLE lines rather than the project's own. Real amounts are
// redacted server-side on this link (they arrive as null), so the actual
// Budget vs Actual would render as a column of dots with nothing to
// recalculate -- useless for showing how budgeting works. Illustrative
// figures also mean a visitor can change anything without wondering
// whether they are editing something real.
import { useState } from "react";
import { Plus, Trash2, RotateCcw, Wallet } from "lucide-react";
import BudgetVsActualTable, { money, type BudgetLine } from "./BudgetVsActualTable";

// Costs are negative and revenue positive, matching the sign convention
// the real Budget vs Actual uses (see BudgetVsActualTable's `signed`).
const EXAMPLE_LINES: BudgetLine[] = [
  { id: "x1", category: "Revenue", label: "4 townhouse sales @ $1.15m", budgeted_amount: 4_600_000, actual: 4_520_000 },
  { id: "x2", category: "Acquisition", label: "Land purchase", budgeted_amount: 900_000, actual: 900_000 },
  { id: "x3", category: "Acquisition", label: "Stamp duty", budgeted_amount: 49_070, actual: 49_070 },
  { id: "x4", category: "Acquisition", label: "Legal & due diligence", budgeted_amount: 12_000, actual: 14_350 },
  { id: "x5", category: "Construction", label: "Builder contract", budgeted_amount: 2_160_000, actual: 2_204_000 },
  { id: "x6", category: "Construction", label: "Site works & services", budgeted_amount: 145_000, actual: 138_600 },
  { id: "x7", category: "Professional Fees", label: "Architect & engineering", budgeted_amount: 118_000, actual: 121_500 },
  { id: "x8", category: "Professional Fees", label: "Planning & permits", budgeted_amount: 54_000, actual: 54_000 },
  { id: "x9", category: "Contingency", label: "Contingency @ 5%", budgeted_amount: 108_000, actual: null },
  { id: "x10", category: "Finance Costs", label: "Construction loan interest", budgeted_amount: 186_000, actual: 172_400 },
  { id: "x11", category: "Other", label: "Marketing & agent commission", budgeted_amount: 115_000, actual: null },
];

const CATEGORIES = ["Revenue", "Acquisition", "Construction", "Professional Fees", "Contingency", "Finance Costs", "Other"];

export default function PublicBudgetSandbox() {
  const [lines, setLines] = useState<BudgetLine[]>(EXAMPLE_LINES);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ category: "Construction", label: "", budgeted: "", actual: "" });

  const add = () => {
    const budgeted = parseFloat(draft.budgeted);
    if (!draft.label.trim() || !Number.isFinite(budgeted)) return;
    const actual = parseFloat(draft.actual);
    setLines(prev => [...prev, {
      id: `new-${Date.now()}`,
      category: draft.category,
      label: draft.label.trim(),
      budgeted_amount: budgeted,
      actual: Number.isFinite(actual) ? actual : null,
    }]);
    setDraft({ category: "Construction", label: "", budgeted: "", actual: "" });
    setAdding(false);
  };

  const remove = (id: string) => setLines(prev => prev.filter(l => l.id !== id));
  const setAmount = (id: string, field: "budgeted_amount" | "actual", v: string) =>
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: v === "" ? null : Number(v) } : l));

  // Same signing the real table applies, so these totals match what the
  // product shows for an equivalent budget.
  const signed = (cat: string | null, n: number) => (cat === "Revenue" ? n : -n);
  const budgetedTotal = lines.reduce((s, l) => s + signed(l.category, l.budgeted_amount ?? 0), 0);
  const actualTotal = lines.reduce((s, l) => s + signed(l.category, l.actual ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 text-[11px] text-indigo-700 flex items-start gap-2">
        <Wallet size={13} className="mt-0.5 shrink-0" />
        <span>
          Try it: add a line, or edit any budgeted or actual amount, and the totals and variance update straight away.
          These are <strong>example figures</strong>, not this company&apos;s, and nothing is saved or sent anywhere &mdash; it
          all runs in your browser.
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Budget vs Actual (example)</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setLines(EXAMPLE_LINES)} className="flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-indigo-600">
              <RotateCcw size={11} /> Reset
            </button>
            <button onClick={() => setAdding(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
              <Plus size={11} /> Add budget line
            </button>
          </div>
        </div>

        {adding && (
          <div className="flex flex-wrap items-end gap-2 px-6 py-3 border-b border-slate-100 bg-slate-50">
            <div>
              <label className="text-[9px] text-slate-400 block mb-1">Category</label>
              <select value={draft.category} onChange={e => setDraft(p => ({ ...p, category: e.target.value }))}
                className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-400 block mb-1">Label</label>
              <input value={draft.label} onChange={e => setDraft(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Landscaping"
                className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-44" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 block mb-1">Budgeted ($)</label>
              <input type="number" value={draft.budgeted} onChange={e => setDraft(p => ({ ...p, budgeted: e.target.value }))}
                className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-32" />
            </div>
            <div>
              <label className="text-[9px] text-slate-400 block mb-1">Actual ($, optional)</label>
              <input type="number" value={draft.actual} onChange={e => setDraft(p => ({ ...p, actual: e.target.value }))}
                className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-32" />
            </div>
            <button onClick={add} disabled={!draft.label.trim() || !draft.budgeted}
              className="px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">Add</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[620px]">
            <thead>
              <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest border-b border-slate-100">
                <th className="px-4 py-2">Category</th>
                <th className="px-2 py-2">Label</th>
                <th className="px-2 py-2 text-right">Budgeted</th>
                <th className="px-2 py-2 text-right">Actual</th>
                <th className="px-2 py-2 text-right">Variance</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map(l => {
                const variance = l.actual == null ? null : signed(l.category, l.actual) - signed(l.category, l.budgeted_amount ?? 0);
                return (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="px-4 py-1.5 text-slate-500">{l.category}</td>
                    <td className="px-2 py-1.5 text-slate-700">{l.label}</td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" value={l.budgeted_amount ?? ""} onChange={e => setAmount(l.id, "budgeted_amount", e.target.value)}
                        className="w-28 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded-lg outline-none bg-transparent" />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <input type="number" value={l.actual ?? ""} onChange={e => setAmount(l.id, "actual", e.target.value)} placeholder="—"
                        className="w-28 text-right px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-400 rounded-lg outline-none bg-transparent" />
                    </td>
                    <td className={`px-2 py-1.5 text-right ${variance == null ? "text-slate-300" : variance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {variance == null ? "—" : `${variance > 0 ? "+" : ""}${money(variance)}`}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <button onClick={() => remove(l.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 font-bold text-slate-800">
                <td className="px-4 py-2" colSpan={2}>Net position</td>
                <td className="px-2 py-2 text-right">{money(budgetedTotal)}</td>
                <td className="px-2 py-2 text-right">{money(actualTotal)}</td>
                <td className={`px-2 py-2 text-right ${actualTotal - budgetedTotal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {actualTotal - budgetedTotal > 0 ? "+" : ""}{money(actualTotal - budgetedTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[11px] text-slate-400">
        In the product, budget lines carry timing (so they feed a dated monthly cash flow), link to Timeline tasks, and
        the Actual column fills itself from bank transactions synced out of Xero and matched to each line automatically.
      </div>
    </div>
  );
}
