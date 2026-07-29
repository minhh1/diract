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
// with router.push being stuck.
//
// Polls for success (or abandonment) instead of a single blind check at the
// end of timeoutMs -- a single check-once-at-the-end has no way to tell
// "this exact navigation is still stuck" apart from "this navigation
// actually succeeded promptly, and the user has since navigated somewhere
// ELSE entirely of their own accord." Both look identical to a check that
// only compares the current URL against `href`: neither matches. That
// false positive was confirmed live -- click a table (kicks off this
// watchdog targeting it), then click a dashboard link within the timeout
// window, and the ORIGINAL watchdog fired later, saw the dashboard's URL
// instead of its own target, wrongly concluded "still stuck," and hard-
// reloaded back to the table -- a real, reproduced redirect-back bug,
// not a hypothetical. Tracking the STARTING path and bailing out (no
// reload) the moment the current URL is neither the start nor the target
// fixes this: only a URL that's still sitting on the start path after the
// full timeout is genuinely stuck.
export function pushWithFallback(
  router: { push: (href: string) => void },
  href: string,
  timeoutMs = 4000,
): void {
  const startPath = window.location.pathname + window.location.search;
  router.push(href);
  const pollMs = 150;
  let elapsed = 0;
  const interval = setInterval(() => {
    elapsed += pollMs;
    const current = window.location.pathname + window.location.search;
    if (current === href) {
      // Reached the destination -- nothing more to watch for.
      clearInterval(interval);
      return;
    }
    if (current !== startPath) {
      // Neither the destination nor where we started -- the user (or some
      // other navigation) has since moved on to a third page entirely.
      // That's not "stuck," it's just no longer this call's concern; never
      // force them back to `href`.
      clearInterval(interval);
      return;
    }
    if (elapsed >= timeoutMs) {
      // Never left the starting URL at all despite router.push -- genuinely
      // wedged, same as before.
      clearInterval(interval);
      window.location.href = href;
    }
  }, pollMs);
}
