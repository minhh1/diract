// components/TaskHistoryTab.tsx
// Shared "History" tab content for the task edit modal — used by both the
// main app's Checklist View and the public task page. Reads directly from
// task_activity_log (RLS-gated to the viewer's company).
"use client";

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface LogEntry {
  id: string;
  action: string;
  detail: string | null;
  created_at: string;
  actor_id: string | null;
}
interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  created: "created this task",
  updated: "updated this task",
  completed: "marked this task complete",
  reopened: "marked this task incomplete",
  follow_up_set: "marked this task awaiting follow-up",
  follow_up_cleared: "cleared the follow-up flag",
  note_updated: "updated the note",
  email_linked: "linked a reference email",
  deleted: "deleted this task",
};

export default function TaskHistoryTab({ taskId, profiles }: { taskId: string; profiles: Profile[] }) {
  const [entries, setEntries] = useState<LogEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("task_activity_log")
        .select("id, action, detail, created_at, actor_id")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false });
      if (!cancelled) setEntries(data || []);
    })();
    return () => { cancelled = true; };
  }, [taskId]);

  const actorName = (id: string | null) => {
    if (!id) return "System";
    const p = profiles.find(p => p.id === id);
    return p?.full_name || p?.email || "Unknown";
  };

  if (entries === null) {
    return <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-slate-300" /></div>;
  }
  if (!entries.length) {
    return <p className="text-center text-[11px] text-slate-300 italic py-10">No activity yet</p>;
  }

  return (
    <div className="space-y-3">
      {entries.map(e => (
        <div key={e.id} className="flex items-start gap-3 px-4 py-3 bg-slate-50 rounded-2xl">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] text-slate-700">
              <span className="font-bold">{actorName(e.actor_id)}</span> {ACTION_LABELS[e.action] || e.action}
              {e.detail ? <span className="text-slate-500"> — {e.detail}</span> : null}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              {new Date(e.created_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
