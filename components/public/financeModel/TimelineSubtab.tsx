"use client";

// The Finance Model's Timeline subtab -- the project's real tasks
// (tasks.project_id = this project), organized by team (Legal,
// Administration, Property Management, Design, Development, Finance --
// real company Teams, tagged onto tasks via the many-to-many task_teams
// table so one task can genuinely belong to more than one, e.g. a
// settlement task can be both Legal and Finance) across three views:
//   - Card: a Kanban-style board, one column per team (+ Unassigned).
//   - Diagram: the Gantt bar chart, optionally grouped into team swimlanes.
//   - List: a sortable table with an inline completion checkbox and
//     click-to-edit team/date cells.
// Tasks with a start_date (see supabase/migrations/
// 20260731300000_tasks_start_date.sql) render as a full start->due
// duration bar in Diagram view; tasks without one render as a single-day
// marker at their due date instead.
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, List, GanttChartSquare, LayoutGrid, CheckCircle2, Circle, ClipboardList, Lock, X, ChevronLeft, ChevronRight, DollarSign, Search, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { applyChecklistTemplate } from "@/lib/applyChecklistTemplate";
import TemplateManager, { type Template } from "@/components/dashboard/TemplateManager";

interface Team { id: string; team_name: string; }
interface Profile { id: string; full_name: string | null; email: string | null; }

interface TaskRow {
  id: string;
  name: string;
  notes: string | null;
  start_date: string | null;
  due_date: string | null;
  is_completed: boolean;
  assignee_id: string | null;
  assignee: { id: string; full_name: string | null } | null;
  task_statuses: { label: string; color_hex: string | null } | null;
  teams: Team[];
  category: string | null;
  source_template_item_id: string | null;
}

const UNCATEGORIZED = "uncategorized";

const UNASSIGNED = "unassigned";

// A stable colour per team (by its position in the company's team list,
// not a random hash) -- the List view's Teams column shows these as
// small bars instead of full name chips, since team filtering above the
// table already tells you which team is which; hovering a bar still
// shows the name via its title attribute.
const TEAM_COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6", "#ef4444", "#14b8a6"];
function teamColor(teamId: string, teams: Team[]): string {
  const idx = teams.findIndex(t => t.id === teamId);
  return TEAM_COLORS[(idx < 0 ? 0 : idx) % TEAM_COLORS.length];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86400000;
}

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

// Every task that (directly or transitively) depends on `taskId` -- the
// "Also reschedule dependents" checkbox shifts these by the same delta as
// the edited task's own due date, so a chain of downstream tasks moves
// together instead of silently becoming inconsistent with the task that
// now blocks them.
function transitiveDependents(taskId: string, dependenciesByTask: Record<string, string[]>, allTasks: TaskRow[]): TaskRow[] {
  const result = new Set<string>();
  let frontier = [taskId];
  while (frontier.length) {
    const next: string[] = [];
    for (const t of allTasks) {
      if (result.has(t.id)) continue;
      const deps = dependenciesByTask[t.id] || [];
      if (frontier.some(f => deps.includes(f))) {
        result.add(t.id);
        next.push(t.id);
      }
    }
    frontier = next;
  }
  return allTasks.filter(t => result.has(t.id));
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday-start week -- same convention TransactionsSubtab.tsx already uses
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  return s;
}

function formatPeriodLabel(zoom: Exclude<Zoom, "all">, start: Date, end: Date): string {
  if (zoom === "month") return start.toLocaleDateString("en-AU", { month: "long", year: "numeric" });
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("en-AU", sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" });
  const endLabel = end.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

// Diagram-view zoom -- "all" keeps the original behaviour (every task
// bar scaled as a % of the whole task-date span, every task shown);
// "week"/"month" switch to a fixed pixels-per-day scale AND filter rows
// down to just the tasks overlapping the currently-paged period (see
// periodStart/periodEnd below) -- otherwise every one of a project's
// tasks would still get a row even though only a handful actually fall
// within the visible week/month.
type Zoom = "week" | "month" | "all";
const PX_PER_DAY: Record<Exclude<Zoom, "all">, number> = { week: 72, month: 22 };

function getTicks(zoom: Exclude<Zoom, "all">, start: Date, end: Date): { offsetDays: number; label: string }[] {
  const ticks: { offsetDays: number; label: string }[] = [];
  if (zoom === "week") {
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    for (let i = 0; i < 400 && cursor <= end; i++) {
      ticks.push({ offsetDays: daysBetween(start, cursor), label: cursor.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    for (let i = 0; i < 60 && cursor <= end; i++) {
      ticks.push({ offsetDays: daysBetween(start, cursor), label: cursor.toLocaleDateString("en-AU", { month: "short", year: "numeric" }) });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  return ticks;
}

// ── Shared "blocked by an incomplete prerequisite" check -- same AND-
// semantics task_dependencies.sql and ChecklistTab.tsx already use.
function blockedBy(taskId: string, dependenciesByTask: Record<string, string[]>, allTasks: TaskRow[]): TaskRow[] {
  return (dependenciesByTask[taskId] || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter((t): t is TaskRow => !!t && !t.is_completed);
}

// ── Edit modal: assignee, teams (multi-select), start/due dates,
// blocked-by (multi-select over the project's other tasks), and a
// "Convert to Budget Line" action (creates a new budget line via the same
// POST /api/finance-model/budget-lines the rest of the app already uses,
// with linkedTaskId=task.id so it automatically participates in Cash Flow
// timing -- see lib/cashFlowEngine.ts) -- opened from a List row, a Card,
// or a Diagram bar, all three views share this one.
function TaskEditModal({
  task, allTasks, teams, profiles, dependenciesByTask, companyId, userId, projectId, projectCreatedAt, onClose, onSaved,
}: {
  task: TaskRow; allTasks: TaskRow[]; teams: Team[]; profiles: Profile[];
  dependenciesByTask: Record<string, string[]>; companyId: string; userId: string | null; projectId: string;
  projectCreatedAt: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(task.assignee_id || "");
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set(task.teams.map(t => t.id)));
  const [startDate, setStartDate] = useState(task.start_date || "");
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.slice(0, 10) : "");
  const [taskCategory, setTaskCategory] = useState(task.category || "");
  const [dependsOn, setDependsOn] = useState<Set<string>>(new Set(dependenciesByTask[task.id] || []));
  const [dependsOnSearch, setDependsOnSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const originalDueDate = task.due_date ? task.due_date.slice(0, 10) : "";
  const dependents = useMemo(() => transitiveDependents(task.id, dependenciesByTask, allTasks), [task.id, dependenciesByTask, allTasks]);
  const [rescheduleDependents, setRescheduleDependents] = useState(false);

  const bumpDuration = (delta: number) => {
    if (!startDate || !dueDate) return;
    const startMs = new Date(startDate.slice(0, 10)).getTime();
    const d = new Date(dueDate);
    d.setDate(d.getDate() + delta);
    if (d.getTime() < startMs) return;
    setDueDate(d.toISOString().slice(0, 10));
  };
  const durationDays = startDate && dueDate ? Math.max(0, Math.round(daysBetween(new Date(startDate.slice(0, 10)), new Date(dueDate)))) : null;

  const taskCategoryOptions = useMemo(() => [...new Set(allTasks.map(t => t.category).filter((c): c is string => !!c))].sort(), [allTasks]);

  const [updatingTemplate, setUpdatingTemplate] = useState(false);
  const [templateUpdated, setTemplateUpdated] = useState(false);
  const updateSourceTemplateItem = async () => {
    if (!task.source_template_item_id || !projectCreatedAt) return;
    setUpdatingTemplate(true);
    const createdAt = new Date(projectCreatedAt);
    const due_offset_days = dueDate ? Math.round(daysBetween(createdAt, new Date(dueDate))) : null;
    const start_offset_days = startDate ? Math.round(daysBetween(createdAt, new Date(startDate.slice(0, 10)))) : null;
    await supabase.from("checklist_template_items").update({
      due_offset_days, due_anchor: "record_created", due_offset_mode: "calendar",
      start_offset_days, start_anchor: start_offset_days != null ? "record_created" : null,
    }).eq("id", task.source_template_item_id);
    setUpdatingTemplate(false);
    setTemplateUpdated(true);
  };

  const [showConvert, setShowConvert] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [convertCategory, setConvertCategory] = useState("");
  const [convertAmount, setConvertAmount] = useState("");
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(false);

  const openConvert = async () => {
    setShowConvert(true);
    if (categories.length) return;
    const res = await fetch("/api/finance-model/budget-categories");
    const json = await res.json().catch(() => ({}));
    const cats = json.categories || [];
    setCategories(cats);
    setConvertCategory(cats[0]?.name || "");
  };

  const convertToBudgetLine = async () => {
    const amount = parseFloat(convertAmount);
    if (!convertCategory || !Number.isFinite(amount)) return;
    setConverting(true);
    const res = await fetch("/api/finance-model/budget-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, category: convertCategory, label: task.name, budgetedAmount: amount, linkedTaskId: task.id }),
    });
    setConverting(false);
    if (res.ok) { setConverted(true); setShowConvert(false); }
  };

  const blocked = blockedBy(task.id, dependenciesByTask, allTasks);
  const isBlocked = blocked.length > 0;

  const toggleSet = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const toggleCompletion = async () => {
    if (!task.is_completed && isBlocked) return;
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    onSaved();
  };

  const save = async () => {
    setSaving(true);
    await supabase.from("tasks").update({
      assignee_id: assigneeId || null,
      start_date: startDate || null,
      due_date: dueDate || null,
      category: taskCategory.trim() || null,
    }).eq("id", task.id);

    await supabase.from("task_teams").delete().eq("task_id", task.id);
    if (teamIds.size) {
      await supabase.from("task_teams").insert(
        [...teamIds].map(team_id => ({ task_id: task.id, team_id, company_id: companyId, created_by: userId }))
      );
    }

    await supabase.from("task_dependencies").delete().eq("task_id", task.id);
    if (dependsOn.size) {
      await supabase.from("task_dependencies").insert(
        [...dependsOn].map(depends_on_task_id => ({ task_id: task.id, depends_on_task_id, company_id: companyId, created_by: userId }))
      );
    }

    if (rescheduleDependents && dueDate && originalDueDate) {
      const deltaDays = Math.round(daysBetween(new Date(originalDueDate), new Date(dueDate)));
      if (deltaDays !== 0 && dependents.length) {
        await Promise.all(dependents.map(dep => {
          const patch: Record<string, string> = {};
          if (dep.start_date) patch.start_date = shiftDate(dep.start_date, deltaDays);
          if (dep.due_date) patch.due_date = shiftDate(dep.due_date, deltaDays);
          return supabase.from("tasks").update(patch).eq("id", dep.id);
        }));
      }
    }

    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-lg mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex-1">
            <button onClick={toggleCompletion} disabled={!task.is_completed && isBlocked}
              className={`inline-flex items-center gap-2 text-[14px] font-bold ${task.is_completed ? "text-emerald-600" : "text-slate-800"}`}
              title={!task.is_completed && isBlocked ? `Blocked by: ${blocked.map(t => t.name).join(", ")}` : undefined}>
              {task.is_completed ? <CheckCircle2 size={16} /> : isBlocked ? <Lock size={14} className="text-slate-300" /> : <Circle size={16} className="text-slate-300" />}
              {task.name}
            </button>
            {task.notes && <p className="text-[11px] text-slate-400 mt-1">{task.notes}</p>}
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Assignee</p>
              <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white">
                <option value="">Unassigned</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </select>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Category (phase)</p>
              <input value={taskCategory} onChange={e => setTaskCategory(e.target.value)} list="task-categories" placeholder="e.g. Construction..."
                className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white" />
              <datalist id="task-categories">
                {taskCategoryOptions.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Start date</p>
              <input type="date" value={startDate ? startDate.slice(0, 10) : ""} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Due date</p>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white" />
            </div>
            {durationDays !== null && (
              <div className="col-span-2 flex items-center gap-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Duration</p>
                <button type="button" onClick={() => bumpDuration(-1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-[11px] font-bold leading-none">−</button>
                <span className="text-[12px] font-bold text-slate-700 w-14 text-center">{durationDays}d</span>
                <button type="button" onClick={() => bumpDuration(1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-[11px] font-bold leading-none">+</button>
              </div>
            )}
          </div>

          {dueDate !== originalDueDate && dependents.length > 0 && (
            <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
              <input type="checkbox" checked={rescheduleDependents} onChange={e => setRescheduleDependents(e.target.checked)} />
              Also reschedule {dependents.length} dependent task{dependents.length === 1 ? "" : "s"}
            </label>
          )}

          {task.source_template_item_id && (
            <div className="border-t border-slate-100 pt-3">
              {templateUpdated ? (
                <p className="text-[11px] font-medium text-emerald-600">Template updated to match this task's current dates.</p>
              ) : (
                <button type="button" onClick={updateSourceTemplateItem} disabled={updatingTemplate}
                  className="text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40">
                  {updatingTemplate ? "Updating template..." : "Update template with this task's dates"}
                </button>
              )}
            </div>
          )}

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Teams</p>
            <div className="flex flex-wrap gap-1.5">
              {teams.map(t => (
                <button key={t.id} type="button" onClick={() => toggleSet(teamIds, t.id, setTeamIds)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${teamIds.has(t.id) ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-400 hover:border-indigo-300"}`}>
                  {t.team_name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Blocked by</p>
            <div className="relative mb-1.5">
              <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                value={dependsOnSearch}
                onChange={e => setDependsOnSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {allTasks
                .filter(t => t.id !== task.id)
                // Selected tasks always stay visible (so a search doesn't
                // hide something you'd need to un-toggle) union'd with
                // whatever the search text currently matches -- with 80+
                // tasks on a real project, an unfiltered flat list was
                // unusable.
                .filter(t => dependsOn.has(t.id) || t.name.toLowerCase().includes(dependsOnSearch.trim().toLowerCase()))
                .map(t => (
                  <button key={t.id} type="button" onClick={() => toggleSet(dependsOn, t.id, setDependsOn)}
                    className={`px-2.5 py-1 rounded-full text-[10px] border transition-colors ${dependsOn.has(t.id) ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-400 hover:border-indigo-300"}`}>
                    {t.name}
                  </button>
                ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            {converted ? (
              <p className="text-[11px] font-medium text-emerald-600 flex items-center gap-1.5"><DollarSign size={12} /> Budget line created -- linked to this task for Cash Flow timing.</p>
            ) : !showConvert ? (
              <button type="button" onClick={openConvert} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:underline">
                <DollarSign size={12} /> Convert to budget line
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Convert to budget line</p>
                <div className="flex items-center gap-2">
                  <select value={convertCategory} onChange={e => setConvertCategory(e.target.value)} className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white">
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <input type="number" value={convertAmount} onChange={e => setConvertAmount(e.target.value)} placeholder="Amount" className="w-28 px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none" />
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={convertToBudgetLine} disabled={converting || !convertAmount} className="px-4 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                    {converting ? "Adding..." : "Add"}
                  </button>
                  <button type="button" onClick={() => setShowConvert(false)} className="text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="px-8 py-5 border-t border-slate-100 shrink-0">
          <button onClick={save} disabled={saving} className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Bulk edit: the same deadline-driven tooling the Apply Template flow
// gives a fresh template (shift the whole schedule, scale it to a new
// deadline, or hand-pick which tasks to shrink/extend) but applied to this
// project's REAL, already-created tasks. Unlike template items (whose dates
// are derived live from an anchor chain), real tasks just store flat
// start_date/due_date -- so every operation here computes a full set of new
// dates up front and stages them locally (in `edits`), and nothing is
// written to the tasks table until "Save changes". "Scale to fit" rescales
// every dated task's offset-from-project-start AND its own duration by the
// same ratio, anchored at the project's earliest date -- simple, predictable,
// and handles both shrinking AND extending the deadline with one operation
// (ratio < 1 or > 1), unlike trying to trace a single "critical chain" through
// task_dependencies' general many-to-many graph.
function BulkEditModal({
  tasks, onClose, onSaved,
}: {
  tasks: TaskRow[]; onClose: () => void; onSaved: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, { start_date: string | null; due_date: string | null }>>({});
  const [shiftTo, setShiftTo] = useState("");
  const [deadline, setDeadline] = useState("");
  const [chooseMode, setChooseMode] = useState(false);
  const [chooseSearch, setChooseSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const datedTasks = useMemo(() => tasks.filter(t => t.start_date || t.due_date), [tasks]);

  const effectiveDate = (task: TaskRow, field: "start_date" | "due_date"): string | null => {
    const e = edits[task.id];
    if (e) return e[field];
    return task[field] ? task[field]!.slice(0, 10) : null;
  };

  const projectStart = useMemo(() => {
    const dates = datedTasks.flatMap(t => [effectiveDate(t, "start_date"), effectiveDate(t, "due_date")]).filter((d): d is string => !!d);
    return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datedTasks, edits]);

  const computedEnd = useMemo(() => {
    const dates = datedTasks.map(t => effectiveDate(t, "due_date") ?? effectiveDate(t, "start_date")).filter((d): d is string => !!d);
    return dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datedTasks, edits]);

  const deadlineGapDays = useMemo(() => {
    if (!deadline || !computedEnd) return null;
    return Math.round(daysBetween(new Date(deadline), new Date(computedEnd)));
  }, [deadline, computedEnd]);

  const applyShift = () => {
    if (!shiftTo || !projectStart) return;
    const deltaDays = Math.round(daysBetween(new Date(projectStart), new Date(shiftTo)));
    if (!deltaDays) return;
    setEdits(prev => {
      const next = { ...prev };
      for (const t of datedTasks) {
        const s = effectiveDate(t, "start_date");
        const d = effectiveDate(t, "due_date");
        next[t.id] = { start_date: s ? shiftDate(s, deltaDays) : null, due_date: d ? shiftDate(d, deltaDays) : null };
      }
      return next;
    });
    setShiftTo("");
  };

  const scaleToFit = () => {
    if (!deadline || !projectStart || !computedEnd) return;
    const currentSpan = Math.round(daysBetween(new Date(projectStart), new Date(computedEnd)));
    const targetSpan = Math.round(daysBetween(new Date(projectStart), new Date(deadline)));
    if (currentSpan <= 0 || targetSpan <= 0) return;
    const ratio = targetSpan / currentSpan;
    setEdits(prev => {
      const next = { ...prev };
      for (const t of datedTasks) {
        const s = effectiveDate(t, "start_date");
        const d = effectiveDate(t, "due_date");
        const newS = s ? shiftDate(projectStart, Math.round(daysBetween(new Date(projectStart), new Date(s)) * ratio)) : null;
        const newD = d ? shiftDate(projectStart, Math.round(daysBetween(new Date(projectStart), new Date(d)) * ratio)) : null;
        next[t.id] = { start_date: newS, due_date: newD };
      }
      return next;
    });
  };

  const bumpDuration = (task: TaskRow, delta: number) => {
    const s = effectiveDate(task, "start_date");
    const d = effectiveDate(task, "due_date");
    if (!s || !d) return;
    const newD = shiftDate(d, delta);
    if (newD < s) return;
    setEdits(prev => ({ ...prev, [task.id]: { start_date: s, due_date: newD } }));
  };

  // Shrinkable/adjustable = a real span task (both dates set) -- sorted
  // longest-first so "Choose tasks to adjust" surfaces the biggest lever
  // first, same convention as the template Apply view.
  const spanTasks = useMemo(() => {
    return datedTasks
      .filter(t => effectiveDate(t, "start_date") && effectiveDate(t, "due_date"))
      .map(t => {
        const s = effectiveDate(t, "start_date")!, d = effectiveDate(t, "due_date")!;
        return { task: t, duration: Math.max(1, Math.round(daysBetween(new Date(s), new Date(d)))) };
      })
      .sort((a, b) => b.duration - a.duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datedTasks, edits]);

  const filteredSpanTasks = spanTasks.filter(({ task }) => task.name.toLowerCase().includes(chooseSearch.trim().toLowerCase()));

  const changedIds = Object.keys(edits);

  const save = async () => {
    setSaving(true);
    await Promise.all(changedIds.map(taskId => supabase.from("tasks").update(edits[taskId]).eq("id", taskId)));
    setSaving(false);
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-2xl mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide flex-1">Bulk edit schedule</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
          {datedTasks.length === 0 ? (
            <p className="text-center text-[12px] text-slate-300 italic py-8">No tasks with dates to edit yet.</p>
          ) : (
            <>
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Move the whole schedule</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <p className="text-[9px] text-slate-400 mb-1">New project start (currently {projectStart ?? "—"})</p>
                    <input type="date" value={shiftTo} onChange={e => setShiftTo(e.target.value)}
                      className="px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white" />
                  </div>
                  <button type="button" onClick={applyShift} disabled={!shiftTo}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                    Shift schedule
                  </button>
                </div>
              </div>

              <div className="bg-indigo-50/50 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="min-w-[160px]">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Project deadline</p>
                    <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                      className="px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white" />
                  </div>
                  {computedEnd && <p className="text-[11px] text-slate-500">Computed finish: <span className="font-bold text-slate-700">{computedEnd}</span></p>}
                  {deadlineGapDays !== null && (
                    <p className={`text-[11px] font-bold ${deadlineGapDays > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {deadlineGapDays > 0
                        ? `${deadlineGapDays} day${deadlineGapDays === 1 ? "" : "s"} over deadline`
                        : `${-deadlineGapDays} day${deadlineGapDays === -1 ? "" : "s"} to spare`}
                    </p>
                  )}
                </div>
                {deadline && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button type="button" onClick={scaleToFit} disabled={!deadlineGapDays}
                      className="px-4 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                      Scale to fit
                    </button>
                    <button type="button" onClick={() => setChooseMode(m => !m)}
                      className="px-4 py-1.5 border border-indigo-300 text-indigo-600 text-[11px] font-bold rounded-full hover:bg-indigo-100 transition-colors">
                      {chooseMode ? "Hide task picker" : "Choose tasks to adjust"}
                    </button>
                  </div>
                )}
                {chooseMode && (
                  <div className="space-y-2 pt-2 border-t border-indigo-100">
                    <div className="relative">
                      <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                      <input value={chooseSearch} onChange={e => setChooseSearch(e.target.value)} placeholder="Search tasks..."
                        className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400 bg-white" />
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {filteredSpanTasks.length === 0 && <p className="text-[10px] text-slate-300 py-2">No adjustable (span) tasks match.</p>}
                      {filteredSpanTasks.map(({ task, duration }) => (
                        <div key={task.id} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white rounded-full border border-slate-100">
                          <p className="text-[11px] text-slate-600 truncate flex-1">{task.name}</p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button type="button" onClick={() => bumpDuration(task, -1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-[11px] font-bold leading-none">−</button>
                            <span className="text-[11px] font-bold text-slate-700 w-10 text-center">{duration}d</span>
                            <button type="button" onClick={() => bumpDuration(task, 1)} className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 text-[11px] font-bold leading-none">+</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                {changedIds.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] text-slate-400">{changedIds.length} task{changedIds.length === 1 ? "" : "s"} changed</p>
                    <button type="button" onClick={() => setEdits({})} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Reset all</button>
                  </div>
                )}
                {datedTasks
                  .slice()
                  .sort((a, b) => (effectiveDate(a, "due_date") || "").localeCompare(effectiveDate(b, "due_date") || ""))
                  .map(t => {
                    const changed = !!edits[t.id];
                    return (
                      <div key={t.id} className={`flex items-center gap-3 px-4 py-2 rounded-2xl ${changed ? "bg-indigo-50" : "bg-slate-50"}`}>
                        <p className="flex-1 text-[11px] text-slate-700 truncate">{t.name}</p>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{effectiveDate(t, "start_date") ?? "—"} → <span className={changed ? "font-bold text-indigo-600" : "font-medium"}>{effectiveDate(t, "due_date") ?? "—"}</span></span>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </div>

        <div className="px-8 py-5 border-t border-slate-100 shrink-0">
          <button onClick={save} disabled={saving || changedIds.length === 0}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? "Saving..." : changedIds.length ? `Save changes (${changedIds.length} task${changedIds.length === 1 ? "" : "s"})` : "No changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TimelineSubtab({ projectId }: { projectId: string }) {
  const { companyId, userId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [dependenciesByTask, setDependenciesByTask] = useState<Record<string, string[]>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"card" | "diagram" | "list">("diagram");
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<"none" | "team" | "category">("none");
  const [zoom, setZoom] = useState<Zoom>("all");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  // "Apply template" -- reuses the same checklist_templates/TemplateManager
  // machinery as the Checklist tab, company-wide templates seeded with a
  // start/due-date schedule and dependencies so applying one produces a
  // real Gantt structure, not just a flat task list. Loaded lazily on
  // first open rather than alongside the task list -- most visits to this
  // subtab never open it.
  const [showTemplates, setShowTemplates] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [project, setProject] = useState<{ created_at: string; estimated_completion_date: string | null } | null>(null);

  const openTemplates = async () => {
    setShowTemplates(true);
    if (templates.length || templatesLoading) return;
    setTemplatesLoading(true);
    const [{ data: templateData }, { data: projectData }] = await Promise.all([
      supabase.from('checklist_templates').select('*, items:checklist_template_items(*)').eq('company_id', companyId).order('created_at'),
      supabase.from('projects').select('created_at, estimated_completion_date').eq('id', projectId).single(),
    ]);
    setTemplates((templateData || []).map((t: any) => ({
      ...t, items: (t.items || []).sort((a: any, b: any) => a.display_order - b.display_order),
    })));
    setProject(projectData || null);
    setTemplatesLoading(false);
  };

  const handleCreateTemplate = async (name: string): Promise<Template | null> => {
    const { data: tpl } = await supabase.from('checklist_templates').insert({ company_id: companyId, name, record_table: 'projects' }).select().single();
    if (!tpl) return null;
    const newTemplate: Template = { id: tpl.id, name: tpl.name, items: [] };
    setTemplates(prev => [...prev, newTemplate]);
    return newTemplate;
  };

  const handleApplyTemplate = async (tasksToCreate: any[]): Promise<{ id: string }[]> => {
    if (!tasksToCreate.length) return [];
    const { data: { user } } = await supabase.auth.getUser();
    let created: { id: string }[];
    try {
      created = await applyChecklistTemplate(supabase, tasksToCreate.map(t => ({ ...t, company_id: companyId })), user?.id || null);
    } catch (err) {
      alert(`Failed to apply template: ${err instanceof Error ? err.message : 'unknown error'}`);
      return [];
    }
    await load();
    return created;
  };

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const [taskRes, teamsRes, profilesRes, projectRes] = await Promise.all([
        fetch(`/api/finance-model/tasks?projectId=${projectId}`),
        // teams_select RLS scopes to "any company this user is a member of,"
        // not "their currently active one" -- a user who belongs to more
        // than one company would otherwise see every company's team names
        // mixed together here (confirmed live during this session's own
        // testing). Same pre-existing gap in ChecklistTab.tsx's own teams
        // query, not introduced here, but worth not repeating.
        supabase.from('teams').select('id, team_name').eq('company_id', companyId).eq('is_active', true).order('team_name'),
        supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
        supabase.from('projects').select('created_at').eq('id', projectId).single(),
      ]);
      const json = await taskRes.json();
      if (!taskRes.ok) { setError(json.error || "Failed to load"); return; }
      setTasks(json.tasks || []);
      const depMap: Record<string, string[]> = {};
      for (const d of json.dependencies || []) (depMap[d.task_id] ||= []).push(d.depends_on_task_id);
      setDependenciesByTask(depMap);
      setTeams(teamsRes.data || []);
      setProfiles(profilesRes.data || []);
      setProjectCreatedAt(projectRes.data?.created_at || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId, companyId]);

  const toggleTeamFilter = (id: string) => {
    setTeamFilter(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleCompletion = async (task: TaskRow) => {
    const blocked = blockedBy(task.id, dependenciesByTask, tasks);
    if (!task.is_completed && blocked.length > 0) return;
    await supabase.from("tasks").update({ is_completed: !task.is_completed }).eq("id", task.id);
    await load();
  };

  const filteredTasks = useMemo(() => {
    if (teamFilter.size === 0) return tasks;
    return tasks.filter(t => {
      if (!t.teams.length) return teamFilter.has(UNASSIGNED);
      return t.teams.some(tm => teamFilter.has(tm.id));
    });
  }, [tasks, teamFilter]);

  const visibleColumns = useMemo(() => {
    const cols = teamFilter.size === 0 ? teams : teams.filter(t => teamFilter.has(t.id));
    const showUnassigned = teamFilter.size === 0 || teamFilter.has(UNASSIGNED);
    return showUnassigned ? [...cols, { id: UNASSIGNED, team_name: "Unassigned" }] : cols;
  }, [teams, teamFilter]);

  // Distinct category values actually in use, for the Diagram view's
  // "Group by: Category" swimlanes -- free-typed labels, not a managed
  // list, so this is derived from the tasks themselves rather than a
  // lookup table.
  const visibleCategories = useMemo(
    () => [...new Set(tasks.map(t => t.category).filter((c): c is string => !!c))].sort(),
    [tasks]
  );

  // Pushes the current (possibly hand-edited-in-the-Diagram-view) dates of
  // every task that traces back to a template item onto that item's
  // stored offsets -- the project-level counterpart to TaskEditModal's
  // per-task "Update template" action. Asks once whether to update the
  // source template(s) directly or fork new ones, since this can touch
  // more than one template if more than one was ever applied to this
  // project.
  const syncScheduleToTemplate = async () => {
    const withSource = tasks.filter(t => t.source_template_item_id);
    if (!withSource.length) return;
    setSyncing(true);
    try {
      const ids = withSource.map(t => t.source_template_item_id as string);
      const { data: items } = await supabase.from('checklist_template_items').select('id, template_id').in('id', ids);
      const templateIdByItemId = new Map((items || []).map((i: any) => [i.id, i.template_id]));
      const templateIds = [...new Set((items || []).map((i: any) => i.template_id))];
      const { data: templatesData } = await supabase.from('checklist_templates').select('id, name').in('id', templateIds);
      const templateNameById = new Map((templatesData || []).map((t: any) => [t.id, t.name]));

      const groups = new Map<string, TaskRow[]>();
      for (const t of withSource) {
        const templateId = templateIdByItemId.get(t.source_template_item_id as string);
        if (!templateId) continue;
        if (!groups.has(templateId)) groups.set(templateId, []);
        groups.get(templateId)!.push(t);
      }
      if (!groups.size) { alert('Could not find the source template(s) for these tasks.'); return; }

      const computeOffsets = (t: TaskRow) => {
        const createdAt = new Date(projectCreatedAt || new Date().toISOString());
        return {
          due_offset_days: t.due_date ? Math.round(daysBetween(createdAt, new Date(t.due_date))) : null,
          due_anchor: 'record_created', due_offset_mode: 'calendar',
          start_offset_days: t.start_date ? Math.round(daysBetween(createdAt, new Date(t.start_date))) : null,
          start_anchor: t.start_date ? 'record_created' : null,
        };
      };

      const groupNames = [...groups.keys()].map(id => templateNameById.get(id) || 'Untitled').join(', ');
      const asNew = !window.confirm(
        `Update ${groupNames} directly with these tasks' current dates?\n\nOK = update the existing template(s)\nCancel = save as new template(s) instead`
      );

      for (const [templateId, groupTasks] of groups) {
        const templateName = templateNameById.get(templateId) || 'Untitled';
        if (!asNew) {
          await Promise.all(groupTasks.map(t =>
            supabase.from('checklist_template_items').update(computeOffsets(t)).eq('id', t.source_template_item_id as string)
          ));
          continue;
        }
        const newName = window.prompt(`New template name for "${templateName}":`, `${templateName} (adjusted)`);
        if (!newName) continue;
        const { data: newTemplateRow } = await supabase.from('checklist_templates')
          .insert({ company_id: companyId, name: newName, record_table: 'projects' }).select().single();
        if (!newTemplateRow) continue;
        const { data: allItems } = await supabase.from('checklist_template_items').select('*').eq('template_id', templateId).order('display_order');
        const editByItemId = new Map(groupTasks.map(t => [t.source_template_item_id, computeOffsets(t)]));
        const inserted: any[] = [];
        for (const item of allItems || []) {
          const { id, template_id, depends_on_item_ids, ...rest } = item;
          const edit = editByItemId.get(id) || {};
          const { data } = await supabase.from('checklist_template_items').insert({ ...rest, ...edit, template_id: newTemplateRow.id }).select().single();
          if (data) inserted.push(data);
        }
        const oldToNew = new Map((allItems || []).map((item: any, i: number) => [item.id, inserted[i]?.id]));
        await Promise.all((allItems || []).map((item: any, i: number) => {
          if (!item.depends_on_item_ids?.length || !inserted[i]) return null;
          const newDeps = item.depends_on_item_ids.map((oid: string) => oldToNew.get(oid)).filter(Boolean);
          if (!newDeps.length) return null;
          return supabase.from('checklist_template_items').update({ depends_on_item_ids: newDeps }).eq('id', inserted[i].id);
        }));
      }
      alert('Sync complete.');
    } finally {
      setSyncing(false);
    }
  };

  // Today is always folded into the date range (not just the tasks' own
  // start/due spread) so the today-marker below always has somewhere valid
  // to land, even for an all-future or all-past task set.
  const { axisStart, axisEnd, span } = useMemo(() => {
    const dates: Date[] = [new Date()];
    for (const t of filteredTasks) {
      if (t.start_date) dates.push(new Date(t.start_date));
      if (t.due_date) dates.push(new Date(t.due_date));
    }
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    return { axisStart: min, axisEnd: max, span: Math.max(1, daysBetween(min, max)) };
  }, [filteredTasks]);

  const pxPerDay = zoom === "all" ? null : PX_PER_DAY[zoom];

  // periodOffset counts whole weeks/months away from "now" -- 0 is the
  // week/month containing today, -1 is the previous one, etc. Reset
  // whenever zoom changes so switching from week to month (or back)
  // never carries over an offset in the wrong unit.
  useEffect(() => { setPeriodOffset(0); }, [zoom]);

  const { periodStart, periodEnd, periodSpanDays } = useMemo(() => {
    if (zoom === "all") return { periodStart: null, periodEnd: null, periodSpanDays: null };
    const now = new Date();
    if (zoom === "week") {
      const start = startOfWeek(now);
      start.setDate(start.getDate() + periodOffset * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { periodStart: start, periodEnd: end, periodSpanDays: 7 };
    }
    const start = new Date(now.getFullYear(), now.getMonth() + periodOffset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return { periodStart: start, periodEnd: end, periodSpanDays: daysBetween(start, end) + 1 };
  }, [zoom, periodOffset]);

  // effectiveStart/effectiveSpan unify "all" zoom (the full, data-driven
  // axisStart/span, unchanged) with week/month zoom (the current paged
  // period) into the single pair GanttBar positions every bar against.
  const effectiveStart = periodStart ?? axisStart;
  const effectiveSpan = periodSpanDays ?? span;
  const today = new Date();
  const todayOffsetDays = daysBetween(effectiveStart, today);
  const showTodayLine = todayOffsetDays >= 0 && todayOffsetDays <= effectiveSpan;
  const ticks = useMemo(
    () => (zoom === "all" || !periodStart || !periodEnd ? [] : getTicks(zoom, periodStart, periodEnd)),
    [zoom, periodStart, periodEnd],
  );

  // Row filtering -- only tasks that actually overlap the visible period
  // in week/month zoom (a task with no date at all never appears once
  // zoomed, same as it never appeared as a dated bar before). "All" zoom
  // is unfiltered, same as before -- it's meant to show the whole picture.
  const periodTasks = useMemo(() => {
    if (zoom === "all" || !periodStart || !periodEnd) return filteredTasks;
    return filteredTasks.filter(t => {
      const due = t.due_date ? new Date(t.due_date) : null;
      const start = t.start_date ? new Date(t.start_date) : due;
      if (!due && !start) return false;
      const s = start || due!;
      const e = due || start!;
      return s <= periodEnd && e >= periodStart;
    });
  }, [filteredTasks, zoom, periodStart, periodEnd]);

  // Prev/next paging -- a full week or calendar month at a time.
  const pageTime = (direction: 1 | -1) => setPeriodOffset(o => o + direction);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading timeline...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[13px] font-medium text-rose-600 mb-1">Couldn't load</p>
        <p className="text-[12px] text-slate-400 mb-4">{error}</p>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline">
          <RefreshCw size={11} /> Try again
        </button>
      </div>
    );
  }

  const GanttBar = ({ t }: { t: TaskRow }) => {
    const due = t.due_date ? new Date(t.due_date) : null;
    const start = t.start_date ? new Date(t.start_date) : due;
    if (!start && !due) return null;
    const barStart = start || due!;
    const barEnd = due || start!;
    const offsetDays = daysBetween(effectiveStart, barStart);
    const durationDays = Math.max(daysBetween(barStart, barEnd), 0);
    const barLeft = pxPerDay ? `${offsetDays * pxPerDay}px` : `${(offsetDays / effectiveSpan) * 100}%`;
    const barWidth = pxPerDay ? `${Math.max(durationDays * pxPerDay, 10)}px` : `${Math.max((durationDays / effectiveSpan) * 100, 0.8)}%`;
    const todayLeft = pxPerDay ? `${todayOffsetDays * pxPerDay}px` : `${(todayOffsetDays / effectiveSpan) * 100}%`;
    const color = t.task_statuses?.color_hex || (t.is_completed ? "#10b981" : "#6366f1");
    const blocked = blockedBy(t.id, dependenciesByTask, tasks);
    return (
      <div key={t.id} className="flex items-center gap-3 cursor-pointer group" onClick={() => setEditingTask(t)}>
        <p
          className={`w-40 shrink-0 text-[11px] text-slate-600 truncate group-hover:text-indigo-600 flex items-center gap-1 ${pxPerDay ? "sticky left-0 z-10 bg-white" : ""}`}
          title={t.name}
        >
          {blocked.length > 0 && !t.is_completed && <Lock size={9} className="text-slate-300 shrink-0" />}
          {t.name}
        </p>
        <div
          className={`relative bg-slate-50 rounded-full overflow-hidden ${pxPerDay ? "h-7" : "h-5"}`}
          style={pxPerDay ? { width: `${effectiveSpan * pxPerDay}px`, flex: "0 0 auto" } : { flex: "1 1 0%" }}
        >
          <div
            className={`absolute rounded-full ${pxPerDay ? "top-1 h-5" : "top-0.5 h-4"}`}
            style={{ left: barLeft, width: barWidth, backgroundColor: color, opacity: t.is_completed ? 0.5 : 1 }}
            title={`${formatDate(t.start_date)} → ${formatDate(t.due_date)}`}
          />
          {showTodayLine && <div className="absolute top-0 bottom-0 w-px bg-rose-400" style={{ left: todayLeft }} title="Today" />}
        </div>
      </div>
    );
  };

  const Card = ({ t }: { t: TaskRow }) => {
    const blocked = blockedBy(t.id, dependenciesByTask, tasks);
    return (
      <div onClick={() => setEditingTask(t)} className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1.5 cursor-pointer hover:border-indigo-300 transition-colors">
        <div className="flex items-start gap-2">
          <button onClick={e => { e.stopPropagation(); toggleCompletion(t); }} disabled={!t.is_completed && blocked.length > 0}
            className="mt-0.5 shrink-0">
            {t.is_completed ? <CheckCircle2 size={14} className="text-emerald-500" /> : blocked.length > 0 ? <Lock size={11} className="text-slate-300" /> : <Circle size={14} className="text-slate-300" />}
          </button>
          <p className={`text-[11px] font-medium text-slate-700 flex-1 ${t.is_completed ? "line-through opacity-50" : ""}`}>{t.name}</p>
        </div>
        <div className="flex items-center justify-between pl-5">
          <span className="text-[9px] text-slate-400">{formatDate(t.due_date)}</span>
          {t.assignee?.full_name && (
            <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 text-[8px] font-bold flex items-center justify-center" title={t.assignee.full_name}>
              {t.assignee.full_name.slice(0, 1)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <p className="text-[11px] text-slate-400">{filteredTasks.length} of {tasks.length} task{tasks.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          <button onClick={openTemplates} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors">
            <ClipboardList size={12} /> Apply template
          </button>
          <button onClick={() => setShowBulkEdit(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors">
            <SlidersHorizontal size={12} /> Bulk edit
          </button>
          {tasks.some(t => t.source_template_item_id) && (
            <button onClick={syncScheduleToTemplate} disabled={syncing} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40">
              <RefreshCw size={12} /> {syncing ? "Syncing..." : "Sync schedule to template"}
            </button>
          )}
          {view !== "card" && (
            <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
              {(["none", "team", "category"] as const).map(g => (
                <button key={g} onClick={() => setGroupBy(g)} className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${groupBy === g ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                  {g === "none" ? "No grouping" : g === "team" ? "By team" : "By category"}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
            <button onClick={() => setView("card")} className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold ${view === "card" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
              <LayoutGrid size={12} /> Card
            </button>
            <button onClick={() => setView("diagram")} className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold ${view === "diagram" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
              <GanttChartSquare size={12} /> Diagram
            </button>
            <button onClick={() => setView("list")} className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold ${view === "list" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
              <List size={12} /> List
            </button>
          </div>
        </div>
      </div>

      {/* Team filter -- each chip carries the same colour dot as its bar in
          the List view's Teams column (teamColor()), so the two are
          identifiable at a glance instead of needing to remember an
          arbitrary colour-to-team mapping. */}
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {teams.map(t => (
          <button key={t.id} onClick={() => toggleTeamFilter(t.id)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${teamFilter.has(t.id) ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamColor(t.id, teams) }} />
            {t.team_name}
          </button>
        ))}
        <button onClick={() => toggleTeamFilter(UNASSIGNED)}
          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${teamFilter.has(UNASSIGNED) ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
          Unassigned
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
          <p className="text-[12px] text-slate-400">No tasks linked to this project yet.</p>
        </div>
      ) : view === "card" ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {visibleColumns.map(col => {
            const colTasks = filteredTasks.filter(t => col.id === UNASSIGNED ? !t.teams.length : t.teams.some(tm => tm.id === col.id));
            return (
              <div key={col.id} className="w-64 shrink-0 bg-slate-50 rounded-2xl p-3 space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">{col.team_name} <span className="text-slate-300">({colTasks.length})</span></p>
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {colTasks.map(t => <Card key={t.id} t={t} />)}
                  {colTasks.length === 0 && <p className="text-[10px] text-slate-300 px-1 py-2">No tasks</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "list" ? (
        <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                <th className="px-6 py-2 font-bold"></th>
                <th className="px-2 py-2 font-bold">Task</th>
                <th className="px-2 py-2 font-bold">Teams</th>
                <th className="px-2 py-2 font-bold">Assignee</th>
                <th className="px-2 py-2 font-bold">Start</th>
                <th className="px-6 py-2 font-bold">Due</th>
              </tr>
            </thead>
            <tbody>
              {filteredTasks.map(t => {
                const blocked = blockedBy(t.id, dependenciesByTask, tasks);
                return (
                  <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-6 py-2">
                      <button onClick={() => toggleCompletion(t)} disabled={!t.is_completed && blocked.length > 0}
                        title={blocked.length > 0 && !t.is_completed ? `Blocked by: ${blocked.map(b => b.name).join(", ")}` : undefined}>
                        {t.is_completed ? <CheckCircle2 size={14} className="text-emerald-500" /> : blocked.length > 0 ? <Lock size={12} className="text-slate-300" /> : <Circle size={14} className="text-slate-300" />}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-slate-700 font-medium cursor-pointer hover:text-indigo-600" onClick={() => setEditingTask(t)}>{t.name}</td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1 cursor-pointer" onClick={() => setEditingTask(t)}>
                        {t.teams.map(tm => <span key={tm.id} title={tm.team_name} className="w-4 h-1.5 rounded-full" style={{ backgroundColor: teamColor(tm.id, teams) }} />)}
                        {!t.teams.length && <span className="text-slate-300 text-[10px]">—</span>}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-slate-500">{t.assignee?.full_name || "—"}</td>
                    <td className="px-2 py-2 text-slate-500 whitespace-nowrap cursor-pointer hover:text-indigo-600" onClick={() => setEditingTask(t)}>{formatDate(t.start_date)}</td>
                    <td className="px-6 py-2 text-slate-500 whitespace-nowrap cursor-pointer hover:text-indigo-600" onClick={() => setEditingTask(t)}>{formatDate(t.due_date)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
                {(["week", "month", "all"] as const).map(z => (
                  <button key={z} onClick={() => setZoom(z)} className={`px-3 py-1 rounded-full text-[10px] font-bold capitalize ${zoom === z ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
                    {z}
                  </button>
                ))}
              </div>
              {pxPerDay && (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => pageTime(-1)} title={`Previous ${zoom}`} className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => pageTime(1)} title={`Next ${zoom}`} className="p-1.5 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
            {zoom === "all" ? (
              <div className="flex items-center gap-4 text-[10px] text-slate-400">
                <span>{formatDate(axisStart.toISOString())}</span>
                <span>{formatDate(axisEnd.toISOString())}</span>
              </div>
            ) : (
              periodStart && periodEnd && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600">{formatPeriodLabel(zoom, periodStart, periodEnd)}</span>
                  {periodOffset !== 0 && (
                    <button onClick={() => setPeriodOffset(0)} className="text-[10px] font-bold text-indigo-600 hover:underline">
                      Today
                    </button>
                  )}
                </div>
              )
            )}
          </div>

          <div className="overflow-x-auto">
            <div style={pxPerDay ? { width: `${160 + 12 + effectiveSpan * pxPerDay}px` } : undefined} className="space-y-2">
              {pxPerDay && (
                <div className="flex items-center gap-3">
                  <div className="w-40 shrink-0 sticky left-0 z-10 bg-white" />
                  <div className="relative h-5" style={{ width: `${effectiveSpan * pxPerDay}px` }}>
                    {ticks.map(tick => {
                      // Skip a tick label that would collide with the
                      // "Today" label below (~46px of clearance either side).
                      if (showTodayLine && Math.abs(tick.offsetDays - todayOffsetDays) * pxPerDay < 46) return null;
                      return (
                        <span key={tick.offsetDays} className="absolute text-[10px] text-slate-500 whitespace-nowrap" style={{ left: `${tick.offsetDays * pxPerDay}px` }}>
                          {tick.label}
                        </span>
                      );
                    })}
                    {showTodayLine && (
                      <span className="absolute text-[10px] font-bold text-rose-500 whitespace-nowrap" style={{ left: `${todayOffsetDays * pxPerDay}px`, transform: "translateX(-50%)" }}>
                        Today
                      </span>
                    )}
                  </div>
                </div>
              )}
              {periodTasks.length === 0 ? (
                <p className="text-[11px] text-slate-300 py-6 text-center">No tasks due this {zoom === "month" ? "month" : "week"}.</p>
              ) : groupBy === "team" ? (
                <div className="space-y-4">
                  {visibleColumns.map(col => {
                    const colTasks = periodTasks.filter(t => col.id === UNASSIGNED ? !t.teams.length : t.teams.some(tm => tm.id === col.id));
                    if (!colTasks.length) return null;
                    return (
                      <div key={col.id} className="space-y-2">
                        <p className={`text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 ${pxPerDay ? "sticky left-0 z-10 bg-white w-fit" : ""}`}>{col.team_name}</p>
                        {colTasks.map(t => <GanttBar key={t.id} t={t} />)}
                      </div>
                    );
                  })}
                </div>
              ) : groupBy === "category" ? (
                <div className="space-y-4">
                  {[...visibleCategories, null].map(cat => {
                    const colTasks = periodTasks.filter(t => cat === null ? !t.category : t.category === cat);
                    if (!colTasks.length) return null;
                    return (
                      <div key={cat ?? UNCATEGORIZED} className="space-y-2">
                        <p className={`text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1 ${pxPerDay ? "sticky left-0 z-10 bg-white w-fit" : ""}`}>{cat ?? "Uncategorized"}</p>
                        {colTasks.map(t => <GanttBar key={t.id} t={t} />)}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  {periodTasks.map(t => <GanttBar key={t.id} t={t} />)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask} allTasks={tasks} teams={teams} profiles={profiles}
          dependenciesByTask={dependenciesByTask} companyId={companyId || ""} userId={userId} projectId={projectId}
          projectCreatedAt={projectCreatedAt}
          onClose={() => setEditingTask(null)} onSaved={load}
        />
      )}

      {showBulkEdit && (
        <BulkEditModal tasks={tasks} onClose={() => setShowBulkEdit(false)} onSaved={load} />
      )}

      {showTemplates && companyId && (
        templatesLoading ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
            <Loader2 size={20} className="animate-spin text-white" />
          </div>
        ) : (
          <TemplateManager
            templates={templates}
            setTemplates={setTemplates}
            profiles={profiles} teams={teams} companyId={companyId} projectId={projectId}
            projectCreatedAt={project?.created_at || new Date().toISOString()}
            projectDueDate={project?.estimated_completion_date || null}
            onApply={handleApplyTemplate} onCreateTemplate={handleCreateTemplate}
            onClose={() => setShowTemplates(false)}
          />
        )
      )}
    </div>
  );
}
