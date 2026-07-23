// components/admin/AdminOneDriveTab.tsx
// Admin-only: connect a company-wide SharePoint document library (via
// Microsoft Graph app-only access) that the AI assistant reads from for
// grounding and can create/update files in when asked. Same Azure AD app
// registration pattern as AdminMsTeamsTab.tsx's Teams sync section (often
// literally the same app, with an additional Files.ReadWrite.All
// permission added) -- a separate connection/toggle here since a company
// might want one integration without the other.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FolderOpen, Trash2, ExternalLink, CheckCircle2, HelpCircle } from "lucide-react";
import CredentialsHelpDrawer from "./CredentialsHelpDrawer";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import { APP_URL } from "@/lib/config";

const CONSENT_CALLBACK_URL = `${APP_URL}/api/onedrive/admin-consent-callback`;

// Last verified against learn.microsoft.com's Azure AD app registration
// docs and the Graph "Files.ReadWrite.All" application-permission
// reference on 2026-07-24 -- if a step no longer matches, re-check and
// update rather than guessing.
const ONEDRIVE_HELP_STEPS = [
  {
    title: "Register (or reuse) an app in Azure AD",
    description:
      `If you've already connected Microsoft Teams above, you can reuse that exact same app registration -- otherwise: Azure Portal → Microsoft Entra ID → App registrations → New registration. This step also needs ${CONSENT_CALLBACK_URL} added as a Web redirect URI under Authentication, same requirement as the Teams connection.`,
    linkLabel: "portal.azure.com",
    linkUrl: "https://portal.azure.com",
  },
  {
    title: "Find the tenant ID and client ID",
    description: "The app's Overview page shows both directly: \"Directory (tenant) ID\" and \"Application (client) ID\".",
  },
  {
    title: "Generate a client secret",
    description:
      "Certificates & secrets → Client secrets → New client secret. Copy the Value column immediately -- Azure only displays it once.",
  },
  {
    title: "Add the Files.ReadWrite.All permission and grant admin consent",
    description:
      "API permissions → Add a permission → Microsoft Graph → Application permissions → add Files.ReadWrite.All. This is a tenant-wide permission -- it lets this app read and write any SharePoint/OneDrive file in your organization, not just the one library you connect below. After saving credentials here, use the \"Grant admin consent\" link -- it needs to be clicked by someone with Microsoft 365 admin rights.",
  },
  {
    title: "Find your SharePoint site URL",
    description:
      "Go to the SharePoint site (or Team) whose document library you want the assistant to use, and copy its URL directly from the browser address bar (e.g. https://yourcompany.sharepoint.com/sites/TeamName).",
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
  site_url: string;
  site_id: string | null;
  drive_id: string | null;
}

export default function AdminOneDriveTab({ companyId }: Props) {
  const searchParams = useSearchParams();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useProgressBarWhile(loading);

  const consentResult = searchParams.get("oneDriveConsent");
  const consentMessage = searchParams.get("message");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/onedrive/credentials");
    const json = await res.json();
    setConnection(json.connection ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connect = async () => {
    setError(null);
    if (!tenantId.trim() || !clientId.trim() || !clientSecret.trim() || !siteUrl.trim()) {
      setError("All fields are required");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/onedrive/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId.trim(), client_id: clientId.trim(), client_secret: clientSecret.trim(), site_url: siteUrl.trim() }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(json.error || "Failed to save");
      return;
    }
    if (json.resolveError) {
      setError(`Saved, but couldn't resolve the site yet: ${json.resolveError}. Grant admin consent below, then reconnect.`);
    }
    setTenantId("");
    setClientId("");
    setClientSecret("");
    setSiteUrl("");
    setShowForm(false);
    load();
  };

  const confirmConsent = async () => {
    await fetch("/api/onedrive/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin_consent_granted: true }),
    });
    load();
  };

  const disconnect = async () => {
    if (!confirm("Disconnect OneDrive/SharePoint? Files already synced for grounding will be kept.")) return;
    await fetch("/api/onedrive/credentials", { method: "DELETE" });
    load();
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">OneDrive / SharePoint</p>
          {!connection && (
            <button onClick={() => setShowForm((v) => !v)} className="p-1.5 text-slate-300 hover:text-indigo-600 transition-colors">
              <FolderOpen size={14} />
            </button>
          )}
        </div>

        {consentResult === "success" && (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 rounded-2xl px-4 py-2 mb-3">
            <CheckCircle2 size={12} /> Admin consent granted -- syncing will start on its next run.
          </p>
        )}
        {consentResult === "error" && (
          <p className="text-[11px] text-red-600 bg-red-50 rounded-2xl px-4 py-2 mb-3">
            Admin consent failed{consentMessage ? `: ${consentMessage}` : ""}.
          </p>
        )}

        {!connection && !showForm && (
          <p className="text-[12px] text-slate-400">
            Not connected. Requires an Azure AD app registration with the Files.ReadWrite.All application permission
            (tenant-wide -- every SharePoint/OneDrive file in your org, not just the library you pick below) and org
            admin consent. Lets the assistant read files there for grounding, and create/update files when asked.
          </p>
        )}

        {connection && (
          <div className="space-y-2 mb-2">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
              <FolderOpen size={13} className={connection.admin_consent_granted && connection.drive_id ? "text-emerald-500 shrink-0" : "text-amber-500 shrink-0"} />
              <p className="text-[12px] font-medium text-slate-700 flex-1 truncate">
                {connection.site_url}
                {connection.last_synced_at && ` — last synced ${new Date(connection.last_synced_at).toLocaleString()}`}
              </p>
              <button onClick={disconnect} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>

            {connection.last_sync_error && <p className="text-[11px] text-red-500 px-4">{connection.last_sync_error}</p>}

            {(!connection.admin_consent_granted || !connection.drive_id) && (
              <div className="px-4 py-3 bg-amber-50 rounded-2xl space-y-2">
                <p className="text-[12px] text-amber-800">
                  Have your Microsoft 365 admin grant org-wide consent for Files.ReadWrite.All, then confirm below.
                </p>
                <a
                  href={`https://login.microsoftonline.com/${connection.tenant_id}/adminconsent?client_id=${connection.client_id}&state=${companyId}&redirect_uri=${encodeURIComponent(CONSENT_CALLBACK_URL)}`}
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
                  <CheckCircle2 size={12} /> Consent granted, retry
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
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="SharePoint site URL (e.g. https://yourcompany.sharepoint.com/sites/TeamName)"
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
        title="Finding your OneDrive/SharePoint credentials"
        intro="The first three values come from an Azure AD app registration (reuse the Teams one if you have it); the site URL is just copied from your browser."
        steps={ONEDRIVE_HELP_STEPS}
      />
    </div>
  );
}
