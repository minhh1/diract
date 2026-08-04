"use client";

// Schedule-adherence bars for one project: how much of its task list is
// actually done vs. how much SHOULD be done by today per the tasks' own
// due dates. Same `tasks` fields ChecklistTab.tsx already reads
// (is_completed, due_date) -- this is a read-only summary, not a task list,
// so it queries them directly rather than pulling in that whole tab.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

interface Progress {
  total: number;
  completedPct: number;
  expectedByNowPct: number;
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        <span className="text-[11px] font-bold text-slate-700">{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function ProjectTaskProgressBars({ projectId }: { projectId: string }) {
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setProgress(null);
    supabase
      .from('tasks')
      .select('is_completed, due_date')
      .eq('project_id', projectId)
      .is('deleted_at', null)
      .then(({ data }) => {
        if (cancelled) return;
        const tasks = data || [];
        const today = new Date().toISOString().slice(0, 10);
        const total = tasks.length;
        const completed = tasks.filter(t => t.is_completed).length;
        const expectedByNow = tasks.filter(t => t.due_date && String(t.due_date).slice(0, 10) <= today).length;
        setProgress({
          total,
          completedPct: total ? Math.round((completed / total) * 100) : 0,
          expectedByNowPct: total ? Math.round((expectedByNow / total) * 100) : 0,
        });
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-300" /></div>;
  }
  if (!progress || progress.total === 0) {
    return <p className="text-[11px] text-slate-300 italic py-2">No tasks on this project yet</p>;
  }

  return (
    <div className="space-y-3 py-1">
      <Bar label="Completed" pct={progress.completedPct} color="bg-emerald-500" />
      <Bar label="Expected by now" pct={progress.expectedByNowPct} color="bg-indigo-500" />
    </div>
  );
}
