// public/sw-map-tiles.js
// Cache-first proxy for CARTO's map tile CDN only. Every request whose host
// isn't the tile CDN passes straight through untouched, normal network as
// if this worker didn't exist -- this is the first service worker in this
// app, so it's deliberately scoped to do nothing at all outside map tiles
// rather than risk caching/intercepting anything else (auth, API calls,
// pages, or this app's own build assets).
//
// A short-lived version of this file also cache-first'd _next/static/*
// (this app's own hashed JS/CSS chunks) -- reverted: it cached the fetch
// response unconditionally, including a non-200 (a chunk request that
// 404s, e.g. a stale reference from a tab open across a deploy rotating
// old hashed filenames out), which then permanently served that cached 404
// for that exact asset path forever after -- for a core chunk, that's
// indistinguishable from the whole site being down. _next/static/* already
// ships `Cache-Control: public, max-age=31536000, immutable` from
// Vercel, which is the correct place for that caching to live; this file
// no longer duplicates it.
//
// CARTO's own tile responses already set a 180-day Cache-Control header,
// so the browser's regular HTTP cache should cover this on desktop -- this
// exists specifically because mobile Safari's HTTP cache is much smaller/
// more aggressively evicted, and Cache Storage (what this uses) survives
// that far more reliably.
const CACHE_NAME = 'map-tiles-v2';
const TILE_HOST = 'basemaps.cartocdn.com';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      // Deletes every cache from the reverted static-asset-caching version
      // too (static-assets-*), not just old map-tiles-* generations -- any
      // poisoned cached-404 entry needs to be gone, not just unused going
      // forward.
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname !== TILE_HOST) return; // not a tile request -- let the browser handle it normally

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      // Tile <img> requests are no-cors, so the response here is opaque
      // (status 0, unreadable, but still cacheable/servable) -- caching it
      // unconditionally rather than gating on response.ok, which is always
      // false for an opaque response regardless of the real HTTP status.
      // Safe here specifically because it's the ONLY thing this worker
      // touches and a bad tile just means one blank map tile, never a
      // broken page.
      const response = await fetch(event.request);
      cache.put(event.request, response.clone());
      return response;
    })
  );
});
