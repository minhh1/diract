"use client";

// Registers public/sw-map-tiles.js (see that file's own header comment for
// exactly what it does and doesn't cache) -- mounted once in the app shell
// layout, not per-page, so it's active for every page, not just whichever
// one uses the map. Registration failing (unsupported browser, blocked,
// etc.) is silently ignored -- everything it touches already has its own
// long-lived Cache-Control header, so there's no broken state either way,
// just a smaller reliability margin on mobile Safari specifically.
import { useEffect } from "react";

export default function AppServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw-map-tiles.js').catch(() => {});

    // A NEWER worker taking over an already-open tab means whatever's
    // currently loaded may have been served by the OLD one -- reload once
    // so nothing stays stuck on it. This is what makes a fix to this file
    // (like the one that just shipped, reverting a version that briefly
    // cached bad responses) self-heal an already-open tab automatically,
    // instead of needing everyone to manually clear site data. Guarded to
    // fire at most once -- controllerchange can in principle fire more than
    // once in a session.
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);
  return null;
}
