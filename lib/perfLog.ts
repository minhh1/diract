// lib/perfLog.ts
// Load-time instrumentation for the dashboard's data-loading waterfall.
// Every call records a timestamped entry into a capped localStorage ring
// buffer (survives navigation/reload, purely local to this browser) so it
// can be reviewed later from Admin > Performance — and, in development only,
// also prints straight to the console for live debugging.

export interface PerfLogEntry {
  t: number; // ms since navigation start (performance.now() at call time)
  at: number; // Date.now() — wall-clock, for grouping entries by page load
  label: string;
  detail?: string;
}

const STORAGE_KEY = "nk_perf_log";
const MAX_ENTRIES = 1000;

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
  const t = Math.round(performance.now());

  if (process.env.NODE_ENV !== "production") {
    console.log(`[timing] ${t}ms  ${label}${detail ? `  — ${detail}` : ""}`);
  }

  const entries = readEntries();
  entries.push({ t, at: Date.now(), label, detail });
  writeEntries(entries);
}

export function getPerfLogEntries(): PerfLogEntry[] {
  return readEntries();
}

export function clearPerfLog(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
