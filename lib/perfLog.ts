// lib/perfLog.ts
// Load-time instrumentation for the dashboard's data-loading waterfall.
// Every call records a timestamped entry into a capped localStorage ring
// buffer (survives navigation/reload, purely local to this browser) so it
// can be reviewed later from Admin > Performance, and always prints
// straight to the console too -- including in production, deliberately:
// this app is routinely debugged live on the deployed Vercel site (not just
// `next dev`), so gating console output to non-production meant load-time
// output was invisible exactly where it was most needed.

export interface PerfLogEntry {
  t: number; // ms since this page's own load started (see currentT below)
  at: number; // Date.now() — wall-clock, for grouping entries by page load
  label: string;
  detail?: string;
  // URL path at the moment this entry was logged -- lets Admin > Performance
  // classify/group entries by which page they belong to even when several
  // pages' entries land in the same session-gap grouping (e.g. client-side
  // navigation between dashboards without a full reload). Absent on the
  // (rare) server-side call, since window isn't available there.
  path?: string;
}

const STORAGE_KEY = "nk_perf_log";
const MAX_ENTRIES = 1000;

// Client-side (App Router) navigation never reloads the tab, so a plain
// performance.now() keeps climbing across every dashboard/table/settings
// click instead of restarting -- e.g. showing "47000ms" for a click that
// actually took 300ms, because it's still counting from whenever the tab
// was first opened. This tracks each page visit's own start so `t` reads as
// "ms into loading the page I'm currently on," which is what's actually
// useful both in the console and in Admin > Performance. Detected lazily
// (not via a React navigation hook -- this file has no React dependency) by
// comparing the pathname on every call against the last one seen; the FIRST
// call ever (epochPath still null) is left alone so a genuine full page
// load still measures from real navigation start, not from whenever React
// happened to first call perfLog.
let epochPath: string | null = null;
let epochStart = 0;

function currentT(path: string | undefined): number {
  const now = performance.now();
  if (path !== undefined && path !== epochPath) {
    if (epochPath !== null) epochStart = now; // a real navigation, not the first-ever call
    epochPath = path;
  }
  return Math.round(now - epochStart);
}

function readEntries(): PerfLogEntry[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: PerfLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {}
}

export function perfLog(label: string, detail?: string): void {
  if (typeof performance === "undefined") return;
  const path = typeof window !== "undefined" ? window.location.pathname : undefined;
  const t = currentT(path);

  console.log(`[timing] ${t}ms  ${label}${detail ? `  — ${detail}` : ""}`);

  const entries = readEntries();
  entries.push({ t, at: Date.now(), label, detail, path });
  writeEntries(entries);
}

// Marks the start/ready boundary of a full "main URL" page load -- a
// dashboard, a custom table, or a settings screen -- distinct from the
// finer-grained hook-level perfLog() calls already sprinkled through data
// hooks (CompanyContext, useCustomTables, etc). Admin > Performance singles
// these "PAGE ..." labelled entries out to show one clean "this URL took
// Nms" row per route, keyed on `path`, instead of making the admin eyeball
// a whole raw waterfall to find the number that matters.
export type PerfPageKind = "dashboard" | "table" | "settings" | "admin" | "marketplace";
export function perfLogPageStart(kind: PerfPageKind, name: string): void {
  perfLog(`PAGE ${kind}(${name}): start`);
}
export function perfLogPageReady(kind: PerfPageKind, name: string): void {
  perfLog(`PAGE ${kind}(${name}): ready`);
}

export function getPerfLogEntries(): PerfLogEntry[] {
  return readEntries();
}

export function clearPerfLog(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
