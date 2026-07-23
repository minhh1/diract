// components/VisitBeacon.tsx
// Fires a fire-and-forget page-visit ping on every route change, feeding
// the Platform Health tab's visits-per-day chart. No cookies/PII -- just a
// per-tab-session random id (sessionStorage) so "how many distinct visits"
// doesn't double-count a single page staying open, without identifying who.
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

function getSessionId(): string {
  const key = "nk_visit_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  return id;
}

export default function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
      sessionId: getSessionId(),
    });
    const blob = new Blob([payload], { type: "application/json" });
    if (!navigator.sendBeacon("/api/track/visit", blob)) {
      fetch("/api/track/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
    }
  }, [pathname]);

  return null;
}
