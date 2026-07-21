// components/admin/AdminPerfTab.tsx
// Internal load-time diagnostics — reads the perfLog ring buffer (lib/perfLog.ts)
// that every major data-loading hook writes to, and groups it back into
// per-page-load waterfalls. Gated to a single user in app/dashboard/admin/page.tsx;
// this component itself doesn't re-check identity since it holds no data of
// its own (everything here is local to whichever browser loaded the page).
"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Trash2, RefreshCw } from "lucide-react";
import { getPerfLogEntries, clearPerfLog, type PerfLogEntry } from "@/lib/perfLog";

// Entries more than this far apart (wall-clock) are treated as separate page
// loads rather than one continuous waterfall.
const SESSION_GAP_MS = 3000;

interface Group {
  startedAt: number;
  entries: PerfLogEntry[];
}

function groupEntries(entries: PerfLogEntry[]): Group[] {
  const groups: Group[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (!last || entry.at - last.entries[last.entries.length - 1].at > SESSION_GAP_MS) {
      groups.push({ startedAt: entry.at, entries: [entry] });
    } else {
      last.entries.push(entry);
    }
  }
  return groups.reverse(); // newest first
}

export default function AdminPerfTab() {
  const [entries, setEntries] = useState<PerfLogEntry[]>([]);
  const [live, setLive] = useState(true);
  const [expanded, setExpanded] = useState<number>(0); // index of expanded group, newest = 0

  useEffect(() => {
    setEntries(getPerfLogEntries());
    if (!live) return;
    const id = setInterval(() => setEntries(getPerfLogEntries()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const groups = useMemo(() => groupEntries(entries), [entries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {entries.length} logged events across {groups.length} page load{groups.length !== 1 ? "s" : ""}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            Local to this browser only — captured from every dashboard page load, newest first.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLive(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold transition-all ${
              live ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"
            }`}
          >
            <RefreshCw size={12} className={live ? "animate-spin" : ""} style={live ? { animationDuration: "2s" } : undefined} />
            {live ? "Live" : "Paused"}
          </button>
          <button
            onClick={() => { clearPerfLog(); setEntries([]); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold bg-red-50 text-red-600 hover:bg-red-100 transition-all"
          >
            <Trash2 size={12} />
            Clear log
          </button>
        </div>
      </div>

      {groups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-slate-300">
          <Activity size={28} />
          <p className="text-[11px] font-bold uppercase tracking-widest">No events yet — load a dashboard page</p>
        </div>
      )}

      {groups.map((group, gi) => {
        const isOpen = expanded === gi;
        const total = group.entries[group.entries.length - 1].t;
        return (
          <div key={group.startedAt} className="border border-slate-100 rounded-2xl overflow-hidden">
            <button
              onClick={() => setExpanded(isOpen ? -1 : gi)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-all"
            >
              <span className="text-[11px] font-bold text-slate-700">
                {new Date(group.startedAt).toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {group.entries.length} events · {total.toLocaleString()}ms total
              </span>
            </button>
            {isOpen && (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                    <th className="text-left px-4 py-2">t (ms)</th>
                    <th className="text-left px-4 py-2">+Δ</th>
                    <th className="text-left px-4 py-2">Event</th>
                    <th className="text-left px-4 py-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {group.entries.map((e, i) => {
                    const prev = group.entries[i - 1];
                    const delta = prev ? e.t - prev.t : 0;
                    return (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-4 py-1.5 font-mono text-slate-500">{e.t}</td>
                        <td className={`px-4 py-1.5 font-mono ${delta > 500 ? "text-red-500 font-bold" : "text-slate-300"}`}>
                          {i === 0 ? "—" : `+${delta}`}
                        </td>
                        <td className="px-4 py-1.5 text-slate-700 font-medium">{e.label}</td>
                        <td className="px-4 py-1.5 text-slate-400">{e.detail || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}
