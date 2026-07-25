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
import { ListChecks, X, Loader2, Sparkles, ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";

interface TaskRow {
  id: string;
  name: string;
  notes: string | null;
  due_date: string | null;
  project_id: string | null;
}

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
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full h-full min-h-[56px] flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[12px] font-bold text-slate-700 hover:border-indigo-300 hover:text-indigo-600 transition-all"
      >
        <ListChecks size={16} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative ml-auto w-[420px] max-w-full bg-white h-full shadow-2xl flex flex-col">
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
              {loading ? (
                <div className="flex justify-center py-10"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
              ) : tasks.length === 0 ? (
                <p className="text-center text-[11px] text-slate-300 italic py-10">No open tasks assigned to you</p>
              ) : tasks.map(task => (
                <div key={task.id} className="border border-slate-200 rounded-2xl p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-bold text-slate-800">{task.name}</p>
                    {task.due_date && (
                      <span className="shrink-0 text-[9px] font-bold text-slate-400 uppercase tracking-wide">
                        {/* tasks.due_date is a full timestamptz ('2026-07-25T00:00:00+00:00'),
                            not a bare date -- unlike this app's custom-table date fields
                            (see bucketKey's comment on THOSE needing a manual
                            local-midnight T00:00:00 append), so it parses directly. */}
                        {new Date(task.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {task.project_id && projectNames[task.project_id] && (
                    <p className="text-[10px] text-slate-400 font-medium">{matterLabel}: {projectNames[task.project_id]}</p>
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
