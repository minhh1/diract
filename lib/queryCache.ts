// lib/queryCache.ts
// Stale-while-revalidate cache using localStorage.
// - On first call: returns null (no cache), fetches fresh
// - On subsequent calls: returns cached instantly, fetches fresh in background, updates if changed

const CACHE_VERSION = 'v2'; // bumped to clear stale cross-company cached data
const TTL_MS = 5 * 60 * 1000; // 5 minutes -- after this, cache is considered stale

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
}

function cacheKey(key: string): string {
  return `nk_cache_${key}`;
}

export function readCache<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (entry.version !== CACHE_VERSION) return null;
    return entry.data;
  } catch {
    return null;
  }
}

// Removes the single oldest nk_cache_ entry (by its stored timestamp) to
// free room for a write that just failed with a quota error. Scans every
// nk_cache_ key, not just ones for the current company -- this cache has NO
// TTL/size cap of its own (readCache never checks TTL_MS despite it being
// declared -- entries just accumulate, across every company ever visited on
// this browser, forever), so once quota is hit the oldest entry is just as
// likely to belong to a company nobody's opened in months as to the current
// one. Returns false once nothing is left to evict.
function evictOldestCacheEntry(): boolean {
  if (typeof window === 'undefined') return false;
  let oldestKey: string | null = null;
  let oldestTimestamp = Infinity;
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('nk_cache_')) continue;
    let timestamp = 0;
    try { timestamp = JSON.parse(localStorage.getItem(k) || '{}')?.timestamp ?? 0; } catch { /* unparseable entry -- treat as oldest */ }
    if (timestamp < oldestTimestamp) { oldestTimestamp = timestamp; oldestKey = k; }
  }
  if (!oldestKey) return false;
  localStorage.removeItem(oldestKey);
  return true;
}

export function writeCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  const entry: CacheEntry<T> = {
    data,
    timestamp: Date.now(),
    version: CACHE_VERSION,
  };
  const serialized = JSON.stringify(entry);
  const storageKey = cacheKey(key);
  try {
    localStorage.setItem(storageKey, serialized);
    return;
  } catch {
    // Quota exceeded -- fall through to eviction below rather than
    // silently dropping this write. Without this, a company whose tables
    // are large enough to push localStorage over quota (e.g. a wide custom
    // table with hundreds of rows) would NEVER successfully cache again:
    // every write for every key fails from that point on, since nothing
    // was ever evicting old entries to begin with -- exactly the "cache
    // never actually helps" symptom this was built to fix.
  }
  const MAX_EVICTIONS = 50;
  for (let i = 0; i < MAX_EVICTIONS; i++) {
    if (!evictOldestCacheEntry()) break;
    try {
      localStorage.setItem(storageKey, serialized);
      return;
    } catch { /* keep evicting */ }
  }
  console.warn(`[cache] Failed to persist "${key}" even after evicting old entries -- localStorage full or unavailable`);
}

// Call this once on app startup to remove stale cross-company cached data
export function clearStaleCrossCompanyCache(): void {
  if (typeof window === 'undefined') return;
  // Remove all non-scoped row caches (old format without company ID)
  Object.keys(localStorage)
    .filter(k => {
      if (!k.startsWith('nk_cache_rows_')) return false;
      // New format: nk_cache_rows_<companyId>_<table> -- companyId is a UUID
      const rest = k.replace('nk_cache_rows_', '');
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}/.test(rest);
      return !isUUID; // remove old non-UUID-prefixed keys
    })
    .forEach(k => localStorage.removeItem(k));
}

export function clearCache(keyPrefix?: string): void {
  if (typeof window === 'undefined') return;
  const prefix = keyPrefix ? `nk_cache_${keyPrefix}` : 'nk_cache_';
  Object.keys(localStorage)
    .filter(k => k.startsWith(prefix))
    .forEach(k => localStorage.removeItem(k));
}

// Keyed by cache key, not per-caller -- two callers racing on the same key
// (React Strict Mode's mount/unmount/remount double-invoke in dev, or any
// future legitimate double-trigger) share the one real fetch in flight
// instead of each independently hitting the network for identical data.
const inFlightFetches = new Map<string, Promise<unknown>>();

/**
 * Stale-while-revalidate fetch.
 *
 * 1. Immediately returns cached data (or null if no cache)
 * 2. Fetches fresh data in background
 * 3. Calls onUpdate if fresh data differs from cache
 *
 * Usage:
 *   const cached = swr('projects_list', fetchProjects, (fresh) => setItems(fresh));
 *   setItems(cached ?? []);
 */
export async function swr<T>(
  key: string,
  fetcher: () => Promise<T>,
  onUpdate: (data: T) => void,
): Promise<T | null> {
  const cached = readCache<T>(key);

  const dedupedFetch = (): Promise<T> => {
    const existing = inFlightFetches.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = fetcher().finally(() => { inFlightFetches.delete(key); });
    inFlightFetches.set(key, promise);
    return promise;
  };

  // Fetch fresh in background (or immediately if no cache)
  const fetchFresh = async () => {
    try {
      const fresh = await dedupedFetch();
      const prev = readCache<T>(key);
      // Only update if data actually changed
      if (JSON.stringify(fresh) !== JSON.stringify(prev)) {
        writeCache(key, fresh);
        onUpdate(fresh);
      }
    } catch (err) {
      console.warn(`[cache] Background fetch failed for "${key}":`, err);
    }
  };

  if (cached !== null) {
    // Return cache immediately, fetch in background
    fetchFresh(); // fire and forget
    return cached;
  } else {
    // No cache -- must wait for fresh data
    try {
      const fresh = await dedupedFetch();
      writeCache(key, fresh);
      return fresh;
    } catch {
      return null;
    }
  }
}