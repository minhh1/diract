// components/settings/ClientUpdatePagesTab.tsx
// Admin management for Client Update Pages -- copies
// components/settings/PublicTaskPagesTab.tsx's shape exactly: list existing
// pages, create/revoke, copy/open the link. The one thing beyond that
// shape is PIN edit/regenerate, inline per row. Everything else (matters,
// groups, columns, values, notes, date format) is edited on the page
// itself now, not here -- see app/public/updates/[slug]/page.tsx.
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Copy, Check, Trash2, ExternalLink, X, Pencil, RefreshCw } from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";

interface Page {
  id: string; title: string; client_label: string | null; slug: string;
  access_code: string | null; is_active: boolean; expires_at: string | null; matterCount: number;
}

async function fetchPages(): Promise<{ pages: Page[] }> {
  const res = await fetch("/api/client-update-pages/list");
  return res.json();
}

export default function ClientUpdatePagesTab() {
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  const { data, isLoading: loading, refetch } = useQuery({
    queryKey: ["client-update-pages"],
    queryFn: fetchPages,
    staleTime: 30 * 1000,
  });
  const pages = data?.pages ?? [];
  useProgressBarWhile(loading);

  const handleRevoke = async (id: string) => {
    if (!window.confirm("Revoke this page? The link will stop working immediately.")) return;
    await fetch(`/api/client-update-pages/${id}/revoke`, { method: "PATCH" });
    refetch();
  };

  const copyLink = (slug: string, id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/public/updates/${slug}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const changePin = async (id: string, body: { pin: string } | { regenerate: true }) => {
    setSavingPin(true);
    setPinError(null);
    const res = await fetch(`/api/client-update-pages/${id}/pin`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setSavingPin(false);
    if (!res.ok) { setPinError(json.error || "Could not update PIN"); return; }
    setEditingPinId(null);
    refetch();
  };

  if (loading) return null;

  return (
    <div className="space-y-6 animate-in fade-in">
      <button onClick={() => setShowCreate(true)}
        className="flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
        <Plus size={14} /> Create client update page
      </button>

      <div className="space-y-3">
        {pages.length === 0 && <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-12">No client update pages yet</p>}
        {pages.map(p => (
          <div key={p.id} className="flex items-center gap-4 p-5 bg-white border border-slate-200 rounded-[24px]">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-bold text-slate-800">{p.title}</p>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${p.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                  {p.is_active ? "Active" : "Revoked"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {editingPinId === p.id ? (
                  <>
                    <input value={pinDraft} onChange={e => setPinDraft(e.target.value)} autoFocus
                      onKeyDown={e => { if (e.key === "Enter" && pinDraft.trim()) changePin(p.id, { pin: pinDraft.trim() }); if (e.key === "Escape") setEditingPinId(null); }}
                      placeholder="New PIN" className="w-24 px-2 py-0.5 border border-indigo-300 rounded-full text-[11px] outline-none" />
                    <button disabled={savingPin || !pinDraft.trim()} onClick={() => changePin(p.id, { pin: pinDraft.trim() })}
                      className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">Save</button>
                    <button onClick={() => setEditingPinId(null)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] text-slate-400">
                      {p.matterCount} matter{p.matterCount === 1 ? "" : "s"} · PIN {p.access_code}
                      {p.expires_at ? ` · expires ${new Date(p.expires_at).toLocaleDateString()}` : " · no expiry"}
                    </p>
                    {p.is_active && (
                      <>
                        <button onClick={() => { setPinDraft(p.access_code || ""); setEditingPinId(p.id); setPinError(null); }} title="Change PIN"
                          className="p-0.5 text-slate-300 hover:text-indigo-600 transition-colors"><Pencil size={11} /></button>
                        <button onClick={() => changePin(p.id, { regenerate: true })} disabled={savingPin} title="Generate a new random PIN"
                          className="p-0.5 text-slate-300 hover:text-indigo-600 transition-colors disabled:opacity-40"><RefreshCw size={11} /></button>
                      </>
                    )}
                  </>
                )}
              </div>
              {editingPinId === p.id && pinError && <p className="text-[10px] text-red-500 mt-0.5">{pinError}</p>}
            </div>
            {p.is_active && (
              <>
                <button onClick={() => copyLink(p.slug, p.id)} title="Copy link"
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  {copiedId === p.id ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                </button>
                <a href={`/public/updates/${p.slug}`} target="_blank" rel="noopener noreferrer" title="Open"
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors shrink-0">
                  <ExternalLink size={15} />
                </a>
                <button onClick={() => handleRevoke(p.id)} title="Revoke"
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors shrink-0">
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {showCreate && (
        <CreatePageModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />
      )}
    </div>
  );
}

function CreatePageModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [clientLabel, setClientLabel] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/client-update-pages/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, clientLabel, slug: slug || title }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to create page"); return; }
    setCreatedUrl(`${window.location.origin}/public/updates/${json.page.slug}`);
    setCreatedId(json.page.id);
  };

  if (createdUrl) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 p-8 text-center space-y-4">
          <Check size={32} className="text-emerald-500 mx-auto" />
          <p className="text-[14px] font-bold text-slate-800">Page created</p>
          <div className="px-4 py-3 bg-slate-50 rounded-2xl">
            <code className="text-[11px] text-slate-600 break-all">{createdUrl}</code>
          </div>
          <p className="text-[11px] text-slate-400">Add matters, groups, and columns directly on the page — open it above, sign in, and you'll see full editing controls.</p>
          <button onClick={() => { navigator.clipboard.writeText(createdUrl); }}
            className="w-full py-3 bg-slate-900 text-white text-[12px] font-bold rounded-full hover:bg-slate-700 flex items-center justify-center gap-2">
            <Copy size={13} /> Copy link
          </button>
          <button onClick={() => onCreated(createdId!)} className="w-full py-3 border border-slate-200 text-slate-600 text-[12px] font-bold rounded-full hover:bg-slate-50">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl w-full max-w-lg mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Create client update page</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Title</p>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Niksen — Matter Update"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Client label <span className="normal-case font-normal text-slate-300">(optional)</span></p>
            <input value={clientLabel} onChange={e => setClientLabel(e.target.value)} placeholder="e.g. Niksen"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Custom URL <span className="normal-case font-normal text-slate-300">(defaults from title)</span></p>
            <div className="flex items-center gap-1 px-4 py-2.5 border border-slate-200 rounded-full">
              <span className="text-[12px] text-slate-400 shrink-0">/public/updates/</span>
              <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="niksen"
                className="flex-1 min-w-0 text-[13px] outline-none" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400">A 6-digit PIN is generated automatically — clients enter it once and won't be asked again. Signed-in staff never need it.</p>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <div className="px-8 py-5 border-t border-slate-100 shrink-0">
          <button onClick={handleCreate} disabled={saving}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
            {saving ? "Creating..." : "Create page"}
          </button>
        </div>
      </div>
    </div>
  );
}
