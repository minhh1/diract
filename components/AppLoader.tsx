// components/AppLoader.tsx
"use client";

import { useState, useEffect, type ReactNode } from "react";
import { readShellCache } from "@/lib/shellCache";
import { COMPANY_CACHE_KEY } from "@/components/CompanyContext";
import { resolveCompanyBootstrap, BOOTSTRAP_STEPS, type BootstrapStep } from "@/lib/companyBootstrap";
import { APP_CACHE_VERSION } from "@/lib/appCacheVersion";

// Routes that need none of what this warms -- never gated, not even for a
// moment.
const PUBLIC_PATH_PREFIXES = ["/login", "/public", "/auth"];

// Upper bound so a dead/slow network never traps someone on the splash --
// falls through to the app, which still has its normal per-page loading
// states as a fallback (never worse than not having this screen at all).
const CEILING_MS = 6000;

export default function AppLoader({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Clear stale localStorage cache BEFORE anything reads it. One shared
    // version constant (lib/appCacheVersion.ts) -- also used as the
    // persisted React Query cache's `buster` -- so there's a single place
    // to bump when any cached shape changes, not two independently
    // hand-maintained version strings that can drift out of sync.
    const stored = localStorage.getItem("nk_app_cache_version");
    if (stored !== APP_CACHE_VERSION) {
      const toRemove = Object.keys(localStorage).filter(k =>
        k.startsWith("nk_cache_") ||
        k.startsWith("nk_pref_") ||
        k.startsWith("nk_rows_") ||
        k.startsWith("rows_")
      );
      toRemove.forEach(k => localStorage.removeItem(k));
      localStorage.setItem("nk_app_cache_version", APP_CACHE_VERSION);
    }

    const pathname = window.location.pathname;
    if (PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p))) {
      setReady(true);
      return;
    }

    let cancelled = false;
    const stepsSeen = new Set<BootstrapStep>();
    const onStep = (step: BootstrapStep) => {
      stepsSeen.add(step);
      if (cancelled) return;
      setProgress(Math.round((stepsSeen.size / BOOTSTRAP_STEPS.length) * 100));
    };

    // Always call this -- it's the same deduped function CompanyContext
    // itself calls, so this never causes an extra network round trip
    // regardless of which of the two mounts first (see
    // lib/companyBootstrap.ts). Subscribing here is what makes `onStep`
    // above actually fire for THIS component's progress bar.
    const bootstrapPromise = resolveCompanyBootstrap({ onStep });

    const finish = () => {
      if (cancelled) return;
      setProgress(100);
      setFadeOut(true);
      // Purely a cosmetic transition on top of already-ready content, not a
      // data wait -- matches the fade this screen always had, just no
      // longer gating real readiness on an arbitrary timer.
      setTimeout(() => { if (!cancelled) setReady(true); }, 250);
    };

    // Warm return visit (shellCache already has a cached identity from a
    // previous session): CompanyContext will paint from that cache
    // synchronously on its own first render, so there's nothing left for
    // this screen to usefully wait on -- don't gate on the network at all.
    if (readShellCache(COMPANY_CACHE_KEY)) {
      finish();
    } else {
      const ceiling = new Promise<void>(resolve => setTimeout(resolve, CEILING_MS));
      Promise.race([bootstrapPromise.then(() => {}), ceiling]).then(finish);
    }

    return () => { cancelled = true; };
  }, []);

  return (
    <>
      {children}
      {!ready && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "#050a30",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            opacity: fadeOut ? 0 : 1,
            transition: "opacity 0.25s ease-out",
            pointerEvents: fadeOut ? "none" : "auto",
          }}
        >
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: "#fff", display: "flex",
            alignItems: "center", justifyContent: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            marginBottom: 20,
          }}>
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="10" fill="#050a30"/>
              <path d="M14 8v6l4 2" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 style={{
            fontFamily: "system-ui, sans-serif", fontWeight: 900,
            fontStyle: "italic", fontSize: 24, letterSpacing: "-0.04em",
            color: "#fff", marginBottom: 24,
          }}>
            Diract
          </h1>
          <div style={{ width: 140, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
            <div style={{
              width: `${progress}%`, height: "100%", background: "#6366f1",
              borderRadius: 2, transition: "width 0.2s ease-out",
            }} />
          </div>
        </div>
      )}
    </>
  );
}
