"use client";

// The Finance Model's Timeline subtab -- the project's real tasks
// (tasks.project_id = this project), in a List view and a Gantt Diagram
// view. Tasks with a start_date (see supabase/migrations/
// 20260731300000_tasks_start_date.sql) render as a full start->due
// duration bar; tasks without one (most existing tasks, until start_date
// gets used going forward) render as a single-day marker at their due
// date instead.
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, List, GanttChartSquare, CheckCircle2, Circle, ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { applyChecklistTemplate } from "@/lib/applyChecklistTemplate";
import TemplateManager, { type Template } from "@/components/dashboard/TemplateManager";

interface TaskRow {
  id: string;
  name: string;
  start_date: string | null;
  due_date: string | null;
  is_completed: boolean;
  assignee: { id: string; full_name: string | null } | null;
  task_statuses: { label: string; color_hex: string | null } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86400000;
}

export default function TimelineSubtab({ projectId }: { projectId: string }) {
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "diagram">("diagram");

  // "Apply template" -- reuses the same checklist_templates/TemplateManager
  // machinery as the Checklist tab (components/dashboard/tabs/
  // ChecklistTab.tsx), company-wide templates seeded with a start/due-date
  // schedule and dependencies so applying one produces a real Gantt
  // structure, not just a flat task list. Loaded lazily on first open
  // rather than alongside the task list -- most visits to this subtab
  // never open it.
  const [showTemplates, setShowTemplates] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; full_name: string | null; email: string | null }[]>([]);
  const [teams, setTeams] = useState<{ id: string; team_name: string }[]>([]);
  const [project, setProject] = useState<{ created_at: string; estimated_completion_date: string | null } | null>(null);

  const openTemplates = async () => {
    setShowTemplates(true);
    if (templates.length || templatesLoading) return;
    setTemplatesLoading(true);
    const [{ data: templateData }, { data: profileData }, { data: teamData }, { data: projectData }] = await Promise.all([
      supabase.from('checklist_templates').select('*, items:checklist_template_items(*)').eq('company_id', companyId).order('created_at'),
      supabase.from('profiles').select('id, full_name, email').eq('is_active', true),
      supabase.from('teams').select('id, team_name').eq('is_active', true),
      supabase.from('projects').select('created_at, estimated_completion_date').eq('id', projectId).single(),
    ]);
    setTemplates((templateData || []).map((t: any) => ({
      ...t, items: (t.items || []).sort((a: any, b: any) => a.display_order - b.display_order),
    })));
    setProfiles(profileData || []);
    setTeams(teamData || []);
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
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance-model/tasks?projectId=${projectId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to load"); return; }
      setTasks(json.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const { axisStart, axisEnd, span } = useMemo(() => {
    const dates: Date[] = [];
    for (const t of tasks) {
      if (t.start_date) dates.push(new Date(t.start_date));
      if (t.due_date) dates.push(new Date(t.due_date));
    }
    if (!dates.length) {
      const now = new Date();
      return { axisStart: now, axisEnd: new Date(now.getTime() + 30 * 86400000), span: 30 };
    }
    const min = new Date(Math.min(...dates.map(d => d.getTime())));
    const max = new Date(Math.max(...dates.map(d => d.getTime())));
    // A little padding either side so bars/markers never sit flush on the axis edge.
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    return { axisStart: min, axisEnd: max, span: Math.max(1, daysBetween(min, max)) };
  }, [tasks]);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-slate-400">{tasks.length} task{tasks.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2">
          <button onClick={openTemplates} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors">
            <ClipboardList size={12} /> Apply template
          </button>
          <div className="flex items-center gap-1 bg-slate-100 rounded-full p-0.5">
            <button onClick={() => setView("diagram")} className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold ${view === "diagram" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
              <GanttChartSquare size={12} /> Diagram
            </button>
            <button onClick={() => setView("list")} className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold ${view === "list" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400"}`}>
              <List size={12} /> List
            </button>
          </div>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
          <p className="text-[12px] text-slate-400">No tasks linked to this project yet.</p>
        </div>
      ) : view === "list" ? (
        <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                <th className="px-6 py-2 font-bold"></th>
                <th className="px-2 py-2 font-bold">Task</th>
                <th className="px-2 py-2 font-bold">Status</th>
                <th className="px-2 py-2 font-bold">Assignee</th>
                <th className="px-2 py-2 font-bold">Start</th>
                <th className="px-6 py-2 font-bold">Due</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => (
                <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-6 py-2">{t.is_completed ? <CheckCircle2 size={14} className="text-emerald-500" /> : <Circle size={14} className="text-slate-300" />}</td>
                  <td className="px-2 py-2 text-slate-700 font-medium">{t.name}</td>
                  <td className="px-2 py-2">
                    {t.task_statuses && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ backgroundColor: `${t.task_statuses.color_hex || "#94a3b8"}20`, color: t.task_statuses.color_hex || "#64748b" }}>
                        {t.task_statuses.label}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-slate-500">{t.assignee?.full_name || "—"}</td>
                  <td className="px-2 py-2 text-slate-500 whitespace-nowrap">{formatDate(t.start_date)}</td>
                  <td className="px-6 py-2 text-slate-500 whitespace-nowrap">{formatDate(t.due_date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-2">
          <div className="flex justify-between text-[10px] text-slate-400 px-1">
            <span>{formatDate(axisStart.toISOString())}</span>
            <span>{formatDate(axisEnd.toISOString())}</span>
          </div>
          <div className="space-y-2">
            {tasks.map(t => {
              const due = t.due_date ? new Date(t.due_date) : null;
              const start = t.start_date ? new Date(t.start_date) : due;
              if (!start && !due) return null;
              const barStart = start || due!;
              const barEnd = due || start!;
              const leftPct = (daysBetween(axisStart, barStart) / span) * 100;
              const widthPct = Math.max((daysBetween(barStart, barEnd) / span) * 100, 0.8);
              const color = t.task_statuses?.color_hex || (t.is_completed ? "#10b981" : "#6366f1");
              return (
                <div key={t.id} className="flex items-center gap-3">
                  <p className="w-40 shrink-0 text-[11px] text-slate-600 truncate" title={t.name}>{t.name}</p>
                  <div className="flex-1 relative h-5 bg-slate-50 rounded-full">
                    <div
                      className="absolute top-0.5 h-4 rounded-full"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: color, opacity: t.is_completed ? 0.5 : 1 }}
                      title={`${formatDate(t.start_date)} → ${formatDate(t.due_date)}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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
