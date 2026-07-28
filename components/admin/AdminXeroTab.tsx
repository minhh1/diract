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
import { Landmark, Trash2, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";

interface Connection {
  id: string;
  tenant_id: string;
  tenant_name: string | null;
  last_synced_at: string | null;
  last_sync_error: string | null;
  created_at: string;
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

  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(true);
  const [linking, setLinking] = useState<string | null>(null);

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
            Not connected. Requires a Xero app registered at{" "}
            <a href="https://developer.xero.com/app/manage" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">
              developer.xero.com <ExternalLink size={10} />
            </a>{" "}
            with XERO_CLIENT_ID/XERO_CLIENT_SECRET set (see .env.example) -- one app is shared across every company, each admin just connects their own organisation(s) here.
          </p>
        )}

        {!loading && connections.length > 0 && (
          <div className="space-y-2 mb-2">
            {connections.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
                <Landmark size={13} className="text-emerald-500 shrink-0" />
                <p className="text-[12px] font-medium text-slate-700 flex-1">
                  {c.tenant_name || c.tenant_id}
                  {c.last_synced_at && ` — last synced ${new Date(c.last_synced_at).toLocaleString()}`}
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

          {entitiesLoading && (
            <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading entities...</p>
          )}

          {!entitiesLoading && entities.length === 0 && (
            <p className="text-[12px] text-slate-400">No entities yet.</p>
          )}

          {!entitiesLoading && entities.length > 0 && (
            <div className="space-y-1.5">
              {entities.map((e) => (
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
          )}
        </div>
      )}
    </div>
  );
}
