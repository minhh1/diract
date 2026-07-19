// components/virtualcomputers/GuacamoleViewer.tsx
// Opens the Guacamole client in a real new browser tab instead of an
// embedded iframe. The previous iframe approach had a documented, real
// limitation: clicks inside a cross-origin iframe never bubble focus to
// the parent page, so every mouseenter/mousemove/mousedown had to force
// re-focus onto the iframe by hand -- a plausible source of felt input
// lag fully separate from any actual network latency. A dedicated tab has
// native focus/keyboard capture with none of that.
"use client";

import { useState, useRef } from "react";
import { Loader2, ExternalLink } from "lucide-react";

const GUACAMOLE_URL = process.env.NEXT_PUBLIC_GUACAMOLE_URL || "http://localhost:8080/guacamole";

export default function GuacamoleViewer({ vmId }: { vmId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState(false);
  const openedWindowRef = useRef<Window | null>(null);

  async function openSession() {
    setError(null);
    setOpening(true);
    // Open the tab synchronously, inside this click handler -- browsers
    // only allow window.open without a popup-blocker prompt when it's a
    // direct result of a user gesture. Navigating this already-open blank
    // tab later (once we actually have the session URL, after an async
    // fetch) doesn't need a fresh gesture.
    //
    // Deliberately no "noopener" here: per spec, window.open always
    // returns null when noopener is set, regardless of whether the popup
    // was actually allowed -- which would make every successful open look
    // identical to a blocked one. We need the live window reference anyway
    // to navigate it once the session URL resolves. This is our own
    // trusted Guacamole origin, not third-party content, so skipping
    // noopener isn't giving up any real isolation (same reasoning the
    // previous iframe implementation used for skipping its own sandbox).
    const win = window.open("", "_blank");
    if (!win) {
      setOpening(false);
      setError("Your browser blocked the popup -- allow popups for this site and try again.");
      return;
    }
    // window.screen.width/height are CSS pixels, not physical pixels -- on
    // a Retina/HiDPI display, sending those raw would tell the remote
    // desktop to render at half (or less) the display's real pixel
    // density, and the browser tab then stretches that lower-resolution
    // canvas to fill the same CSS-pixel area, which looks blurry (this
    // was a second, independent cause of blurry text alongside the RDP
    // color-depth/font-smoothing settings already fixed in lib/guacamole.ts
    // -- confirmed directly, since fixing those alone didn't resolve it).
    // Scaling both the reported screen size and dpi by devicePixelRatio
    // makes the remote desktop render at native resolution instead.
    const dpr = window.devicePixelRatio || 1;
    const res = await fetch(`/api/virtual-computers/${vmId}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Only used if the VM has no fixed resolution preset -- see
      // app/api/virtual-computers/[id]/session/route.ts.
      body: JSON.stringify({
        screenWidth: Math.round(window.screen.width * dpr),
        screenHeight: Math.round(window.screen.height * dpr),
        devicePixelRatio: dpr,
      }),
    });
    const json = await res.json();
    setOpening(false);
    if (!res.ok) {
      win.close();
      setError(json.error || "Could not start session");
      return;
    }
    // Same hashbang-mode token quirk as before: token must come after
    // `#/client/...`, not before it (confirmed against the deployed
    // Guacamole bundle, not guessed).
    win.location.href = `${GUACAMOLE_URL}/#/client/${json.clientIdentifier}?token=${json.authToken}`;
    openedWindowRef.current = win;
    setOpened(true);
  }

  function reopen() {
    if (openedWindowRef.current && !openedWindowRef.current.closed) {
      openedWindowRef.current.focus();
      return;
    }
    openSession();
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <p className="text-[13px] text-red-600 bg-red-50 rounded-2xl p-6">{error}</p>
        <button
          onClick={openSession}
          className="px-5 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
      {opened ? (
        <>
          <p className="text-[13px] text-slate-600 font-medium">Session opened in a new tab.</p>
          <button
            onClick={reopen}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink size={14} />
            Reopen
          </button>
        </>
      ) : (
        <button
          onClick={openSession}
          disabled={opening}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
        >
          {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
          {opening ? "Opening..." : "Open virtual computer"}
        </button>
      )}
    </div>
  );
}
