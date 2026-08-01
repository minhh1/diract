"use client";

// Presentational Budget vs Actual table -- shared by OverviewSubtab
// (internal, editable) and PublicFinanceModelContent's public-mode render
// (read-only), so the two never drift visually.
import { useState } from "react";
import { X, ListTodo, Plus, Paperclip } from "lucide-react";
import AttachmentsList from "./AttachmentsList";

export interface BudgetLine {
  id: string;
  category: string | null;
  label: string | null;
  budgeted_amount: number | null;
  actual: number | null;
  linked_task_ids?: string | null;
  linked_task_id?: string | null;
  timing_profile?: string | null;
  timing_start_date?: string | null;
  timing_end_date?: string | null;
}

export interface TaskRef {
  id: string;
  name: string;
}

function parseTaskIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try { const arr = JSON.parse(json); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

function TasksCell({ line, tasks, onUpdate }: { line: BudgetLine; tasks: TaskRef[]; onUpdate: (ids: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const linkedIds = parseTaskIds(line.linked_task_ids);
  const linkedTasks = tasks.filter(t => linkedIds.includes(t.id));

  const toggle = (taskId: string) => {
    const next = linkedIds.includes(taskId) ? linkedIds.filter(id => id !== taskId) : [...linkedIds, taskId];
    onUpdate(next);
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-600">
        <ListTodo size={11} /> {linkedTasks.length > 0 ? `${linkedTasks.length} task${linkedTasks.length > 1 ? "s" : ""}` : <Plus size={11} />}
      </button>
      {open && (
        <div className="absolute z-10 top-6 right-0 bg-white border border-slate-200 rounded-xl shadow-lg p-2 w-56 max-h-56 overflow-y-auto">
          {tasks.length === 0 ? (
            <p className="text-[11px] text-slate-400 px-1 py-1">No tasks on this project's Timeline yet.</p>
          ) : tasks.map(t => (
            <label key={t.id} className="flex items-center gap-2 px-1 py-1 text-[11px] text-slate-600 hover:bg-slate-50 rounded cursor-pointer">
              <input type="checkbox" checked={linkedIds.includes(t.id)} onChange={() => toggle(t.id)} />
              {t.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentsCell({ projectId, lineId }: { projectId: string; lineId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-indigo-600">
        <Paperclip size={11} />
      </button>
      {open && (
        <div className="absolute z-10 top-6 right-0 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-64">
          <AttachmentsList projectId={projectId} attachableTable="budget_line" attachableId={lineId} compact />
        </div>
      )}
    </div>
  );
}

export function money(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

// Revenue lines are stored as positive magnitudes just like every cost
// category (budgeted_amount/actual never carry a sign in the DB -- every
// other reader, e.g. FeasibilitySubtab's category filters, assumes that).
// Signing only happens here, at render time, so Total reads as an actual
// net position instead of every line adding together regardless of
// direction.
function signed(category: string | null, amount: number): number {
  return category === "Revenue" ? amount : -amount;
}

interface Props {
  budgetLines: BudgetLine[];
  editable: boolean;
  onDelete?: (id: string) => void;
  tasks?: TaskRef[];
  onUpdateTasks?: (lineId: string, taskIds: string[]) => void;
  projectId?: string;
}

export default function BudgetVsActualTable({ budgetLines, editable, onDelete, tasks, onUpdateTasks, projectId }: Props) {
  const budgetedTotal = budgetLines.reduce((sum, l) => sum + signed(l.category, l.budgeted_amount ?? 0), 0);
  const actualTotal = budgetLines.reduce((sum, l) => sum + signed(l.category, l.actual ?? 0), 0);
  const showTasks = editable && !!tasks && !!onUpdateTasks;
  const showAttachments = editable && !!projectId;

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
          {showTasks && <th className="px-2 py-2 font-bold">Tasks</th>}
          {showAttachments && <th className="px-2 py-2 font-bold"></th>}
          {editable && <th className="px-6 py-2 font-bold"></th>}
        </tr>
      </thead>
      <tbody>
        {budgetLines.map(line => {
          const budgeted = signed(line.category, line.budgeted_amount ?? 0);
          const actual = line.actual == null ? null : signed(line.category, line.actual);
          const variance = actual == null ? null : actual - budgeted;
          return (
            <tr key={line.id} className="border-t border-slate-50 hover:bg-slate-50/60">
              <td className="px-6 py-2 text-slate-500">{line.category}</td>
              <td className="px-2 py-2 text-slate-700 font-medium">{line.label}</td>
              <td className="px-2 py-2 text-right text-slate-700">{money(budgeted)}</td>
              <td className="px-2 py-2 text-right text-slate-700">{actual == null ? "—" : money(actual)}</td>
              <td className={`px-2 py-2 text-right font-medium ${variance == null ? "text-slate-300" : variance > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {variance == null ? "—" : `${variance > 0 ? "+" : ""}${money(variance)}`}
              </td>
              {showTasks && (
                <td className="px-2 py-2">
                  <TasksCell line={line} tasks={tasks!} onUpdate={ids => onUpdateTasks!(line.id, ids)} />
                </td>
              )}
              {showAttachments && (
                <td className="px-2 py-2">
                  <AttachmentsCell projectId={projectId!} lineId={line.id} />
                </td>
              )}
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
          <td className={`px-2 py-2 text-right ${actualTotal - budgetedTotal > 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {actualTotal - budgetedTotal > 0 ? "+" : ""}{money(actualTotal - budgetedTotal)}
          </td>
          {showTasks && <td />}
          {showAttachments && <td />}
          {editable && <td />}
        </tr>
      </tfoot>
    </table>
  );
}
