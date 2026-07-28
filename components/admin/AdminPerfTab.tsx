// components/admin/AdminPerfTab.tsx
// Internal load-time diagnostics — reads the perfLog ring buffer (lib/perfLog.ts)
// that every major data-loading hook writes to, and groups it back into
// per-page-load waterfalls. Gated to a single user in app/dashboard/admin/page.tsx;
// this component itself doesn't re-check identity since it holds no data of
// its own (everything here is local to whichever browser loaded the page).
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Activity, Trash2, RefreshCw, Gauge } from "lucide-react";
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
    const lastEntry = last?.entries[last.entries.length - 1];
    // A new group starts on either a real wall-clock gap OR the path
    // actually changing -- without the path check, clicking from one page
    // to another inside the gap window (the common case -- SPA navigation
    // is fast) would merge both pages' entries into one group. Since `t`
    // resets per page (see perfLog.ts's currentT), that made the "+Δ"
    // column show a big jump backwards mid-list and the group's own
    // "total" reflect whichever page's entries happened to load last, not
    // either page's real duration. Only splits when both entries actually
    // have a path -- older buffered entries from before path tracking
    // existed have none, and should keep falling back to gap-only grouping.
    const pathChanged = !!lastEntry?.path && !!entry.path && entry.path !== lastEntry.path;
    if (!last || pathChanged || entry.at - lastEntry!.at > SESSION_GAP_MS) {
      groups.push({ startedAt: entry.at, entries: [entry] });
    } else {
      last.entries.push(entry);
    }
  }
  return groups.reverse(); // newest first
}

// Matches the "PAGE <kind>(<name>): start" / "...: ready" pairs logged by
// perfLogPageStart/perfLogPageReady (see lib/perfLog.ts) -- the boundary of
// one full "main URL" load, as opposed to every finer-grained hook-level
// perfLog() call also captured above. Kept separate from groupEntries'
// session-based waterfall since those two views answer different questions:
// "what happened during this one page load" vs "how has this URL performed
// over time."
const PAGE_EVENT_RE = /^PAGE (\w+)\(([^)]*)\): (start|ready)$/;
const KIND_LABEL: Record<string, string> = { dashboard: "Dashboard", table: "Table", settings: "Settings", admin: "Admin", marketplace: "Marketplace", page: "Page (auto)", record: "Record dashboard", public: "Public page" };

interface PageSample { at: number; durationMs: number }
interface PageStat { kind: string; name: string; samples: PageSample[] }

// Entries come out of the ring buffer oldest-first, and every "PAGE x: start"
// is always followed later by that exact same kind+name's "PAGE x: ready" --
// both logged synchronously within one continuous page session, so `t`
// (performance.now() at call time) is always comparable between the two,
// even though the ring buffer as a whole spans many separate browser
// sessions/reloads (where `t` resets to 0 and isn't comparable across them).
function computePageStats(entries: PerfLogEntry[]): PageStat[] {
  const pendingStart = new Map<string, PerfLogEntry>();
  const byKey = new Map<string, PageStat>();
  for (const e of entries) {
    const m = e.label.match(PAGE_EVENT_RE);
    if (!m) continue;
    const [, kind, name, phase] = m;
    const key = `${kind}:${name}`;
    if (phase === "start") {
      pendingStart.set(key, e);
      continue;
    }
    const start = pendingStart.get(key);
    if (!start) continue; // a "ready" with no matching "start" still in the buffer (e.g. buffer trimmed mid-pair) -- skip rather than guess
    pendingStart.delete(key);
    const durationMs = e.t - start.t;
    if (durationMs < 0) continue;
    if (!byKey.has(key)) byKey.set(key, { kind, name, samples: [] });
    byKey.get(key)!.samples.push({ at: e.at, durationMs });
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind.localeCompare(b.kind)
  );
}

const RECENT_SAMPLES = 20;

function statSummary(stat: PageStat) {
  const recent = stat.samples.slice(-RECENT_SAMPLES);
  const last = recent[recent.length - 1];
  const avg = Math.round(recent.reduce((sum, s) => sum + s.durationMs, 0) / recent.length);
  const max = Math.max(...recent.map(s => s.durationMs));
  return { last: last.durationMs, lastAt: last.at, avg, max, count: stat.samples.length };
}

function durationColor(ms: number): string {
  if (ms > 2000) return "text-red-500";
  if (ms > 800) return "text-amber-500";
  return "text-emerald-600";
}

// Full load-time history for one URL, newest first -- what a row in "Load
// times by URL" expands into on click. `stat.samples` already holds every
// sample still in the ring buffer for this exact kind+name, not just the
// last RECENT_SAMPLES used for the row's own avg/max.
const HISTORY_DISPLAY_LIMIT = 50;
function PageLoadHistory({ stat }: { stat: PageStat }) {
  const all = stat.samples;
  const shown = all.slice(-HISTORY_DISPLAY_LIMIT).reverse();
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
        {all.length} load{all.length !== 1 ? "s" : ""} recorded
        {all.length > HISTORY_DISPLAY_LIMIT ? ` — showing most recent ${HISTORY_DISPLAY_LIMIT}` : ""}
      </p>
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {shown.map((sample, i) => (
          <div key={i} className="flex items-center justify-between text-[11px] px-3 py-1.5 bg-white rounded-lg border border-slate-100">
            <span className="text-slate-400">{new Date(sample.at).toLocaleString()}</span>
            <span className={`font-mono font-bold ${durationColor(sample.durationMs)}`}>{sample.durationMs.toLocaleString()}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminPerfTab() {
  const [entries, setEntries] = useState<PerfLogEntry[]>([]);
  const [live, setLive] = useState(true);
  const [expanded, setExpanded] = useState<number>(0); // index of expanded group, newest = 0
  const [expandedStatKey, setExpandedStatKey] = useState<string | null>(null); // "<kind>:<name>" of the URL row showing its full load history

  useEffect(() => {
    setEntries(getPerfLogEntries());
    if (!live) return;
    const id = setInterval(() => setEntries(getPerfLogEntries()), 1000);
    return () => clearInterval(id);
  }, [live]);

  const groups = useMemo(() => groupEntries(entries), [entries]);
  const pageStats = useMemo(() => computePageStats(entries), [entries]);

  return (
    <div className="space-y-4">
      {pageStats.length > 0 && (
        <div className="border border-slate-100 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-50">
            <Gauge size={14} className="text-slate-400" />
            <span className="text-[11px] font-bold text-slate-700">Load times by URL</span>
            <span className="text-[10px] text-slate-400 ml-auto">avg/max over last {RECENT_SAMPLES} loads · click a row for its full history</span>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-slate-50 text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                <th className="text-left px-4 py-2">Page</th>
                <th className="text-left px-4 py-2">Type</th>
                <th className="text-right px-4 py-2">Last</th>
                <th className="text-right px-4 py-2">Avg</th>
                <th className="text-right px-4 py-2">Max</th>
                <th className="text-right px-4 py-2">Loads</th>
                <th className="text-right px-4 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {pageStats.map(stat => {
                const key = `${stat.kind}:${stat.name}`;
                const s = statSummary(stat);
                const isOpen = expandedStatKey === key;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setExpandedStatKey(isOpen ? null : key)}
                      className={`border-t border-slate-50 cursor-pointer hover:bg-slate-50 ${isOpen ? 'bg-slate-50' : ''}`}
                    >
                      <td className="px-4 py-2 text-slate-700 font-medium">{stat.name}</td>
                      <td className="px-4 py-2 text-slate-400">{KIND_LABEL[stat.kind] || stat.kind}</td>
                      <td className={`px-4 py-2 text-right font-mono font-bold ${durationColor(s.last)}`}>{s.last.toLocaleString()}ms</td>
                      <td className={`px-4 py-2 text-right font-mono ${durationColor(s.avg)}`}>{s.avg.toLocaleString()}ms</td>
                      <td className="px-4 py-2 text-right font-mono text-slate-400">{s.max.toLocaleString()}ms</td>
                      <td className="px-4 py-2 text-right text-slate-400">{s.count}</td>
                      <td className="px-4 py-2 text-right text-slate-400">{new Date(s.lastAt).toLocaleTimeString()}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t border-slate-50 bg-slate-50/60">
                        <td colSpan={7} className="px-4 py-3">
                          <PageLoadHistory stat={stat} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

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
                {group.entries[0].path && <span className="ml-2 font-mono font-normal text-slate-400">{group.entries[0].path}</span>}
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
