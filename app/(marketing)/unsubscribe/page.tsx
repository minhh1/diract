// app/(marketing)/unsubscribe/page.tsx
// Public, no login required. A campaign email's footer link lands here
// with company/email/sig in the query string (see
// app/api/email-campaigns/[id]/send/route.ts's buildHtml) -- this page
// shows a confirmation button rather than unsubscribing on the bare GET,
// since email clients (Outlook Safe Links, image-proxy prefetchers) can
// silently fetch a link's URL before a person ever sees it.
"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, MailX } from "lucide-react";

function UnsubscribePageInner() {
  const searchParams = useSearchParams();
  const company = searchParams.get("company") || "";
  const email = searchParams.get("email") || "";
  const sig = searchParams.get("sig") || "";
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const missing = !company || !email || !sig;

  const unsubscribe = async () => {
    setState("loading");
    setError(null);
    const res = await fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, email, sig }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error || "Something went wrong");
      setState("error");
      return;
    }
    setState("done");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        {state === "done" ? (
          <>
            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <Check size={20} className="text-emerald-600" />
            </div>
            <h1 className="text-[15px] font-bold text-slate-800">You're unsubscribed</h1>
            <p className="text-[12px] text-slate-400 mt-2">{email} won&apos;t receive marketing emails from this company again.</p>
          </>
        ) : missing ? (
          <>
            <MailX size={22} className="mx-auto text-slate-300 mb-3" />
            <p className="text-[13px] text-slate-500">This unsubscribe link looks incomplete. Please use the link from the email directly.</p>
          </>
        ) : (
          <>
            <MailX size={22} className="mx-auto text-slate-300 mb-3" />
            <h1 className="text-[15px] font-bold text-slate-800">Unsubscribe {email}?</h1>
            <p className="text-[12px] text-slate-400 mt-2 mb-5">You won&apos;t receive marketing emails from this company anymore.</p>
            <button
              onClick={unsubscribe}
              disabled={state === "loading"}
              className="px-5 py-2.5 bg-slate-900 text-white text-[12px] font-bold rounded-full hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {state === "loading" ? "Unsubscribing..." : "Unsubscribe"}
            </button>
            {error && <p className="text-[11px] text-red-500 mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={null}>
      <UnsubscribePageInner />
    </Suspense>
  );
}
