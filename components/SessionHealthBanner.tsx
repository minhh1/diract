// components/SessionHealthBanner.tsx
// "Left the site open for 15-20 minutes, came back, and it's not functional
// at all" -- purely additive diagnostic + recovery layer, deliberately not
// a change to any existing auth flow (too risky to guess-fix blind: an
// over-aggressive forced-logout would be worse than the bug it's meant to
// catch). Two things this app previously had NONE of anywhere:
//
// 1. Any supabase.auth.onAuthStateChange() listener at all -- so if the
//    SDK's own background token-refresh silently failed (or the refresh
//    token itself expired), nothing in the app would ever know; every
//    subsequent request just starts 401ing with zero explanation, which
//    is exactly what "not functional at all, no error, nothing" looks like
//    from the outside.
//
// 2. Any check that runs specifically on RESUMING an idle tab. Supabase-js
//    does register its own visibilitychange-driven refresh internally, but
//    that's the SDK quietly doing its own thing -- there was nothing that
//    actively VERIFIES the session is still good the moment focus returns
//    and surfaces it if not. Browsers aggressively throttle timers in
//    backgrounded tabs (this is exactly the kind of gap that produces "15
//    minutes idle -> broken" specifically, rather than "broken while
//    actively using it").
//
// This is deliberately a DIAGNOSTIC tool as much as a fix: the banner text
// says what was actually detected, so the next time this happens, that's
// enough to tell whether the culprit really is an expired/lost session or
// something else entirely (in which case this banner simply won't appear,
// which is itself a useful, ruled-out data point).
"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isPublicPath } from "@/components/AppLoader";

// How often to proactively re-check while the tab is visible and active --
// separate from (and shorter than) VersionCheckBanner's own 10-minute poll,
// since 15-20 minutes idle is the exact window being investigated.
const ACTIVE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Confirmed live (2026-08-05): idle tab on iOS gets suspended mid-refresh,
// so the refresh token the SDK has stored is already rotated-out by the
// time the tab resumes. getSession() then fails with exactly this class of
// message -- unlike a plain "expired" token, reloading the page can't fix
// it (the stored token itself is dead), so the only real recovery is a
// clean sign-out + fresh login rather than leaving the user on a page that
// will just keep 401ing silently.
function isDeadRefreshTokenError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("refresh token") && (m.includes("invalid") || m.includes("not found"));
}

// signOut() below itself fires a SIGNED_OUT event, which would otherwise
// re-enter this same function -- guard so only the first caller actually
// signs out/redirects (harmless race either way, but avoids duplicate
// signOut() calls stacking up before the navigation actually happens).
let reauthing = false;

// supabase.auth.signOut() fires the exact same SIGNED_OUT event whether the
// SDK just detected a dead refresh token or the user deliberately clicked
// "Sign out" -- the two cases were indistinguishable from inside this
// component's onAuthStateChange listener, so a deliberate sign-out was
// getting caught by the SIGNED_OUT handler below and treated as an
// unexpected expiry: the red "session expired" banner would flash, and it
// would redirect to /login?reason=session_expired, showing "Your session
// expired, please sign in again" even though nothing actually expired.
// Callers that are about to sign the user out on purpose (Sidebar.tsx's
// "Sign out" button) should call this first so the listener knows to stand
// down for that one event.
let intentionalSignOut = false;
export function markIntentionalSignOut() {
  intentionalSignOut = true;
}

// Same cookie AppLoader.tsx consumes for its own splash screen (see
// app/auth/callback/route.ts, which sets it right before the redirect that
// hands off a brand-new session -- e.g. a signup's email-confirmation
// link). Confirmed live (2026-08-06): a first-time signup's confirmation
// redirect landed on a real, valid session, but this component's
// onAuthStateChange listener fired a SIGNED_OUT event within that very
// first moment anyway -- the browser client's own initial session
// hydration can look momentarily like a sign-out immediately after a
// fresh cookie-based session is set -- and bounced the user straight back
// to /login with "Your session expired", which is exactly backwards: this
// was their first successful sign-in, nothing had expired. A short grace
// window after a genuine fresh sign-in treats a SIGNED_OUT event as part
// of that initial hydration, not a real logout.
const JUST_LOGGED_IN_COOKIE = "nk_just_logged_in";
const JUST_LOGGED_IN_GRACE_MS = 8000;

function hasJustLoggedInCookie(): boolean {
  return document.cookie.split("; ").some(c => c === `${JUST_LOGGED_IN_COOKIE}=1`);
}

async function forceReauth(pathname: string) {
  if (reauthing) return;
  reauthing = true;
  await supabase.auth.signOut().catch(() => {});
  const redirect = encodeURIComponent(pathname || "/dashboard/quick-glance");
  window.location.href = `/login?reason=session_expired&redirect=${redirect}`;
}

// Everything above this line only catches a dead session at the SDK/token
// level (getSession() polling, SIGNED_OUT events) -- neither one fires the
// moment an ordinary in-app API call gets rejected mid-use. That's exactly
// the "left it open, came back, clicked something, nothing happens" case:
// the request 401s, the calling component's own try/catch (if it has one)
// just swallows or logs it, and the user is left staring at a page that
// looks alive but responds to nothing, with zero indication why. Patching
// fetch once, globally, catches that 401 regardless of which of the app's
// many unwrapped call sites made the request, without having to touch each
// one individually.
//
// Only reacts to same-origin /api/* calls, and only while the CURRENT page
// is an authenticated one -- several /public/* API routes (see
// app/api/public-tasks/.../route.ts, app/api/client-update-pages/public/
// [slug]/route.ts) legitimately return 401 for "wrong password on this
// share link", which has nothing to do with this app's own session and
// must not trigger a forced sign-out of a user who was never signed in.
let fetchPatched = false;
function installFetchInterceptor(
  isCurrentPathPublic: () => boolean,
  justLoggedInUntilRef: { current: number },
  onExpired: (message: string) => void
) {
  if (fetchPatched || typeof window === "undefined") return;
  fetchPatched = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await originalFetch(...args);
    if (response.status === 401 && !isCurrentPathPublic() && Date.now() >= justLoggedInUntilRef.current) {
      const input = args[0];
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (url.startsWith("/api/") || url.includes(`${window.location.origin}/api/`)) {
        onExpired("Your session expired -- signing you out...");
        forceReauth(window.location.pathname);
      }
    }
    return response;
  };
}

export default function SessionHealthBanner() {
  const pathname = usePathname();
  const [problem, setProblem] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  // Lazy initializer -- runs synchronously during this component's own
  // first render, before any effect (including AppLoader's, which consumes/
  // clears this same cookie) gets a chance to run, so this reliably
  // captures the flag regardless of mount-order timing between the two.
  const [justLoggedInUntil] = useState(() => (typeof document !== "undefined" && hasJustLoggedInCookie()) ? Date.now() + JUST_LOGGED_IN_GRACE_MS : 0);

  // Read by the fetch interceptor below, which is installed once and stays
  // installed across every navigation -- it needs the CURRENT path/grace-
  // window value at the moment each response comes back, not whatever
  // pathname was in scope when it was installed.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const justLoggedInUntilRef = useRef(justLoggedInUntil);
  justLoggedInUntilRef.current = justLoggedInUntil;

  useEffect(() => {
    installFetchInterceptor(() => isPublicPath(pathnameRef.current), justLoggedInUntilRef, setProblem);
  }, []);

  useEffect(() => {
    // A genuinely anonymous /public/* (or /login) visitor never had a
    // session at all -- "no active session" there is completely normal,
    // not a bug to flag.
    if (isPublicPath(pathname)) return;

    let active = true;
    let hiddenAt: number | null = null;

    const checkSession = async (context: string) => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          if (isDeadRefreshTokenError(error.message)) {
            if (Date.now() < justLoggedInUntil) return;
            setProblem(`Your session expired (${context}) -- signing you out...`);
            forceReauth(window.location.pathname);
            return;
          }
          setProblem(`Session check failed (${context}): ${error.message}`);
          return;
        }
        if (!session) { setProblem(`No active session detected (${context}) -- you may have been signed out.`); return; }
        if (session.expires_at && session.expires_at * 1000 < Date.now()) {
          setProblem(`Session token expired (${context}) and didn't refresh in time.`);
          return;
        }
        // Genuinely healthy -- clear any earlier flag rather than leaving a
        // stale warning up once things recover on their own.
        setProblem(null);
      } catch (e: any) {
        if (active) setProblem(`Session check threw (${context}): ${e?.message || "unknown error"}`);
      }
    };

    // Fires on every SDK-internal auth event -- in particular, a failed
    // background token refresh surfaces here even though nothing else in
    // the app was listening for it before this component existed.
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      // supabase-js signs the client out itself when a background refresh
      // finds its stored refresh token already dead (the same case
      // checkSession catches above) -- same recovery applies: this isn't a
      // deliberate logout, so send them to a fresh login rather than
      // leaving them stranded on a page that will just keep 401ing.
      if (event === "SIGNED_OUT") {
        if (intentionalSignOut) return;
        if (Date.now() < justLoggedInUntil) return;
        setProblem("Your session expired -- signing you out...");
        forceReauth(window.location.pathname);
      }
      if (event === "TOKEN_REFRESHED") setProblem(null);
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      // Only worth checking on RESUMING after being away a meaningful
      // while -- a routine alt-tab-and-back isn't the scenario reported.
      if (hiddenAt !== null && Date.now() - hiddenAt > 2 * 60 * 1000) {
        checkSession("resumed after being idle");
      }
      hiddenAt = null;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const interval = setInterval(() => checkSession("periodic check"), ACTIVE_CHECK_INTERVAL_MS);

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, [pathname, justLoggedInUntil]);

  if (!problem || dismissed) return null;

  return (
    <div className="fixed bottom-20 inset-x-0 z-[200] flex justify-center px-4 pointer-events-none">
      <div className="pointer-events-auto flex items-center gap-3 px-5 py-3 bg-red-600 text-white rounded-full shadow-2xl max-w-lg">
        <AlertTriangle size={16} className="shrink-0" />
        <p className="text-[12px] font-medium">{problem}</p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 text-[11px] font-bold rounded-full hover:bg-red-50 transition-colors shrink-0"
        >
          <RefreshCw size={12} /> Refresh
        </button>
        <button onClick={() => setDismissed(true)} title="Dismiss" className="p-1 text-red-200 hover:text-white transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
