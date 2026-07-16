// components/projects/ProjectDeletedTasksPanel.tsx
// Admin-only tab per project — lists soft-deleted tasks (deleted_at set)
// so an admin can restore them or purge them for good. Purging is a hard
// delete (irreversible), so it's gated behind a confirmation.
"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, RotateCcw, Trash2, AlertTriangle } from "lucide-react";

interface DeletedTask {
  id: string;
  name: string;
  due_date: string | null;
  deleted_at: string;
  assignee: { full_name: string | null; email: string | null } | null;
}

export default function ProjectDeletedTasksPanel({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<DeletedTask[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("tasks")
      .select("id, name, due_date, deleted_at, assignee:assignee_id(full_name, email)")
      .eq("project_id", projectId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    setTasks((data as any) || []);
    setSelected(new Set());
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const allSelected = tasks.length > 0 && selected.size === tasks.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(tasks.map(t => t.id)));
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleRestore = async () => {
    if (!selected.size) return;
    setBusy(true);
    await supabase.from("tasks").update({ deleted_at: null }).in("id", Array.from(selected));
    setBusy(false);
    load();
  };

  const handlePurge = async () => {
    if (!selected.size) return;
    if (!window.confirm(`Permanently delete ${selected.size} task${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBusy(true);
    await supabase.from("tasks").delete().in("id", Array.from(selected));
    setBusy(false);
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-300" size={20} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
        <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 leading-relaxed">
          Deleted tasks stay here until restored or purged for good. Purging cannot be undone.
        </p>
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-[11px] text-slate-300 font-bold uppercase tracking-widest py-12">No deleted tasks</p>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded accent-indigo-600" />
              <span className="text-[11px] font-bold text-slate-500">{selected.size} of {tasks.length} selected</span>
            </label>
            <div className="flex items-center gap-2">
              <button onClick={handleRestore} disabled={!selected.size || busy}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-indigo-600 border border-indigo-200 rounded-full hover:bg-indigo-50 disabled:opacity-40 transition-colors">
                <RotateCcw size={12} /> Restore
              </button>
              <button onClick={handlePurge} disabled={!selected.size || busy}
                className="flex items-center gap-1.5 px-4 py-2 text-[11px] font-bold text-white bg-red-600 rounded-full hover:bg-red-700 disabled:opacity-40 transition-colors">
                <Trash2 size={12} /> Delete for good
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {tasks.map(t => (
              <label key={t.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-2xl cursor-pointer hover:border-slate-300 transition-colors">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} className="w-4 h-4 rounded accent-indigo-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-700 truncate">{t.name}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {t.assignee && (t.assignee.full_name || t.assignee.email) ? `${t.assignee.full_name || t.assignee.email} · ` : ""}
                    Deleted {new Date(t.deleted_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
