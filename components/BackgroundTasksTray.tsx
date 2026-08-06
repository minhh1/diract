"use client";

// Renders whatever's in lib/backgroundTasks.ts as a stack of small cards,
// bottom-right, above everything else -- mounted once in the dashboard
// layout (see app/(app)/dashboard/layout.tsx) so a task started from a modal
// on one page keeps reporting progress even after that modal (or page)
// closes. See backgroundTasks.ts's own header comment for why this exists
// as a plain external store instead of component state.
import { useEffect, useState } from "react";
import { Loader2, Check, X, AlertTriangle } from "lucide-react";
import { subscribeBackgroundTasks, dismissBackgroundTask, type BackgroundTask } from "@/lib/backgroundTasks";

export default function BackgroundTasksTray() {
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);

  useEffect(() => subscribeBackgroundTasks(setTasks), []);

  if (tasks.length === 0) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[90] flex flex-col gap-2 w-80">
      {tasks.map(t => {
        const pct = t.total > 0 ? Math.min(100, Math.round((t.done / t.total) * 100)) : t.status === 'done' ? 100 : 0;
        return (
          <div key={t.id} className="bg-white border border-slate-200 rounded-2xl shadow-xl p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {t.status === 'running' && <Loader2 size={14} className="text-indigo-500 animate-spin shrink-0" />}
                {t.status === 'done' && <div className="h-4 w-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0"><Check size={10} /></div>}
                {t.status === 'error' && <AlertTriangle size={14} className="text-rose-500 shrink-0" />}
                <p className="text-[12px] font-semibold text-slate-800 truncate">
                  {t.status === 'done' ? (t.resultLabel || 'Done') : t.status === 'error' ? 'Failed' : t.label}
                </p>
              </div>
              {t.status !== 'running' && (
                <button onClick={() => dismissBackgroundTask(t.id)} className="p-0.5 text-slate-300 hover:text-slate-600 shrink-0"><X size={13} /></button>
              )}
            </div>

            {t.status === 'running' && (
              <>
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${pct}%` }} />
                </div>
                {t.total > 0 && <p className="mt-1 text-[10px] text-slate-400">{t.done}/{t.total}</p>}
              </>
            )}

            {t.status === 'error' && t.errorMessage && (
              <p className="mt-1.5 text-[11px] text-rose-600">{t.errorMessage}</p>
            )}

            {t.status === 'done' && t.resultHref && (
              <a href={t.resultHref} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[11px] font-bold text-indigo-600 hover:text-indigo-800">
                Preview PDF
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
