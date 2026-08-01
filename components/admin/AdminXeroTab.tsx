// components/admin/AdminXeroTab.tsx
// Admin-only: connect this company's Xero organisation(s) via the standard
// OAuth 2.0 Authorization Code flow (one shared Diract-owned Xero app,
// XERO_CLIENT_ID/XERO_CLIENT_SECRET env vars -- see .env.example -- not a
// BYO app registration like AdminMsTeamsTab/AdminOneDriveTab, since Xero
// apps don't need a per-customer registration). One authorization can
// return more than one connected organisation, hence a list rather than a
// single connection like Gmail.
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Landmark, Trash2, Loader2, HelpCircle, CheckCircle2, Search, Building2 } from "lucide-react";
import CredentialsHelpDrawer from "./CredentialsHelpDrawer";
import { useCompany } from "@/components/CompanyContext";

// Customer-facing walkthrough of the OAuth consent flow -- unlike
// WhatsApp/Teams' help steps (which point at credentials the customer has
// to go dig up themselves), there's nothing to "find" here: one shared
// Diract-owned Xero app handles every company, so this just narrates what
// clicking "Connect an organisation" actually does.
const XERO_HELP_STEPS = [
  {
    title: "Click \"Connect an organisation\"",
    description: "This opens Xero's own sign-in and consent screen in a new step -- nothing to set up beforehand.",
  },
  {
    title: "Sign in to Xero and choose an organisation",
    description: "Log in with your usual Xero account, then pick which organisation to connect. To connect more than one, just repeat this process again afterwards.",
  },
  {
    title: "Approve access",
    description: "Xero shows exactly what's being requested (read-only access to your organisation's settings) -- click \"Allow access\" to finish.",
  },
  {
    title: "You're redirected back here, connected",
    description: "The organisation now appears in the list below. Disconnect it any time with the trash icon, and link any entity to it further down so its records can be matched to this organisation.",
  },
];

interface Connection {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  is_own_organisation: boolean;
}

interface EntityRow {
  id: string;
  name: string;
  entity_type: string | null;
  xero_connection_id: string | null;
}

export default function AdminXeroTab() {
  const searchParams = useSearchParams();
  const result = searchParams.get("xero");
  const message = searchParams.get("message");

  const { companyName } = useCompany();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(true);
  const [linking, setLinking] = useState<string | null>(null);
  const [settingOwnOrg, setSettingOwnOrg] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [entitySearch, setEntitySearch] = useState('');
  const filteredEntities = entitySearch.trim()
    ? entities.filter(e => e.name.toLowerCase().includes(entitySearch.trim().toLowerCase()))
    : entities;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/xero/connections");
    const json = await res.json();
    setConnections(json.connections ?? []);
    setLoading(false);
  }, []);

  const loadEntities = useCallback(async () => {
    setEntitiesLoading(true);
    const res = await fetch("/api/xero/entities");
    const json = await res.json();
    setEntities(json.entities ?? []);
    setEntitiesLoading(false);
  }, []);

  useEffect(() => { load(); loadEntities(); }, [load, loadEntities]);

  const disconnect = async (id: string) => {
    if (!confirm("Disconnect this Xero organisation? Entities linked to it will be unlinked.")) return;
    await fetch(`/api/xero/connections?id=${id}`, { method: "DELETE" });
    load();
    loadEntities();
  };

  const linkEntity = async (entityId: string, xeroConnectionId: string | null) => {
    setLinking(entityId);
    await fetch("/api/xero/entities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_id: entityId, xero_connection_id: xeroConnectionId }),
    });
    await loadEntities();
    setLinking(null);
  };

  // For companies that only track their own firm's invoicing in Xero, not
  // individual client entities -- marks (or unmarks) one connection as
  // representing the company itself. `id` is the currently own-organisation
  // connection's id when unlinking (selecting "Not linked"), or the newly
  // chosen connection's id when linking.
  const setOwnOrganisation = async (id: string, isOwnOrganisation: boolean) => {
    setSettingOwnOrg(true);
    await fetch("/api/xero/connections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, is_own_organisation: isOwnOrganisation }),
    });
    await load();
    setSettingOwnOrg(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Xero</p>
          <a
            href="/api/xero/auth"
            className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline"
          >
            <Landmark size={13} /> Connect an organisation
          </a>
        </div>

        {result === "connected" && (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-700 bg-emerald-50 rounded-2xl px-4 py-2 mb-3">
            <CheckCircle2 size={12} /> Xero organisation connected.
          </p>
        )}
        {result === "error" && (
          <p className="text-[11px] text-red-600 bg-red-50 rounded-2xl px-4 py-2 mb-3">
            Connection failed{message ? `: ${message}` : ""}.
          </p>
        )}

        {loading && (
          <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading...</p>
        )}

        {!loading && connections.length === 0 && (
          <p className="text-[12px] text-slate-400">
            Not connected yet. Click "Connect an organisation" above and sign in to Xero -- it takes about a minute.{" "}
            <button type="button" onClick={() => setHelpOpen(true)} className="inline-flex items-center gap-1 text-indigo-600 hover:underline font-bold">
              <HelpCircle size={11} /> How does this work?
            </button>
          </p>
        )}

        {!loading && connections.length > 0 && (
          <div className="space-y-2 mb-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
                <Landmark size={13} className="text-emerald-500 shrink-0" />
                <p className="text-[12px] font-medium text-slate-700 flex-1">
                  {c.tenant_name || c.tenant_id}
                  {c.last_synced_at && `, last synced ${new Date(c.last_synced_at).toLocaleString('en-AU')}`}
                </p>
                <button onClick={() => disconnect(c.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {connections.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-[32px] p-6">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-4">Link entities to a Xero organisation</p>

          {/* For a company that only tracks its own firm's invoicing in
              Xero (not individual clients) -- pinned above the client
              entity list rather than requiring a matching `entities` row
              to exist just so it has something to link. */}
          <div className="flex items-center gap-3 px-4 py-2.5 bg-indigo-50 rounded-2xl mb-3">
            <Building2 size={13} className="text-indigo-400 shrink-0" />
            <p className="text-[12px] font-bold text-indigo-700 flex-1">
              {companyName || 'Your firm'} <span className="font-normal text-indigo-400">(your own accounting, not a client)</span>
            </p>
            <select
              value={connections.find((c) => c.is_own_organisation)?.id ?? ""}
              disabled={settingOwnOrg}
              onChange={(ev) => {
                const newId = ev.target.value;
                const current = connections.find((c) => c.is_own_organisation);
                if (!newId && current) setOwnOrganisation(current.id, false);
                else if (newId) setOwnOrganisation(newId, true);
              }}
              className="text-[12px] border border-indigo-200 rounded-xl px-2 py-1 bg-white text-indigo-700"
            >
              <option value="">Not linked</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{c.tenant_name || c.tenant_id}</option>
              ))}
            </select>
          </div>

          {entitiesLoading && (
            <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading entities...</p>
          )}

          {!entitiesLoading && entities.length === 0 && (
            <p className="text-[12px] text-slate-400">No entities yet.</p>
          )}

          {!entitiesLoading && entities.length > 0 && (
            <>
              <div className="relative mb-3">
                <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  value={entitySearch}
                  onChange={(e) => setEntitySearch(e.target.value)}
                  placeholder="Search entities..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-full py-2 pl-9 pr-4 text-[12px] font-medium outline-none focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {filteredEntities.length === 0 && (
                <p className="text-[12px] text-slate-400">No entities match "{entitySearch}".</p>
              )}

              <div className="space-y-1.5">
                {filteredEntities.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl">
                    <p className="text-[12px] font-medium text-slate-700 flex-1">{e.name}</p>
                    <select
                      value={e.xero_connection_id ?? ""}
                      disabled={linking === e.id}
                      onChange={(ev) => linkEntity(e.id, ev.target.value || null)}
                      className="text-[12px] border border-slate-200 rounded-xl px-2 py-1 bg-white text-slate-600"
                    >
                      <option value="">Not linked</option>
                      {connections.map((c) => (
                        <option key={c.id} value={c.id}>{c.tenant_name || c.tenant_id}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <CredentialsHelpDrawer
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        title="Connecting your Xero organisation"
        intro="Diract connects to Xero using Xero's own sign-in screen -- there's nothing to look up or copy in beforehand."
        steps={XERO_HELP_STEPS}
      />
    </div>
  );
}
