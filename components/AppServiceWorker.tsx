"use client";

// Registers public/sw-map-tiles.js (see that file's own header comment for
// exactly what it does and doesn't cache) -- mounted once in the app shell
// layout, not per-page, so static-asset caching helps every cold/first
// load, not just whichever page happens to use the map. Registration
// failing (unsupported browser, blocked, etc.) is silently ignored --
// everything it would have cached already has its own long-lived
// Cache-Control header, so there's no broken state either way, just a
// smaller reliability margin on mobile Safari specifically.
import { useEffect } from "react";

export default function AppServiceWorker() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-map-tiles.js').catch(() => {});
    }
  }, []);
  return null;
}
