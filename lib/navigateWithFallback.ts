// lib/navigateWithFallback.ts
// A client-side router.push() has been observed to silently stall after a
// browser tab sits idle for a long stretch -- the in-flight transition never
// settles, the URL never actually changes, and the user is left stranded on
// whatever was showing before the click (e.g. stuck inside a record's
// dashboard with no way back to its table). Falls back to a full page load
// if the address bar hasn't reflected the destination shortly after, so a
// wedged transition can never leave a navigation control permanently dead.
export function pushWithFallback(
  router: { push: (href: string) => void },
  href: string,
  timeoutMs = 1200,
): void {
  router.push(href);
  setTimeout(() => {
    if (window.location.pathname + window.location.search !== href) {
      window.location.href = href;
    }
  }, timeoutMs);
}
