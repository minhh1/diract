// public/sw-map-tiles.js
// Cache-first for two, and only two, request categories -- CARTO's map tile
// CDN, and this app's own immutable Next.js static assets (_next/static/*,
// content-hashed filenames that never change meaning under a given name).
// Everything else -- API calls (this app's own /api/*, and every Supabase
// request, which goes to a different origin entirely), page navigations,
// RSC payloads -- passes straight through untouched, normal network, as if
// this worker didn't exist. That line is deliberate, not incidental: the
// app's own DYNAMIC per-company data (session/tables/dashboards/etc) is
// already cached correctly in localStorage (lib/shellCache.ts/
// lib/queryCache.ts) with careful per-mutation invalidation -- a service
// worker cache-first strategy has no way to know when that data changed, so
// caching it here would fight that logic and risk serving stale or (after a
// company switch) wrong-company data. This worker only ever touches content
// that's either immutable by construction (hashed build assets) or
// genuinely static third-party imagery (map tiles).
//
// Registered from app/(app)/layout.tsx -- the signed-in app shell, where
// AppLoader.tsx's splash lives -- not just the one page that uses the map,
// since static-asset caching helps every cold/first load, not only Quick
// Glance. Both categories already ship long Cache-Control headers (CARTO:
// 180 days; Next/Vercel: max-age=31536000, immutable) so the browser's own
// HTTP cache should already cover this on desktop -- this exists because
// mobile Safari's HTTP cache is much smaller and far more aggressively
// evicted than either of those headers alone accounts for, and Cache
// Storage (what this uses) survives that far more reliably.
const TILES_CACHE = 'map-tiles-v1';
const STATIC_CACHE = 'static-assets-v1';
const CURRENT_CACHES = [TILES_CACHE, STATIC_CACHE];
const TILE_HOST = 'basemaps.cartocdn.com';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !CURRENT_CACHES.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Shared cache-first body for both categories below -- opaque (no-cors)
// responses are cached unconditionally rather than gated on response.ok,
// which is always false for an opaque response regardless of the real HTTP
// status (true of cross-origin tile <img> requests; same-origin static
// assets get real, readable 200s, harmless to treat the same way here).
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.hostname === TILE_HOST) {
    event.respondWith(cacheFirst(event.request, TILES_CACHE));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  // Anything else (API calls, Supabase, pages, RSC) -- no respondWith,
  // browser handles it exactly as if this worker weren't installed.
});
