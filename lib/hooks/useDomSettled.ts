"use client";

// Same "DOM has stopped changing" technique as components/PerfRouteTracker.tsx,
// extracted into a hook so a specific page can use it directly instead of
// just the generic per-URL tracker (which never mounts for routes outside
// app/dashboard/layout.tsx -- see lib/perfLog.ts's 'public' PerfPageKind).
// The distinction that matters here: a data-fetch promise resolving is NOT
// the same moment as the resulting (possibly large) table/board actually
// finishing its render + paint -- measuring "ready" at the promise instead
// of at DOM-settle silently drops that render time from every timing
// number, which is exactly backwards when the render itself is the
// suspect.
import { useEffect, useState } from "react";

const SETTLE_QUIET_MS = 400;
const MAX_WAIT_MS = 15000;

// `active` should flip true the moment content that's worth measuring
// starts rendering (e.g. `!loading`) -- the hook re-arms and returns false
// again each time `active` goes back to false, so a second load cycle
// (pageId/slug change, re-open) gets its own fresh settle measurement
// instead of reporting stale-true from the first one.
export function useDomSettled(active: boolean): boolean {
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!active) {
      setSettled(false);
      return;
    }

    let done = false;
    let debounceTimer: ReturnType<typeof setTimeout>;

    const markSettled = () => {
      if (done) return;
      done = true;
      setSettled(true);
      observer.disconnect();
      clearTimeout(maxTimer);
      clearTimeout(debounceTimer);
    };

    const scheduleSettled = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(markSettled, SETTLE_QUIET_MS);
    };

    const observer = new MutationObserver(scheduleSettled);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleSettled();

    // Upper bound so continuous background DOM activity (polling, a live
    // realtime subscription re-rendering) doesn't leave "settled" unfired
    // forever.
    const maxTimer = setTimeout(markSettled, MAX_WAIT_MS);

    return () => {
      done = true;
      observer.disconnect();
      clearTimeout(debounceTimer);
      clearTimeout(maxTimer);
    };
  }, [active]);

  return settled;
}
