"use client";

// Presentational Budget vs Actual table -- shared by OverviewSubtab
// (internal, editable) and PublicFinanceModelContent's public-mode render
// (read-only), so the two never drift visually.
import { X } from "lucide-react";

export interface BudgetLine {
  id: string;
  category: string | null;
  label: string | null;
  budgeted_amount: number | null;
  actual: number | null;
}

export function money(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

interface Props {
  budgetLines: BudgetLine[];
  editable: boolean;
  onDelete?: (id: string) => void;
}

export default function BudgetVsActualTable({ budgetLines, editable, onDelete }: Props) {
  const budgetedTotal = budgetLines.reduce((sum, l) => sum + (l.budgeted_amount ?? 0), 0);
  const actualTotal = budgetLines.reduce((sum, l) => sum + (l.actual ?? 0), 0);

  if (budgetLines.length === 0) {
    return <p className="text-[12px] text-slate-400 px-6 py-4">No budget lines yet.</p>;
  }

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
          <th className="px-6 py-2 font-bold">Category</th>
          <th className="px-2 py-2 font-bold">Label</th>
          <th className="px-2 py-2 font-bold text-right">Budgeted</th>
          <th className="px-2 py-2 font-bold text-right">Actual</th>
          <th className="px-2 py-2 font-bold text-right">Variance</th>
          {editable && <th className="px-6 py-2 font-bold"></th>}
        </tr>
      </thead>
      <tbody>
        {budgetLines.map(line => {
          const budgeted = line.budgeted_amount ?? 0;
          const variance = line.actual == null ? null : line.actual - budgeted;
          return (
            <tr key={line.id} className="border-t border-slate-50 hover:bg-slate-50/60">
              <td className="px-6 py-2 text-slate-500">{line.category}</td>
              <td className="px-2 py-2 text-slate-700 font-medium">{line.label}</td>
              <td className="px-2 py-2 text-right text-slate-700">{money(budgeted)}</td>
              <td className="px-2 py-2 text-right text-slate-700">{line.actual == null ? "—" : money(line.actual)}</td>
              <td className={`px-2 py-2 text-right font-medium ${variance == null ? "text-slate-300" : variance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                {variance == null ? "—" : `${variance > 0 ? "+" : ""}${money(variance)}`}
              </td>
              {editable && (
                <td className="px-6 py-2 text-right">
                  <button onClick={() => onDelete?.(line.id)} className="text-slate-300 hover:text-rose-500">
                    <X size={12} />
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t border-slate-200 font-bold">
          <td className="px-6 py-2 text-slate-700" colSpan={2}>Total</td>
          <td className="px-2 py-2 text-right text-slate-700">{money(budgetedTotal)}</td>
          <td className="px-2 py-2 text-right text-slate-700">{money(actualTotal)}</td>
          <td className={`px-2 py-2 text-right ${actualTotal - budgetedTotal > 0 ? "text-rose-600" : "text-emerald-600"}`}>
            {actualTotal - budgetedTotal > 0 ? "+" : ""}{money(actualTotal - budgetedTotal)}
          </td>
          {editable && <td />}
        </tr>
      </tfoot>
    </table>
  );
}
