"use client";

// A post-signup "finish setting up" checklist on Quick Glance, narrowed to
// just the two things worth surfacing here: connecting an inbox and
// reviewing the shared/central email setting. (Email verification and 2FA
// setup used to also show here -- dropped so new users see exactly the two
// email-related steps that matter for this app, not a general account
// checklist.) Every check reads real state, nothing is fabricated: a
// user_gmail_tokens/user_outlook_tokens row for inbox connection (same
// check app/(app)/dashboard/gmail/page.tsx and .../outlook/page.tsx use).
// The central-email item has no real "done" state -- it defaults to false
// and staying false is a perfectly valid permanent choice (see
// supabase/migrations/20260804070000_central_email_toggle.sql), so it's
// framed as a dismissible admin-only prompt instead of a checkbox,
// remembered per-company in localStorage since there's no backing column
// for "an admin has looked at this." Each item disappears the moment its
// real condition is met; the whole card disappears once nothing is left.
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useCompany } from "@/components/CompanyContext";
import { Inbox, ShieldCheck, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ChecklistItem {
  key: string;
  icon: LucideIcon;
  title: string;
  body: string;
  action: ReactNode;
}

export default function SetupChecklist() {
  const { companyId, isAdmin } = useCompany();
  const [ready, setReady] = useState(false);
  const [inboxConnected, setInboxConnected] = useState(true);
  const [centralEmailDismissed, setCentralEmailDismissed] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setReady(true); return; }

      const [{ data: gmail }, { data: outlook }] = await Promise.all([
        supabase.from("user_gmail_tokens").select("user_id").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_outlook_tokens").select("user_id").eq("user_id", user.id).maybeSingle(),
      ]);
      setInboxConnected(!!gmail || !!outlook);

      if (companyId && typeof window !== "undefined") {
        setCentralEmailDismissed(localStorage.getItem(`diract_central_email_reviewed_${companyId}`) === "1");
      }
      setReady(true);
    })();
  }, [companyId]);

  const dismissCentralEmail = () => {
    if (companyId && typeof window !== "undefined") localStorage.setItem(`diract_central_email_reviewed_${companyId}`, "1");
    setCentralEmailDismissed(true);
  };

  if (!ready) return null;

  const items: ChecklistItem[] = [];

  if (!inboxConnected) {
    items.push({
      key: "inbox",
      icon: Inbox,
      title: "Connect Gmail or Outlook",
      body: "Assign emails to matters and sync shared labels straight from your inbox.",
      action: (
        <div className="flex items-center gap-2 shrink-0">
          <a href="/api/gmail/auth" className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Gmail</a>
          <a href="/api/outlook/auth" className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-full text-[11px] font-bold hover:bg-slate-100 transition-all">Outlook</a>
        </div>
      ),
    });
  }

  if (isAdmin && !centralEmailDismissed) {
    items.push({
      key: "central-email",
      icon: ShieldCheck,
      title: "Review shared email settings",
      body: "Choose whether a labeled email fans out to every teammate's mailbox, or stays central in-app.",
      action: (
        <div className="flex items-center gap-2 shrink-0">
          <Link href="/dashboard/admin?tab=email" className="px-4 py-2 bg-slate-900 text-white rounded-full text-[11px] font-bold hover:bg-slate-800 transition-all">Review</Link>
          <button onClick={dismissCentralEmail} title="Dismiss" className="p-2 text-slate-300 hover:text-slate-600 transition-colors">
            <X size={14} />
          </button>
        </div>
      ),
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="mb-6 bg-white border border-slate-200 rounded-[28px] p-6">
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Finish setting up</p>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-4 px-4 py-3 bg-slate-50 rounded-2xl">
            <item.icon size={16} className="text-indigo-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-slate-700">{item.title}</p>
              <p className="text-[11px] text-slate-400 truncate">{item.body}</p>
            </div>
            {item.action}
          </div>
        ))}
      </div>
    </div>
  );
}
