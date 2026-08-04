// public/sw-map-tiles.js
// Cache-first proxy for CARTO's map tile CDN only (registered from
// components/dashboard/quickGlance/ProjectsMapWidget.tsx, not app-wide --
// see that file's own comment). Every request whose host isn't the tile
// CDN passes straight through untouched, normal network as if this worker
// didn't exist -- this is the first service worker in this app, so it's
// deliberately scoped to do nothing at all outside map tiles rather than
// risk caching/intercepting anything else (auth, API calls, pages).
//
// CARTO's own tile responses already set a 180-day Cache-Control header,
// so the browser's regular HTTP cache should cover this on desktop -- this
// exists specifically because mobile Safari's HTTP cache is much smaller/
// more aggressively evicted, and Cache Storage (what this uses) survives
// that far more reliably.
const CACHE_NAME = 'map-tiles-v1';
const TILE_HOST = 'basemaps.cartocdn.com';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('map-tiles-') && k !== CACHE_NAME).map((k) => caches.delete(k))
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
      const response = await fetch(event.request);
      cache.put(event.request, response.clone());
      return response;
    })
  );
});
