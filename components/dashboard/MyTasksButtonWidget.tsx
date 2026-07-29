"use client";

// Renders as a single button (see lib/dashboardWidgets/types.ts's
// MyTasksButtonWidget); clicking it opens a drawer of the SIGNED-IN
// viewer's own open tasks (tasks.assignee_id = userId, not company-wide --
// deliberately narrower than the master Tasks table or a public task
// page's scopes). Each task's text is independently editable, optionally
// via an AI "make this professional" rewrite (app/api/ai/rewrite-text),
// before "Convert" hands it off (via onConvert -- see
// DashboardWidgetRenderer's my_tasks_button case) to become a prefilled,
// still-editable draft in this dashboard's own quick-add form -- never
// submitted directly from here, so the viewer always gets a last look
// (and a chance to fill in whatever this widget doesn't know about, like
// Rate/Duration) before it becomes a real record.
import { useState, useEffect } from "react";
import { ListChecks, X, Loader2, Sparkles, ArrowRight, Check, Trash2, CalendarDays } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface TaskRow {
  id: string;
  name: string;
  notes: string | null;
  due_date: string | null;
  project_id: string | null;
}

// tasks.due_date is a full timestamptz -- an <input type="date"> needs the
// bare YYYY-MM-DD portion, same convention the public task page's edit form
// uses (see app/public/tasks/[pageId]/page.tsx's TaskModal).
const toDateInputValue = (dueDate: string | null) => (dueDate ? dueDate.slice(0, 10) : '');

interface Props {
  label: string;
  companyId: string;
  userId: string;
  // field_key on this dashboard's own table -- null means the widget
  // hasn't been configured yet (gear icon), so Convert stays disabled with
  // an explanatory note rather than silently doing nothing.
  descriptionFieldKey: string | null;
  matterFieldKey: string | null;
  onConvert: (values: Record<string, any>) => void;
}

export default function MyTasksButtonWidget({ label, companyId, userId, descriptionFieldKey, matterFieldKey, onConvert }: Props) {
  const { tableLabelOverrides } = useCompany();
  const matterLabel = tableLabelOverrides.projects?.singular || 'Matter';

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  // Editable per-task draft text, seeded from notes (falling back to the
  // task's own name for a task with no notes) the first time it's seen --
  // never re-seeded from `tasks` after that, so an in-progress edit or an
  // AI rewrite survives the list simply re-rendering.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [rewriting, setRewriting] = useState<Record<string, boolean>>({});
  const [rewriteError, setRewriteError] = useState<Record<string, string>>({});
  useProgressBarWhile(loading);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from('tasks')
        .select('id, name, notes, due_date, project_id')
        .eq('company_id', companyId)
        .eq('assignee_id', userId)
        .eq('is_completed', false)
        .is('deleted_at', null)
        .order('due_date', { ascending: true, nullsFirst: false });
      if (!active) return;
      const rows: TaskRow[] = data || [];
      setTasks(rows);
      setDrafts(prev => {
        const next = { ...prev };
        for (const t of rows) if (next[t.id] === undefined) next[t.id] = t.notes || t.name;
        return next;
      });
      setLoading(false);

      const projectIds = Array.from(new Set(rows.map(t => t.project_id).filter((id): id is string => !!id)));
      if (projectIds.length) {
        const { data: projects } = await supabase.from('projects').select('id, name').in('id', projectIds);
        if (active && projects) {
          setProjectNames(prev => ({ ...prev, ...Object.fromEntries(projects.map((p: any) => [p.id, p.name])) }));
        }
      }
    })();
    return () => { active = false; };
  }, [open, companyId, userId]);

  const handleRewrite = async (taskId: string) => {
    setRewriting(prev => ({ ...prev, [taskId]: true }));
    setRewriteError(prev => { const { [taskId]: _removed, ...rest } = prev; return rest; });
    try {
      const res = await fetch('/api/ai/rewrite-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: drafts[taskId] || '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Rewrite failed');
      setDrafts(prev => ({ ...prev, [taskId]: json.text }));
    } catch (err) {
      setRewriteError(prev => ({ ...prev, [taskId]: err instanceof Error ? err.message : 'Rewrite failed' }));
    } finally {
      setRewriting(prev => ({ ...prev, [taskId]: false }));
    }
  };

  const handleConvert = (task: TaskRow) => {
    if (!descriptionFieldKey) return;
    const values: Record<string, any> = { [descriptionFieldKey]: drafts[task.id] ?? task.notes ?? task.name };
    if (matterFieldKey && task.project_id) values[matterFieldKey] = task.project_id;
    onConvert(values);
    // Deliberately NOT closing the drawer here -- converting one task while
    // the rest of the dashboard (in particular the quick-add form this just
    // prefilled) stays open and usable is the whole point; the viewer may
    // want to convert several tasks in a row without reopening this each
    // time. The task itself stays in the list too (still open) until
    // explicitly ticked complete below -- logging time against it isn't the
    // same as finishing it.
  };

  // Optimistic -- this list only shows open tasks, so completing one just
  // removes it locally right away; confirmed with the server after. Mirrors
  // the public task page's own toggleComplete (see
  // app/public/tasks/[pageId]/page.tsx), minus the un-complete direction --
  // this widget never shows completed tasks to toggle back.
  const toggleComplete = async (task: TaskRow) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));
    const { error } = await supabase
      .from('tasks')
      .update({ is_completed: true, completed_at: new Date().toISOString() })
      .eq('id', task.id);
    if (error) setTasks(prev => [...prev, task].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')));
  };

  const handleDeleteTask = async (task: TaskRow) => {
    if (!window.confirm(`Delete "${task.name}"?`)) return;
    setTasks(prev => prev.filter(t => t.id !== task.id));
    const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id);
    if (error) setTasks(prev => [...prev, task].sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999')));
  };

  const handleDueDateChange = async (task: TaskRow, value: string) => {
    const nextDueDate = value || null;
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, due_date: nextDueDate } : t));
    await supabase.from('tasks').update({ due_date: nextDueDate }).eq('id', task.id);
  };

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full h-full min-h-[56px] flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[12px] font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-all"
      >
        <ListChecks size={16} /> {label}
      </button>

      {open && (
        // No full-screen backdrop here (unlike most other drawers in this
        // app) -- deliberately, so this can stay open WHILE the viewer
        // works elsewhere on the dashboard (e.g. the quick-add form a
        // Convert just prefilled) instead of intercepting every click
        // outside it and forcing a close. pointer-events-none on this
        // outer layer + pointer-events-auto on the panel itself keeps the
        // right-docked layout without blocking anything behind it; only
        // the X button (or the toggle button again) closes it.
        <div className="fixed inset-0 z-40 flex pointer-events-none">
          <div className="relative ml-auto w-[420px] max-w-full bg-white h-full shadow-2xl flex flex-col pointer-events-auto border-l border-slate-200">
            <div className="flex items-center justify-between px-6 pt-8 pb-4 border-b border-slate-100 shrink-0">
              <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">{label}</h2>
              <button onClick={() => setOpen(false)} className="p-1.5 text-slate-300 hover:text-slate-700 transition-colors">
                <X size={18} />
              </button>
            </div>

            {!descriptionFieldKey && (
              <div className="mx-6 mt-4 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-2xl text-[11px] text-amber-700 font-medium">
                This widget needs a description field configured (gear icon) before tasks can be converted.
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {loading ? null : tasks.length === 0 ? (
                <p className="text-center text-[11px] text-slate-300 italic py-10">No open tasks assigned to you</p>
              ) : tasks.map(task => (
                <div key={task.id} className="border border-slate-200 rounded-2xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <button
                        onClick={() => toggleComplete(task)}
                        title="Mark complete"
                        className="group mt-0.5 w-5 h-5 shrink-0 rounded-full border-2 border-slate-300 hover:border-emerald-500 hover:bg-emerald-50 flex items-center justify-center transition-all"
                      >
                        <Check size={11} className="text-transparent group-hover:text-emerald-500" />
                      </button>
                      <p className="text-[12px] font-bold text-slate-800 leading-snug">{task.name}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteTask(task)}
                      title="Delete task"
                      className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 pl-7">
                    <CalendarDays size={11} className="text-slate-300 shrink-0" />
                    <input
                      type="date"
                      value={toDateInputValue(task.due_date)}
                      onChange={e => handleDueDateChange(task, e.target.value)}
                      className="text-[10px] font-bold text-slate-500 bg-transparent outline-none cursor-pointer"
                    />
                  </div>
                  {task.project_id && projectNames[task.project_id] && (
                    <p className="text-[10px] text-slate-400 font-medium pl-7">{matterLabel}: {projectNames[task.project_id]}</p>
                  )}
                  <textarea
                    value={drafts[task.id] ?? ''}
                    onChange={e => setDrafts(prev => ({ ...prev, [task.id]: e.target.value }))}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-[11px] font-medium outline-none focus:ring-2 focus:ring-indigo-100 resize-none"
                  />
                  {rewriteError[task.id] && <p className="text-[10px] text-red-500 font-medium">{rewriteError[task.id]}</p>}
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleRewrite(task.id)}
                      disabled={!!rewriting[task.id]}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-slate-50 text-slate-600 rounded-full text-[10px] font-bold hover:bg-slate-100 disabled:opacity-50 transition-all"
                    >
                      {rewriting[task.id] ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Rewrite with AI
                    </button>
                    <button
                      onClick={() => handleConvert(task)}
                      disabled={!descriptionFieldKey}
                      title={!descriptionFieldKey ? 'Configure a description field first' : undefined}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
                    >
                      <ArrowRight size={11} /> Convert
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
