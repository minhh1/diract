// lib/shellCache.ts
// Synchronous localStorage cache for page "shells" (schema/fields, table
// defs, dashboard config, company/profile bootstrap) -- NOT record data.
// Lets a repeat page visit paint its shell from the last-seen copy on the
// very first render, with zero network wait, while a fresh fetch still
// runs in the background and silently corrects/updates it (stale-while-
// revalidate). Deliberately dumb: no TTL, no eviction beyond overwrite --
// staleness self-heals within one background refresh, and shells are small
// enough that this never approaches localStorage's size limit.

const PREFIX = "nk_shell:";

export function readShellCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeShellCache<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Quota exceeded / private browsing -- caching is purely an
    // optimization, never required for correctness, so just drop it.
  }
}

export function clearShellCache(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

// Wipes every shell, not just one key -- see lib/clearClientCaches.ts for
// why this needs to exist and where it's called from (identity changes:
// switching active company, signing out).
export function clearAllShellCache(): void {
  if (typeof window === "undefined") return;
  try {
    Object.keys(window.localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}
