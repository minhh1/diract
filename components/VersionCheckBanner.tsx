// components/VersionCheckBanner.tsx
// App-wide "a new version is available, please refresh" notice -- see
// lib/buildId.ts / app/api/version/route.ts. Reads the build id this page
// was actually served with from the <meta> tag app/layout.tsx embeds at
// render time, then periodically re-checks the live endpoint; a mismatch
// means a new deployment has gone out since this tab loaded.
"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export default function VersionCheckBanner() {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const initialBuildId = document.querySelector('meta[name="app-build-id"]')?.getAttribute("content");
    if (!initialBuildId) return;

    let active = true;
    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const json = await res.json();
        if (active && json.buildId && json.buildId !== initialBuildId) setNewVersionAvailable(true);
      } catch {
        // Network hiccup -- try again next interval/focus, not worth surfacing.
      }
    };

    const interval = setInterval(check, CHECK_INTERVAL_MS);
    // Catches a tab that's been open (backgrounded/computer asleep) longer
    // than the poll interval, without waiting for the next scheduled tick.
    const onVisibilityChange = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!newVersionAvailable || dismissed) return null;

  return (
    <div className="fixed bottom-4 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 px-5 py-3 bg-slate-900 text-white rounded-full shadow-2xl">
        <p className="text-[12px] font-medium">A new version of Diract is available.</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors shrink-0"
        >
          <RefreshCw size={12} /> Refresh
        </button>
        <button onClick={() => setDismissed(true)} title="Dismiss" className="p-1 text-slate-400 hover:text-white transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
