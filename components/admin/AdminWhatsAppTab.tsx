// components/admin/AdminWhatsAppTab.tsx
// Admin-only: connect the company's WhatsApp Business Platform (Meta Cloud
// API) number. There is no per-user OAuth here -- one System User token per
// company, entered directly (see company_whatsapp_credentials.sql). Only
// business-number messages are ever visible this way, never a user's
// personal WhatsApp history.
"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, Trash2, Copy, Check, HelpCircle } from "lucide-react";
import { APP_URL } from "@/lib/config";
import CredentialsHelpDrawer from "./CredentialsHelpDrawer";
import { useProgressBarWhile } from "@/components/TopProgressBar";

// Meta periodically restructures this console (e.g. the old "Add Product ->
// WhatsApp" flow was replaced by a use-case-based flow), so these steps can
// go stale. Last verified against developers.facebook.com/docs/whatsapp/
// cloud-api/get-started on 2026-07-21 -- if a step no longer matches what
// Meta shows, re-check that URL and update this array rather than guessing.
const WHATSAPP_HELP_STEPS = [
  {
    title: "Add the WhatsApp use case to your app",
    description:
      "Open your app in the Meta App Dashboard and click \"Use cases\" in the left sidebar (existing apps created for something else, like Facebook Login, don't have WhatsApp attached automatically). Add \"Connect with customers through WhatsApp\" as a use case, then complete the prompted steps -- choosing or creating a Business Portfolio and confirming publishing requirements. A new \"WhatsApp\" item then appears in the left sidebar.",
    linkLabel: "developers.facebook.com/apps",
    linkUrl: "https://developers.facebook.com/apps",
  },
  {
    title: "Find the phone number ID and business account ID",
    description:
      "Open your app → WhatsApp → API Setup. Once a WhatsApp Business Account is connected, this page shows the WhatsApp Business Account ID and, directly beneath the \"From\" phone number, the Phone number ID.",
  },
  {
    title: "Generate a System User access token",
    description:
      "In Business Settings → System users, add a system user, assign it your app and WhatsApp account with \"Full control\", then generate a token granting business_management, whatsapp_business_messaging, and whatsapp_business_management. Copy it immediately -- Meta only shows it once. Use this System User token, not the short-lived temporary token shown on the API Setup page -- Meta's own docs note that one isn't meant for production use.",
    linkLabel: "business.facebook.com/latest/settings",
    linkUrl: "https://business.facebook.com/latest/settings",
  },
  {
    title: "Make up a webhook verify token",
    description:
      "This one isn't from Meta — pick any random string yourself, paste it into the field below, and paste the same value into your Meta App → WhatsApp → Configuration → Webhooks \"Verify token\" field alongside the webhook URL shown here.",
  },
];

interface Props {
  companyId: string;
}

interface Connection {
  id: string;
  created_at: string;
  updated_at: string;
  phone_number_id: string;
}

export default function AdminWhatsAppTab({ companyId }: Props) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useProgressBarWhile(loading);

  const webhookUrl = `${APP_URL}/api/whatsapp/webhook/${companyId}`;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/whatsapp/credentials");
    const json = await res.json();
    setConnection(json.connection ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async () => {
    setError(null);
    if (!accessToken.trim() || !phoneNumberId.trim() || !businessAccountId.trim() || !webhookVerifyToken.trim()) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/whatsapp/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken.trim(),
        phone_number_id: phoneNumberId.trim(),
        business_account_id: businessAccountId.trim(),
        webhook_verify_token: webhookVerifyToken.trim(),
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Failed to save");
      return;
    }
    setAccessToken("");
    setPhoneNumberId("");
    setBusinessAccountId("");
    setWebhookVerifyToken("");
    setShowForm(false);
    load();
  };

  const disconnect = async () => {
    if (!confirm("Disconnect WhatsApp? Messages already synced will be kept.")) return;
    await fetch("/api/whatsapp/credentials", { method: "DELETE" });
    load();
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">WhatsApp Business Platform</p>
          {!connection && (
            <button onClick={() => setShowForm((v) => !v)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
              <MessageCircle size={14} />
            </button>
          )}
        </div>

        {connection && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl mb-2">
            <MessageCircle size={13} className="text-emerald-500 shrink-0" />
            <p className="text-[12px] font-medium text-slate-700 flex-1">
              Connected — phone number ID {connection.phone_number_id}
            </p>
            <button onClick={disconnect} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
              <Trash2 size={12} />
            </button>
          </div>
        )}

        {!connection && !showForm && (
          <p className="text-[12px] text-slate-400">
            Not connected. Requires a Meta Business Platform app with a WhatsApp Business phone number
            and a System User access token — only messages sent to/from that business number are visible here,
            not anyone&apos;s personal WhatsApp history.
          </p>
        )}

        {(showForm || connection) && (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="px-4 py-3 bg-slate-50 rounded-2xl">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                Webhook URL — paste into Meta App → WhatsApp → Configuration
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-[11px] text-slate-600 truncate">{webhookUrl}</code>
                <button onClick={copyWebhookUrl} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            </div>

            {!connection && (
              <>
                <button
                  type="button"
                  onClick={() => setHelpOpen(true)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:underline"
                >
                  <HelpCircle size={12} /> Where do I find these?
                </button>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="System User access token"
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                />
                <input
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  placeholder="Phone number ID"
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                />
                <input
                  value={businessAccountId}
                  onChange={(e) => setBusinessAccountId(e.target.value)}
                  placeholder="Business account ID"
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                />
                <input
                  value={webhookVerifyToken}
                  onChange={(e) => setWebhookVerifyToken(e.target.value)}
                  placeholder="Webhook verify token (make one up, paste it in Meta's config too)"
                  className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
                />
                {error && <p className="text-[11px] text-red-500">{error}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={connect}
                    disabled={saving}
                    className="px-5 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    {saving ? "Saving..." : "Connect"}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 text-[12px] text-slate-400 hover:text-slate-700">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <CredentialsHelpDrawer
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Finding your WhatsApp credentials"
        intro="All four values below come from Meta's Business Platform tools, except the verify token, which you make up yourself."
        steps={WHATSAPP_HELP_STEPS}
      />
    </div>
  );
}
