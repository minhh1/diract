// lib/publicPageCache.ts
// Stale-while-revalidate cache for genuinely-unauthenticated, PIN-gated
// public pages (client update boards, document-fill pages) -- deliberately
// NOT lib/queryCache.ts's swr(), which assumes every reader already has a
// real, server-enforced session and so is safe to trust blindly. Here the
// PIN itself IS the access control, entered once and remembered in
// localStorage by each caller's own `codeCacheKey` -- so a cached payload
// is only ever returned if it was cached under the EXACT code currently
// remembered; a different or missing code returns null, never the stale
// data. This makes a revoked/rotated PIN's old cached data unreadable the
// moment the remembered code itself changes, but callers must still
// actually revalidate that code against the server on every load
// regardless of whether this cache produced an instant paint -- and if
// that revalidation ever comes back invalid, the caller must clear its own
// painted state immediately. This module only stores/reads; it never
// decides "invalid" on its own, since only the caller knows its own API's
// shape for that.

interface CachedEntry<T> {
  code: string;
  data: T;
}

function cacheKey(key: string): string {
  return `nk_public_cache_${key}`;
}

export function readPinGatedCache<T>(key: string, currentCode: string | null | undefined): T | null {
  if (!currentCode) return null;
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) return null;
    const entry: CachedEntry<T> = JSON.parse(raw);
    if (entry.code !== currentCode) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function writePinGatedCache<T>(key: string, code: string, data: T): void {
  try {
    localStorage.setItem(cacheKey(key), JSON.stringify({ code, data }));
  } catch {
    // localStorage full or unavailable -- silently ignore
  }
}

export function clearPinGatedCache(key: string): void {
  try {
    localStorage.removeItem(cacheKey(key));
  } catch {
    // ignore
  }
}
