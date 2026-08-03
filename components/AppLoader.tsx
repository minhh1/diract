// components/AppLoader.tsx
"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { readShellCache } from "@/lib/shellCache";
import { COMPANY_CACHE_KEY } from "@/components/CompanyContext";
import { resolveCompanyBootstrap, BOOTSTRAP_STEPS, type BootstrapStep } from "@/lib/companyBootstrap";
import { APP_CACHE_VERSION } from "@/lib/appCacheVersion";

// Routes that need none of what this warms -- never gated, not even for a
// moment.
const PUBLIC_PATH_PREFIXES = ["/login", "/public", "/auth"];
// Standalone marketing/legal pages -- exact match, not prefixes ("/" as a
// prefix would match every route in the app). None of these read any
// company data, so they used to get pulled behind the full bootstrap gate
// like a real dashboard page just because they didn't happen to start with
// one of the prefixes above.
const PUBLIC_EXACT_PATHS = ["/", "/privacy", "/terms"];

// Exported for SessionHealthBanner.tsx -- a genuinely anonymous /public/*
// visitor never had a session to begin with, so it shouldn't run its
// "you may have been signed out" check there at all. Single source of
// truth for "which paths need none of what a signed-in session implies",
// rather than a second hand-maintained copy of this same prefix list.
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT_PATHS.includes(pathname) || PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p));
}

// Set (as a short-lived cookie, not sessionStorage, since the Google OAuth
// callback that also needs to set it is a server route handler, not client
// JS -- see app/auth/callback/route.ts) by every real sign-in path right
// before it hands off to a protected route. A session that's merely still
// valid from a PREVIOUS visit (the common case this screen's warm-return-
// visit shortcut below exists for) has no reason to distrust its own
// COMPANY_CACHE_KEY cache -- but a just-completed sign-in is exactly the
// moment identity could have changed (different account, different
// browser profile that happens to share this origin's localStorage from a
// stale prior session), and is also the one moment a user most expects to
// SEE confirmation that something is happening. Consumed (cleared) the
// instant it's read, so it only ever forces the real wait once per login.
const JUST_LOGGED_IN_COOKIE = "nk_just_logged_in";

function consumeJustLoggedIn(): boolean {
  const has = document.cookie.split("; ").some(c => c === `${JUST_LOGGED_IN_COOKIE}=1`);
  if (has) document.cookie = `${JUST_LOGGED_IN_COOKIE}=; path=/; max-age=0`;
  return has;
}

// Upper bound so a dead/slow network never traps someone on the splash --
// falls through to the app, which still has its normal per-page loading
// states as a fallback (never worse than not having this screen at all).
const CEILING_MS = 6000;

export default function AppLoader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [progress, setProgress] = useState(0);
  // Once the real bootstrap gate has resolved for this session, it must
  // never re-arm -- without this, a pathname change after the splash has
  // already dismissed would flip `ready` back to false and flash the
  // splash a second time.
  const doneRef = useRef(false);

  useEffect(() => {
    // Clear stale localStorage cache BEFORE anything reads it -- two
    // independent triggers feed the same wipe:
    //
    // 1. APP_CACHE_VERSION (lib/appCacheVersion.ts) -- a deliberately
    //    hand-bumped signal for "this cached SHAPE is now unsafe to read"
    //    (renamed/restructured fields etc). Kept manual since most deploys
    //    don't touch what's cached at all.
    //
    // 2. The deployed build id, read from app/layout.tsx's own server-
    //    rendered <meta name="app-build-id"> tag -- the same source
    //    VersionCheckBanner.tsx already reads. Deliberately NOT
    //    lib/buildId.ts's BUILD_ID export imported directly: that reads a
    //    bare (non-NEXT_PUBLIC_) env var, which Next.js only inlines into
    //    SERVER code -- importing it here, in a "use client" file, would
    //    always resolve to the "local-dev" fallback in the browser
    //    regardless of which deployment is actually running, silently
    //    never changing and defeating the whole point. This trigger is
    //    fully automatic (every real deployment gets a new git commit sha,
    //    nothing to remember to bump) -- fixes what used to require an
    //    incognito window just to see a just-shipped change: a normal
    //    reload ran the new code fine, but that code immediately re-painted
    //    from the SAME stale cached data as before, since only #1 above
    //    ever cleared anything and it wasn't kept in sync with what was
    //    actually shipping (confirmed: git log shows APP_CACHE_VERSION had
    //    been bumped exactly once, ever, despite dozens of cache-relevant
    //    changes landing since).
    //
    // Runs once per real page load, not per client-side navigation.
    const storedVersion = localStorage.getItem("nk_app_cache_version");
    const storedBuildId = localStorage.getItem("nk_app_build_id");
    const currentBuildId = document.querySelector('meta[name="app-build-id"]')?.getAttribute("content") ?? null;
    const versionChanged = storedVersion !== APP_CACHE_VERSION;
    const buildChanged = !!currentBuildId && storedBuildId !== null && storedBuildId !== currentBuildId;
    if (versionChanged || buildChanged) {
      const toRemove = Object.keys(localStorage).filter(k =>
        k.startsWith("nk_cache_") ||
        k.startsWith("nk_pref_") ||
        k.startsWith("nk_rows_") ||
        k.startsWith("rows_") ||
        // Dashboard/table schema+config shells (lib/shellCache.ts) --
        // previously missing from this list entirely, so a stale field
        // list/column config could survive a schema-changing deploy
        // indefinitely even with #1 above correctly bumped.
        k.startsWith("nk_shell:")
      );
      toRemove.forEach(k => localStorage.removeItem(k));
      localStorage.setItem("nk_app_cache_version", APP_CACHE_VERSION);
    }
    if (currentBuildId) localStorage.setItem("nk_app_build_id", currentBuildId);
  }, []);

  useEffect(() => {
    // Real login always lands here via router.replace() from /login, a
    // client-side navigation -- not a full page load. AppLoader lives in
    // the root layout above every page, so it mounts exactly once per tab;
    // without depending on `pathname` here, this effect would only ever see
    // the FIRST url (typically /login), permanently set `ready` from that
    // public-path branch below, and never re-check once the user actually
    // lands on a protected route. That silently skipped the splash (and the
    // bootstrap-gating it exists for) on the one journey every real user
    // takes.
    if (doneRef.current) return;

    if (isPublicPath(pathname)) {
      setReady(true);
      // /public/* pages are still genuinely visited by SIGNED-IN staff
      // (previewing/managing their own company's client-update or task
      // page, often via a bookmark or shared link, never touching
      // /dashboard/* in this tab at all) -- fire the same bootstrap
      // warming those routes get, just in the background, with nothing
      // gated on it. resolveCompanyBootstrap() resolves to null and no-ops
      // for a genuinely anonymous PIN visitor (no session), so this is
      // silent and free for them. Without this, that whole class of visit
      // never warmed anything -- every one of this session's public-page
      // caching fixes (staff board data, gmail connections, task
      // dependencies, etc.) silently never fired.
      if (pathname.startsWith("/public/")) resolveCompanyBootstrap().catch(() => {});
      return;
    }

    // Coming from the public-path branch above, `ready` may already be
    // true -- re-arm it so the overlay (gated on `!ready`) actually shows
    // again while this protected route's real bootstrap wait runs.
    setReady(false);
    setFadeOut(false);
    setProgress(0);

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
      doneRef.current = true;
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
    // Skipped right after a real sign-in (see consumeJustLoggedIn's own
    // comment) even if a stale cache from before is sitting there -- that's
    // exactly the moment identity could have changed, and the one moment a
    // user most expects to see this screen at all.
    if (readShellCache(COMPANY_CACHE_KEY) && !consumeJustLoggedIn()) {
      finish();
    } else {
      const ceiling = new Promise<void>(resolve => setTimeout(resolve, CEILING_MS));
      Promise.race([bootstrapPromise.then(() => {}), ceiling]).then(finish);
    }

    return () => { cancelled = true; };
  }, [pathname]);

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
