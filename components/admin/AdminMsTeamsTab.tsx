// components/admin/AdminMsTeamsTab.tsx
// Admin-only: connect the company's Microsoft Teams tenant via an Azure AD
// app registration (company-wide app-only access, one org admin consent --
// no per-user connect flow). Distinct from AdminTeamsTab.tsx, which
// manages this app's internal user-teams and has nothing to do with
// Microsoft Teams.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Users2, Trash2, Loader2, ExternalLink, CheckCircle2, HelpCircle } from "lucide-react";
import CredentialsHelpDrawer from "./CredentialsHelpDrawer";
import { APP_URL } from "@/lib/config";

const CONSENT_CALLBACK_URL = `${APP_URL}/api/teams/admin-consent-callback`;

// Last verified against learn.microsoft.com's Azure AD app registration +
// v2 admin-consent-endpoint docs on 2026-07-21 -- if a step no longer
// matches the Azure Portal, re-check and update this array rather than
// guessing.
const TEAMS_HELP_STEPS = [
  {
    title: "Register an app in Azure AD (Microsoft Entra ID)",
    description:
      `In the Azure Portal, go to Microsoft Entra ID → App registrations → New registration. Any name is fine. Even though there's no interactive sign-in here, the admin-consent step later is itself redirect-based and requires at least one Redirect URI registered, or it fails with AADSTS500113 ("No reply address is registered"). Add ${CONSENT_CALLBACK_URL} as a Web redirect URI under Authentication (either during creation, or after via Authentication → Add a platform → Web).`,
    linkLabel: "portal.azure.com",
    linkUrl: "https://portal.azure.com",
  },
  {
    title: "Find the tenant ID and client ID",
    description:
      "After registering, the app's Overview page shows both directly: \"Directory (tenant) ID\" and \"Application (client) ID\". Copy each one exactly as shown.",
  },
  {
    title: "Generate a client secret",
    description:
      "On the same app, go to Certificates & secrets → Client secrets → New client secret. Copy the Value column immediately after creating it — Azure only displays it once, and the field named \"Secret ID\" next to it is not the value you need.",
  },
  {
    title: "Add API permissions and grant admin consent",
    description:
      "Go to API permissions → Add a permission → Microsoft Graph → Application permissions, and add ChannelMessage.Read.All, Chat.Read.All, and Team.ReadBasic.All. After saving the credentials below, use the \"Grant admin consent\" link this app shows you — it needs to be clicked by someone with Microsoft 365 admin rights for your organization. Once they approve, Azure redirects back here and this connects automatically -- the button below is just a manual fallback in case that redirect doesn't land back in this browser.",
  },
];

interface Props {
  companyId: string;
}

interface Connection {
  id: string;
  admin_consent_granted: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  tenant_id: string;
  client_id: string;
}

export default function AdminMsTeamsTab({ companyId }: Props) {
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const consentResult = searchParams.get("msTeamsConsent");
  const consentMessage = searchParams.get("message");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/teams/credentials");
    const json = await res.json();
    setConnection(json.connection ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async () => {
    setError(null);
    if (!tenantId.trim() || !clientId.trim() || !clientSecret.trim()) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/teams/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId.trim(), client_id: clientId.trim(), client_secret: clientSecret.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Failed to save");
      return;
    }
    setTenantId("");
    setClientId("");
    setClientSecret("");
    setShowForm(false);
    load();
  };

  const confirmConsent = async () => {
    await fetch("/api/teams/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_consent_granted: true }),
    });
    load();
  };

  const disconnect = async () => {
    if (!confirm("Disconnect Microsoft Teams? Messages already synced will be kept.")) return;
    await fetch("/api/teams/credentials", { method: "DELETE" });
    load();
  };

  const adminConsentUrl = connection
    ? `https://login.microsoftonline.com/${connection.tenant_id}/adminconsent?client_id=${connection.client_id}` +
      `&state=${companyId}&redirect_uri=${encodeURIComponent(CONSENT_CALLBACK_URL)}`
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Microsoft Teams sync</p>
          {!connection && (
            <button onClick={() => setShowForm((v) => !v)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
              <Users2 size={14} />
            </button>
          )}
        </div>

        {consentResult === "success" && (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 rounded-2xl px-4 py-2 mb-3">
            <CheckCircle2 size={12} /> Admin consent granted -- Teams sync will start on its next run.
          </p>
        )}
        {consentResult === "error" && (
          <p className="text-[11px] text-red-600 bg-red-50 rounded-2xl px-4 py-2 mb-3">
            Admin consent failed{consentMessage ? `: ${consentMessage}` : ""}. Check that the redirect URI is registered on the app, then try again.
          </p>
        )}

        {!connection && !showForm && (
          <p className="text-[12px] text-slate-400">
            Not connected. Requires an Azure AD app registration with application permissions
            (ChannelMessage.Read.All, Chat.Read.All, Team.ReadBasic.All) and org admin consent --
            reads chats/channels across the whole tenant, not just one user&apos;s.
          </p>
        )}

        {connection && (
          <div className="space-y-2 mb-2">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
              <Users2 size={13} className={connection.admin_consent_granted ? "text-emerald-500 shrink-0" : "text-amber-500 shrink-0"} />
              <p className="text-[12px] font-medium text-slate-700 flex-1">
                Tenant {connection.tenant_id}
                {connection.last_synced_at && ` — last synced ${new Date(connection.last_synced_at).toLocaleString()}`}
              </p>
              <button onClick={disconnect} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>

            {connection.last_sync_error && (
              <p className="text-[11px] text-red-500 px-4">{connection.last_sync_error}</p>
            )}

            {!connection.admin_consent_granted && (
              <div className="px-4 py-3 bg-amber-50 rounded-2xl space-y-2">
                <p className="text-[12px] text-amber-800">
                  Have your Microsoft 365 admin grant org-wide consent for this app, then confirm below.
                </p>
                <a
                  href={adminConsentUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline"
                >
                  Grant admin consent <ExternalLink size={12} />
                </a>
                <button
                  onClick={confirmConsent}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-800 transition-colors"
                >
                  <CheckCircle2 size={12} /> Consent granted, start syncing
                </button>
              </div>
            )}
          </div>
        )}

        {showForm && !connection && (
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:underline"
            >
              <HelpCircle size={12} /> Where do I find these?
            </button>
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="Directory (tenant) ID"
              className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
            />
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="Application (client) ID"
              className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400"
            />
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Client secret"
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
          </div>
        )}
      </div>

      <CredentialsHelpDrawer
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Finding your Azure AD credentials"
        intro="All three values below come from an Azure AD app registration in the Azure Portal — your company's Microsoft 365 admin will need to complete the last step."
        steps={TEAMS_HELP_STEPS}
      />
    </div>
  );
}
