// components/PerfRouteTracker.tsx
// Automatic load-time tracking for every URL under the dashboard, with zero
// per-page instrumentation -- a supplement to the hand-placed
// perfLogPageStart/Ready calls in specific pages (dashboard/table/settings/
// admin/marketplace), which know their own real loading-state semantics but
// only exist where someone remembered to add them. This covers everything
// else (calendar, tasks, boards, schema, profile, outlook, record detail
// pages, ...) using a generic "DOM has stopped changing" proxy for "this
// page finished loading," keyed by the actual pathname -- see
// components/admin/AdminPerfTab.tsx's "Load times by URL" table.
"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";

// How long the DOM has to stay quiet (no new nodes) before a navigation is
// considered "settled." CSS-only animations (spinners, pulse skeletons)
// don't trigger MutationObserver, so this only resets on real content
// showing up.
const SETTLE_QUIET_MS = 400;
// Upper bound so a page with continuous background DOM activity (polling,
// live counters) doesn't leave "ready" unlogged forever.
const MAX_WAIT_MS = 15000;

export default function PerfRouteTracker() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastPath.current === pathname) return;
    lastPath.current = pathname;
    perfLogPageStart("page", pathname);

    let settled = false;
    let debounceTimer: ReturnType<typeof setTimeout>;

    const markReady = () => {
      if (settled) return;
      settled = true;
      perfLogPageReady("page", pathname);
      observer.disconnect();
      clearTimeout(maxTimer);
      clearTimeout(debounceTimer);
    };

    const scheduleReady = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(markReady, SETTLE_QUIET_MS);
    };

    const observer = new MutationObserver(scheduleReady);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleReady();

    const maxTimer = setTimeout(markReady, MAX_WAIT_MS);

    return () => {
      observer.disconnect();
      clearTimeout(debounceTimer);
      clearTimeout(maxTimer);
    };
  }, [pathname]);

  return null;
}
