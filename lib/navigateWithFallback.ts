// lib/navigateWithFallback.ts
// A client-side router.push() has been observed to silently stall after a
// browser tab sits idle for a long stretch -- the in-flight transition never
// settles, the URL never actually changes, and the user is left stranded on
// whatever was showing before the click (e.g. stuck inside a record's
// dashboard with no way back to its table). Falls back to a full page load
// if the address bar hasn't reflected the destination shortly after, so a
// wedged transition can never leave a navigation control permanently dead.
//
// timeoutMs needs real headroom, not just enough for a warm, already-
// compiled route: in `next dev` (Turbopack), the first visit to a route in
// a session can take several real seconds just to compile on demand (Fast
// Refresh rebuilds of 2000ms+ are routine, confirmed live) -- nothing to do
// with router.push being stuck. The original 1200ms was tight enough that
// this ordinary dev-mode compile lag alone could look "stuck" and trigger
// the hard-reload fallback on an otherwise completely normal navigation --
// which then fully remounts the app (including components/AppLoader.tsx),
// flashing the splash screen on every such navigation. 4000ms keeps the
// same protection against a genuinely wedged transition while giving a
// slow-but-succeeding one (dev compile, a slow connection) enough room to
// actually finish first.
export function pushWithFallback(
  router: { push: (href: string) => void },
  href: string,
  timeoutMs = 4000,
): void {
  router.push(href);
  setTimeout(() => {
    if (window.location.pathname + window.location.search !== href) {
      window.location.href = href;
    }
  }, timeoutMs);
}
