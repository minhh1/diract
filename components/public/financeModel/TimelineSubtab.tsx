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
import { Loader2, RefreshCw, List, GanttChartSquare, LayoutGrid, CheckCircle2, Circle, ClipboardList, Lock, X } from "lucide-react";
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
}

const UNASSIGNED = "unassigned";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86400000;
}

// ── Shared "blocked by an incomplete prerequisite" check -- same AND-
// semantics task_dependencies.sql and ChecklistTab.tsx already use.
function blockedBy(taskId: string, dependenciesByTask: Record<string, string[]>, allTasks: TaskRow[]): TaskRow[] {
  return (dependenciesByTask[taskId] || [])
    .map(id => allTasks.find(t => t.id === id))
    .filter((t): t is TaskRow => !!t && !t.is_completed);
}

// ── Edit modal: assignee, teams (multi-select), start/due dates, and
// blocked-by (multi-select over the project's other tasks) -- opened from
// a List row, a Card, or a Diagram bar, all three views share this one.
function TaskEditModal({
  task, allTasks, teams, profiles, dependenciesByTask, companyId, userId, onClose, onSaved,
}: {
  task: TaskRow; allTasks: TaskRow[]; teams: Team[]; profiles: Profile[];
  dependenciesByTask: Record<string, string[]>; companyId: string; userId: string | null;
  onClose: () => void; onSaved: () => void;
}) {
  const [assigneeId, setAssigneeId] = useState(task.assignee_id || "");
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set(task.teams.map(t => t.id)));
  const [startDate, setStartDate] = useState(task.start_date || "");
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.slice(0, 10) : "");
  const [dependsOn, setDependsOn] = useState<Set<string>>(new Set(dependenciesByTask[task.id] || []));
  const [saving, setSaving] = useState(false);

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
            <div />
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Start date</p>
              <input type="date" value={startDate ? startDate.slice(0, 10) : ""} onChange={e => setStartDate(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white" />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Due date</p>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded-full text-[12px] outline-none bg-white" />
            </div>
          </div>

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
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {allTasks.filter(t => t.id !== task.id).map(t => (
                <button key={t.id} type="button" onClick={() => toggleSet(dependsOn, t.id, setDependsOn)}
                  className={`px-2.5 py-1 rounded-full text-[10px] border transition-colors ${dependsOn.has(t.id) ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-400 hover:border-indigo-300"}`}>
                  {t.name}
                </button>
              ))}
            </div>
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

export default function TimelineSubtab({ projectId }: { projectId: string }) {
  const { companyId, userId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [dependenciesByTask, setDependenciesByTask] = useState<Record<string, string[]>>({});
  const [teams, setTeams] = useState<Team[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"card" | "diagram" | "list">("card");
  const [teamFilter, setTeamFilter] = useState<Set<string>>(new Set());
  const [groupByTeam, setGroupByTeam] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRow | null>(null);

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
      const [taskRes, teamsRes, profilesRes] = await Promise.all([
        fetch(`/api/finance-model/tasks?projectId=${projectId}`),
        // teams_select RLS scopes to "any company this user is a member of,"
        // not "their currently active one" -- a user who belongs to more
        // than one company would otherwise see every company's team names
        // mixed together here (confirmed live during this session's own
        // testing). Same pre-existing gap in ChecklistTab.tsx's own teams
        // query, not introduced here, but worth not repeating.
        supabase.from('teams').select('id, team_name').eq('company_id', companyId).eq('is_active', true).order('team_name'),
        supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      ]);
      const json = await taskRes.json();
      if (!taskRes.ok) { setError(json.error || "Failed to load"); return; }
      setTasks(json.tasks || []);
      const depMap: Record<string, string[]> = {};
      for (const d of json.dependencies || []) (depMap[d.task_id] ||= []).push(d.depends_on_task_id);
      setDependenciesByTask(depMap);
      setTeams(teamsRes.data || []);
      setProfiles(profilesRes.data || []);
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

  const { axisStart, axisEnd, span } = useMemo(() => {
    const dates: Date[] = [];
    for (const t of filteredTasks) {
      if (t.start_date) dates.push(new Date(t.start_date));
      if (t.due_date) dates.push(new Date(t.due_date));
    }
    if (!dates.length) {
      const now = new Date();
      return { axisStart: now, axisEnd: new Date(now.getTime() + 30 * 86400000), span: 30 };
    }
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    return { axisStart: min, axisEnd: max, span: Math.max(1, daysBetween(min, max)) };
  }, [filteredTasks]);

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
    const leftPct = (daysBetween(axisStart, barStart) / span) * 100;
    const widthPct = Math.max((daysBetween(barStart, barEnd) / span) * 100, 0.8);
    const color = t.task_statuses?.color_hex || (t.is_completed ? "#10b981" : "#6366f1");
    const blocked = blockedBy(t.id, dependenciesByTask, tasks);
    return (
      <div key={t.id} className="flex items-center gap-3 cursor-pointer group" onClick={() => setEditingTask(t)}>
        <p className="w-40 shrink-0 text-[11px] text-slate-600 truncate group-hover:text-indigo-600 flex items-center gap-1" title={t.name}>
          {blocked.length > 0 && !t.is_completed && <Lock size={9} className="text-slate-300 shrink-0" />}
          {t.name}
        </p>
        <div className="flex-1 relative h-5 bg-slate-50 rounded-full">
          <div
            className="absolute top-0.5 h-4 rounded-full"
            style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: color, opacity: t.is_completed ? 0.5 : 1 }}
            title={`${formatDate(t.start_date)} → ${formatDate(t.due_date)}`}
          />
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
          {view !== "card" && (
            <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
              <input type="checkbox" checked={groupByTeam} onChange={e => setGroupByTeam(e.target.checked)} /> Group by team
            </label>
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

      {/* Team filter */}
      <div className="flex flex-wrap items-center gap-1.5 px-1">
        {teams.map(t => (
          <button key={t.id} onClick={() => toggleTeamFilter(t.id)}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-colors ${teamFilter.has(t.id) ? "bg-indigo-600 border-indigo-600 text-white" : "border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
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
                      <div className="flex flex-wrap gap-1 cursor-pointer" onClick={() => setEditingTask(t)}>
                        {t.teams.map(tm => <span key={tm.id} className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[9px] font-bold">{tm.team_name}</span>)}
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
          <div className="flex justify-between text-[10px] text-slate-400 px-1">
            <span>{formatDate(axisStart.toISOString())}</span>
            <span>{formatDate(axisEnd.toISOString())}</span>
          </div>
          {groupByTeam ? (
            <div className="space-y-4">
              {visibleColumns.map(col => {
                const colTasks = filteredTasks.filter(t => col.id === UNASSIGNED ? !t.teams.length : t.teams.some(tm => tm.id === col.id));
                if (!colTasks.length) return null;
                return (
                  <div key={col.id} className="space-y-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">{col.team_name}</p>
                    {colTasks.map(t => <GanttBar key={t.id} t={t} />)}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTasks.map(t => <GanttBar key={t.id} t={t} />)}
            </div>
          )}
        </div>
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask} allTasks={tasks} teams={teams} profiles={profiles}
          dependenciesByTask={dependenciesByTask} companyId={companyId || ""} userId={userId}
          onClose={() => setEditingTask(null)} onSaved={load}
        />
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
