// components/clientUpdatePages/ActivityLogModal.tsx
// Staff-only view of client_update_page_logs -- what changed, who by, when.
"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";

interface LogEntry { id: string; actor_name: string | null; source: "staff" | "client"; action: string; detail: string; created_at: string; }

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ActivityLogModal({ pageId, onClose }: { pageId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[] | null>(null);

  useEffect(() => {
    fetch(`/api/client-update-pages/${pageId}/logs`).then(r => r.json()).then(json => setLogs(json.logs || []));
  }, [pageId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Activity log</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {logs === null ? (
            <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
          ) : logs.length === 0 ? (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">No activity yet</p>
          ) : (
            <div className="space-y-3">
              {logs.map(l => (
                <div key={l.id} className="flex items-start gap-3 text-[12px]">
                  <span className="text-slate-300 shrink-0 w-14 text-right">{timeAgo(l.created_at)}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-700">{l.detail}</span>
                    {l.actor_name && <span className="text-slate-400"> — {l.actor_name}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
