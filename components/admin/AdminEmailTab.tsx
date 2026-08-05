// Admin-only: custom sending domain (branded task/archive-request emails,
// and -- once the Supabase Auth "Send Email" hook is enabled project-wide,
// see supabase/functions/auth-send-email -- login/signup/password-reset
// mail too) plus per-event notification on/off toggles. Domain add/verify/
// disconnect goes through app/api/company/email-domain (needs the
// platform's RESEND_API_KEY); the toggles write directly to
// companies.email_notification_settings, same direct-client-write
// convention as CustomTableBuilder.tsx's disabled_system_tables/
// table_label_overrides (RLS, not app logic, gates that write to admins).
"use client";

import { useCallback, useEffect, useState } from "react";
import { Mail, Trash2, Loader2, RefreshCw, Copy, Check, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NOTIFICATION_EVENT_TYPES } from "@/lib/notifications/eventTypes";

interface Props {
  companyId: string;
}

interface DnsRecord {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

interface DomainRow {
  id: string;
  domain: string;
  status: "pending" | "verified" | "failed";
  dns_records: DnsRecord[];
  from_name: string;
  from_local_part: string;
  created_at: string;
}

const STATUS_STYLES: Record<DomainRow["status"], { label: string; icon: typeof CheckCircle2; className: string }> = {
  verified: { label: "Verified", icon: CheckCircle2, className: "bg-emerald-50 text-emerald-700" },
  pending: { label: "Pending DNS", icon: Clock, className: "bg-amber-50 text-amber-700" },
  failed: { label: "Failed", icon: AlertCircle, className: "bg-red-50 text-red-600" },
};

export default function AdminEmailTab({ companyId }: Props) {
  const [domain, setDomain] = useState<DomainRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [fromNameInput, setFromNameInput] = useState("Notifications");
  const [fromLocalPartInput, setFromLocalPartInput] = useState("notifications");
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [settingsLoading, setSettingsLoading] = useState(true);

  const [centralEmailEnabled, setCentralEmailEnabled] = useState(false);
  const [centralEmailLoading, setCentralEmailLoading] = useState(true);
  const [centralEmailSaving, setCentralEmailSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/company/email-domain");
    const json = await res.json();
    setDomain(json.domain ?? null);
    setLoading(false);
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    const { data } = await supabase.from("companies").select("email_notification_settings").eq("id", companyId).single();
    setSettings(data?.email_notification_settings ?? {});
    setSettingsLoading(false);
  }, [companyId]);

  const loadCentralEmail = useCallback(async () => {
    setCentralEmailLoading(true);
    const { data } = await supabase.from("companies").select("central_email_enabled").eq("id", companyId).single();
    setCentralEmailEnabled(data?.central_email_enabled ?? false);
    setCentralEmailLoading(false);
  }, [companyId]);

  useEffect(() => {
    load();
    loadSettings();
    loadCentralEmail();
  }, [load, loadSettings, loadCentralEmail]);

  const toggleCentralEmail = async (enabled: boolean) => {
    setCentralEmailSaving(true);
    setCentralEmailEnabled(enabled);
    await supabase.from("companies").update({ central_email_enabled: enabled }).eq("id", companyId);
    setCentralEmailSaving(false);
  };

  const connect = async () => {
    setError(null);
    if (!domainInput.trim()) { setError("Domain is required"); return; }
    setSaving(true);
    const res = await fetch("/api/company/email-domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        domain: domainInput.trim(),
        from_name: fromNameInput.trim() || "Notifications",
        from_local_part: fromLocalPartInput.trim() || "notifications",
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to save"); return; }
    setDomainInput("");
    setShowForm(false);
    setDomain(json.domain);
  };

  const recheck = async () => {
    setVerifying(true);
    const res = await fetch("/api/company/email-domain/verify", { method: "POST" });
    const json = await res.json();
    setVerifying(false);
    if (res.ok) setDomain(json.domain);
  };

  const disconnect = async () => {
    if (!confirm("Remove this sending domain? Emails to this company will fall back to the platform default sender.")) return;
    await fetch("/api/company/email-domain", { method: "DELETE" });
    setDomain(null);
  };

  const copyValue = (field: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const toggleSetting = async (key: string, enabled: boolean) => {
    const next = { ...settings, [key]: enabled };
    setSettings(next);
    await supabase.from("companies").update({ email_notification_settings: next }).eq("id", companyId);
  };

  if (loading) return null;

  const statusInfo = domain ? STATUS_STYLES[domain.status] : null;
  const StatusIcon = statusInfo?.icon;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Custom sending domain</p>
          {!domain && (
            <button onClick={() => setShowForm((v) => !v)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
              <Mail size={14} />
            </button>
          )}
        </div>

        {!domain && !showForm && (
          <p className="text-[12px] text-slate-400">
            Not connected. Emails to this company&apos;s users send from Diract&apos;s default address until a
            verified domain is added here -- then notification and login emails send as your own brand instead.
          </p>
        )}

        {domain && (
          <div className="space-y-3 mb-2">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
              {StatusIcon && <StatusIcon size={13} className={statusInfo!.className.split(" ")[1] + " shrink-0"} />}
              <p className="text-[12px] font-medium text-slate-700 flex-1">
                {domain.from_local_part}@{domain.domain}
              </p>
              <span className={`px-3 py-1 text-[10px] font-bold rounded-full shrink-0 ${statusInfo!.className}`}>
                {statusInfo!.label}
              </span>
              <button onClick={disconnect} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>

            {domain.status !== "verified" && (
              <>
                <p className="text-[12px] text-slate-400 px-1">
                  Add these DNS records at your domain registrar, then recheck -- verification can take a few
                  minutes to propagate.
                </p>
                <div className="space-y-2">
                  {domain.dns_records.map((rec, i) => (
                    <div key={i} className="px-4 py-2.5 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-slate-200 text-slate-600">{rec.type}</span>
                        {rec.status && (
                          <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${rec.status === "verified" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {rec.status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <code className="flex-1 text-[11px] text-slate-600 truncate">{rec.name}</code>
                        <button onClick={() => copyValue(`${i}-name`, rec.name)} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                          {copiedField === `${i}-name` ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-[11px] text-slate-600 truncate">{rec.value}</code>
                        <button onClick={() => copyValue(`${i}-value`, rec.value)} className="p-1 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                          {copiedField === `${i}-value` ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={recheck}
                  disabled={verifying}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-800 transition-colors disabled:opacity-40"
                >
                  {verifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Recheck DNS
                </button>
              </>
            )}
          </div>
        )}

        {showForm && !domain && (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <input
              value={domainInput}
              onChange={(e) => setDomainInput(e.target.value)}
              placeholder="yourfirm.com"
              className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                value={fromNameInput}
                onChange={(e) => setFromNameInput(e.target.value)}
                placeholder="Sender name"
                className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              />
              <input
                value={fromLocalPartInput}
                onChange={(e) => setFromLocalPartInput(e.target.value)}
                placeholder="notifications"
                className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
              />
            </div>
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
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Notification emails</p>
        <p className="text-[12px] text-slate-400 mb-4">Choose which app events send an email.</p>
        {settingsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <div className="space-y-2">
            {NOTIFICATION_EVENT_TYPES.map((eventType) => {
              const enabled = settings[eventType.key] !== false;
              return (
                <div key={eventType.key} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-slate-700">{eventType.label}</p>
                    <p className="text-[11px] text-slate-400">{eventType.description}</p>
                  </div>
                  <button
                    onClick={() => toggleSetting(eventType.key, !enabled)}
                    className={`px-3 py-1 text-[10px] font-bold rounded-full transition-colors shrink-0 ${
                      enabled ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {enabled ? "On" : "Off"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Central email</p>
        <p className="text-[12px] text-slate-400 mb-4">
          Stop copying project-labeled emails into every team member&apos;s own Gmail/Outlook mailbox. The person
          who files an email still gets it in their own mailbox as usual, but nobody else does -- everyone instead
          reads it from the project&apos;s Emails tab in the app.
        </p>
        {centralEmailLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-slate-700">Central email</p>
              <p className="text-[11px] text-slate-400">On: emails stay central. Off: emails sync to every member&apos;s mailbox (default).</p>
            </div>
            <button
              onClick={() => toggleCentralEmail(!centralEmailEnabled)}
              disabled={centralEmailSaving}
              className={`px-3 py-1 text-[10px] font-bold rounded-full transition-colors shrink-0 disabled:opacity-40 ${
                centralEmailEnabled ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {centralEmailEnabled ? "On" : "Off"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
