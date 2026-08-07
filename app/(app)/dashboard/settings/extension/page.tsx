"use client";

// One-click "connect" bridge between this logged-in web session and the
// time-tracking browser extension (see extension/, app/api/time-tracking/*)
// -- the extension has no login screen of its own, it picks up a session
// handed to it here via chrome.runtime.sendMessage while the user is
// already signed into the web app, then keeps itself signed in
// independently afterward (its own supabase-js client, chrome.storage.local
// as the token store, autoRefreshToken -- same shape mobile/src/lib/supabase.ts
// already uses). See extension/background.ts's onMessageExternal handler
// for the receiving side.
//
// NEXT_PUBLIC_TIME_TRACKING_EXTENSION_ID must be set once the extension is
// packed with its fixed manifest `key` (see extension/README) -- an
// unpublished/unpacked dev build's id changes on every reload otherwise,
// which would make this hardcoded target unusable during development. Set
// it to that build's real id locally while testing.
import { useEffect, useState } from "react";
import { Timer, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";

const EXTENSION_ID = process.env.NEXT_PUBLIC_TIME_TRACKING_EXTENSION_ID || "";
const CHROME_WEB_STORE_URL = "https://chrome.google.com/webstore"; // replaced with the real listing URL once published

type Status = "checking" | "not_installed" | "installed" | "connecting" | "connected" | "error";

// chrome.runtime is only defined inside a Chromium browser with at least
// one extension installed that declares externally_connectable for this
// origin -- undefined in Firefox/Safari or when nothing matches, so every
// call here is guarded rather than assumed to exist.
function sendToExtension(message: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    const chromeRuntime = (window as any).chrome?.runtime;
    if (!chromeRuntime?.sendMessage || !EXTENSION_ID) {
      reject(new Error("not available"));
      return;
    }
    const timeout = setTimeout(() => reject(new Error("timeout")), 3000);
    try {
      chromeRuntime.sendMessage(EXTENSION_ID, message, (response: any) => {
        clearTimeout(timeout);
        if (chromeRuntime.lastError || !response) { reject(new Error(chromeRuntime.lastError?.message || "no response")); return; }
        resolve(response);
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err);
    }
  });
}

export default function ExtensionConnectPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    sendToExtension({ type: "ping" })
      .then(() => setStatus("installed"))
      .catch(() => setStatus("not_installed"));
  }, []);

  const handleConnect = async () => {
    setStatus("connecting");
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");
      await sendToExtension({
        type: "diract_connect",
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
      });
      setStatus("connected");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not connect");
    }
  };

  return (
    <div className="max-w-xl mx-auto p-8 space-y-6">
      <div className="flex items-center gap-3">
        <Timer size={22} className="text-indigo-600" />
        <div>
          <h1 className="text-xl font-light uppercase tracking-tight text-slate-900">Time-tracking extension</h1>
          <p className="text-[11px] text-slate-400">Passively track your active tab and turn it into draft time entries.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
        {status === "checking" && (
          <div className="flex items-center gap-2 text-slate-400 text-[12px]">
            <Loader2 size={14} className="animate-spin" /> Checking for the extension...
          </div>
        )}

        {status === "not_installed" && (
          <div className="space-y-3">
            <p className="text-[12px] text-slate-600">
              The extension isn&apos;t installed in this browser yet. Install it, then come back to this page.
            </p>
            <a
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 transition-all"
            >
              <ExternalLink size={13} /> Install from Chrome Web Store
            </a>
          </div>
        )}

        {(status === "installed" || status === "connecting" || status === "error") && (
          <div className="space-y-3">
            <p className="text-[12px] text-slate-600">
              Extension found. Click connect to sign it in with your current session -- domain and page title only are
              ever tracked, never full URLs or page content, and you can pause tracking or exclude sites any time from
              the extension&apos;s own settings.
            </p>
            <button
              onClick={handleConnect}
              disabled={status === "connecting"}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-full text-[11px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {status === "connecting" ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
              Connect extension
            </button>
            {error && <p className="text-[11px] text-red-500">{error}</p>}
          </div>
        )}

        {status === "connected" && (
          <div className="flex items-center gap-2 text-emerald-600 text-[12px] font-medium">
            <CheckCircle2 size={16} /> Connected. The extension will start tracking once you turn it on from its own popup.
          </div>
        )}
      </div>
    </div>
  );
}
