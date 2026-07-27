// components/settings/ClientUpdatePagesTab.tsx
// Admin management for Client Update Pages -- modeled on
// components/settings/PublicTaskPagesTab.tsx for the list/create/revoke
// shell, plus a page editor (groups, matters, fields, values, notes) since
// unlike public task pages this content is curated per page, not derived
// live from a scope.
"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Copy, Check, Trash2, ExternalLink, X, ArrowLeft, Search, Pencil, RefreshCw,
} from "lucide-react";
import { useProgressBarWhile } from "@/components/TopProgressBar";
import MatterBoard from "@/components/clientUpdatePages/MatterBoard";

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
  const [openPageId, setOpenPageId] = useState<string | null>(null);

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

  if (openPageId) {
    return <PageEditor pageId={openPageId} onBack={() => { setOpenPageId(null); refetch(); }} />;
  }

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
            <button className="flex-1 min-w-0 text-left" onClick={() => setOpenPageId(p.id)}>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-bold text-slate-800">{p.title}</p>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${p.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                  {p.is_active ? "Active" : "Revoked"}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {p.matterCount} matter{p.matterCount === 1 ? "" : "s"} · PIN {p.access_code}
                {p.expires_at ? ` · expires ${new Date(p.expires_at).toLocaleDateString()}` : " · no expiry"}
              </p>
            </button>
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
        <CreatePageModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); refetch(); setOpenPageId(id); }} />
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
    onCreated(json.page.id);
  };

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
          <p className="text-[11px] text-slate-400">A 6-digit PIN is generated automatically — you can share it once and clients won't be asked again after their first visit.</p>
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

// ── Page editor ───────────────────────────────────────────────────────

interface Group { id: string; name: string; display_order: number; }
interface FieldDef { id: string; field_source: string; field_key: string; label: string; display_order: number; }
interface Note { id: string; note_date: string; body: string; author_name: string | null; source: "staff" | "client"; }
interface Item { id: string; project_id: string; group_id: string | null; matterName: string; values: Record<string, any>; notes: Note[]; }
interface Detail { page: Page; groups: Group[]; items: Item[]; fields: FieldDef[]; }

async function fetchDetail(pageId: string): Promise<Detail> {
  const res = await fetch(`/api/client-update-pages/${pageId}`);
  return res.json();
}

function PageEditor({ pageId, onBack }: { pageId: string; onBack: () => void }) {
  const { data, refetch, isLoading } = useQuery({ queryKey: ["client-update-page", pageId], queryFn: () => fetchDetail(pageId) });
  // Local, optimistically-mutated copy of the loaded detail -- every board
  // edit (value/group/note/etc) updates this immediately and fires its
  // request in the background, rather than waiting on a refetch round-trip.
  // Re-synced from `data` on load and whenever a modal-driven action
  // (add matter/add field) triggers an explicit refetch() for its
  // server-generated id.
  const [board, setBoard] = useState<Detail | null>(null);
  useEffect(() => { if (data) setBoard(data); }, [data]);

  const [showAddMatter, setShowAddMatter] = useState<string | null>(null); // groupId or "" for ungrouped
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [savingPin, setSavingPin] = useState(false);

  useProgressBarWhile(isLoading);
  if (isLoading || !board) return null;
  const { page, groups, items, fields } = board;

  const addGroup = (name: string) => {
    const tempId = `temp-${Date.now()}`;
    setBoard(prev => prev && { ...prev, groups: [...prev.groups, { id: tempId, name, display_order: prev.groups.length }] });
    fetch(`/api/client-update-pages/${pageId}/groups`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    }).then(r => r.json()).then(json => {
      if (json.group) setBoard(prev => prev && { ...prev, groups: prev.groups.map(g => g.id === tempId ? json.group : g) });
    });
  };

  const renameGroup = (groupId: string, name: string) => {
    setBoard(prev => prev && { ...prev, groups: prev.groups.map(g => g.id === groupId ? { ...g, name } : g) });
    fetch(`/api/client-update-pages/${pageId}/groups/${groupId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
  };

  const deleteGroup = (groupId: string) => {
    if (!window.confirm("Delete this group? Its matters move to Ungrouped, nothing else changes.")) return;
    setBoard(prev => prev && {
      ...prev,
      groups: prev.groups.filter(g => g.id !== groupId),
      items: prev.items.map(i => i.group_id === groupId ? { ...i, group_id: null } : i),
    });
    fetch(`/api/client-update-pages/${pageId}/groups/${groupId}`, { method: "DELETE" });
  };

  const moveItem = (itemId: string, groupId: string | null) => {
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, group_id: groupId } : i) });
    fetch(`/api/client-update-pages/${pageId}/items/${itemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId }),
    });
  };

  const removeItem = (itemId: string) => {
    setBoard(prev => prev && { ...prev, items: prev.items.filter(i => i.id !== itemId) });
    fetch(`/api/client-update-pages/${pageId}/items/${itemId}`, { method: "DELETE" });
  };

  const saveValue = (itemId: string, fieldId: string, value: any) => {
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, values: { ...i.values, [fieldId]: value } } : i) });
    fetch(`/api/client-update-pages/${pageId}/values`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, fieldId, value }),
    });
  };

  const addNote = (itemId: string, note: string) => {
    if (!note.trim()) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticNote = { id: tempId, note_date: new Date().toISOString().slice(0, 10), body: note.trim(), author_name: "You", source: "staff" as const };
    setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, notes: [optimisticNote, ...i.notes] } : i) });
    fetch(`/api/client-update-pages/${pageId}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, note }),
    }).then(r => r.json()).then(json => {
      if (json.note) setBoard(prev => prev && { ...prev, items: prev.items.map(i => i.id === itemId ? { ...i, notes: i.notes.map(n => n.id === tempId ? json.note : n) } : i) });
    });
  };

  const removeField = (fieldId: string) => {
    setBoard(prev => prev && { ...prev, fields: prev.fields.filter(f => f.id !== fieldId) });
    fetch(`/api/client-update-pages/${pageId}/fields/${fieldId}`, { method: "DELETE" });
  };

  const changePin = async (body: { pin: string } | { regenerate: true }) => {
    setSavingPin(true);
    setPinError(null);
    const res = await fetch(`/api/client-update-pages/${pageId}/pin`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    setSavingPin(false);
    if (!res.ok) { setPinError(json.error || "Could not update PIN"); return; }
    setEditingPin(false);
    refetch();
  };

  const itemsFor = (groupId: string | null) => items.filter(i => i.group_id === groupId);
  const publicUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/public/updates/${page.slug}`;

  return (
    <div className="space-y-6 animate-in fade-in">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 text-slate-400 hover:text-slate-700 transition-colors"><ArrowLeft size={16} /></button>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-slate-800">{page.title}</p>
          <div className="flex items-center gap-1.5">
            {editingPin ? (
              <>
                <input value={pinDraft} onChange={e => setPinDraft(e.target.value)} autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && pinDraft.trim()) changePin({ pin: pinDraft.trim() }); if (e.key === "Escape") setEditingPin(false); }}
                  placeholder="New PIN" className="w-24 px-2 py-0.5 border border-indigo-300 rounded-full text-[11px] outline-none" />
                <button disabled={savingPin || !pinDraft.trim()} onClick={() => changePin({ pin: pinDraft.trim() })}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-40">Save</button>
                <button onClick={() => setEditingPin(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancel</button>
              </>
            ) : (
              <>
                <p className="text-[11px] text-slate-400">PIN {page.access_code} · {publicUrl}</p>
                <button onClick={() => { setPinDraft(page.access_code || ""); setEditingPin(true); }} title="Change PIN"
                  className="p-0.5 text-slate-300 hover:text-indigo-600 transition-colors"><Pencil size={11} /></button>
                <button onClick={() => changePin({ regenerate: true })} disabled={savingPin} title="Generate a new random PIN"
                  className="p-0.5 text-slate-300 hover:text-indigo-600 transition-colors disabled:opacity-40"><RefreshCw size={11} /></button>
              </>
            )}
          </div>
          {pinError && <p className="text-[10px] text-red-500 mt-0.5">{pinError}</p>}
        </div>
        <button onClick={() => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:border-indigo-300 transition-colors">
          {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />} Copy link
        </button>
        <button onClick={() => setShowFieldPicker(true)}
          className="px-3 py-2 border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:border-indigo-300 transition-colors">
          Manage fields
        </button>
      </div>

      <MatterBoard groups={groups} items={items} fields={fields} canEdit canComment
        onSaveValue={saveValue} onRenameGroup={renameGroup} onDeleteGroup={deleteGroup} onAddGroup={addGroup}
        onMoveItem={moveItem} onRemoveItem={removeItem} onAddNote={addNote}
        onAddMatter={groupId => setShowAddMatter(groupId ?? "")} />

      {showAddMatter !== null && (
        <AddMatterModal groupId={showAddMatter || null} pageId={pageId}
          onClose={() => setShowAddMatter(null)} onAdded={() => { setShowAddMatter(null); refetch(); }} />
      )}
      {showFieldPicker && (
        <FieldPickerModal pageId={pageId} currentFields={fields} onRemove={removeField}
          onClose={() => setShowFieldPicker(false)} onChanged={() => refetch()} />
      )}
    </div>
  );
}

function AddMatterModal({ pageId, groupId, onClose, onAdded }: { pageId: string; groupId: string | null; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [searching, setSearching] = useState(false);

  const search = async (query: string) => {
    setQ(query);
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/client-update-pages/matters/search?q=${encodeURIComponent(query)}`);
    const json = await res.json();
    setSearching(false);
    setResults(json.matters || []);
  };

  const add = async (projectId: string) => {
    await fetch(`/api/client-update-pages/${pageId}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, groupId }),
    });
    onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-slate-800">Add a matter</h3>
          <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-full">
          <Search size={14} className="text-slate-300" />
          <input value={q} onChange={e => search(e.target.value)} placeholder="Search by name or matter number..." autoFocus
            className="flex-1 text-[13px] outline-none" />
        </div>
        <div className="space-y-1 max-h-72 overflow-y-auto">
          {searching && <p className="text-[11px] text-slate-300 text-center py-4">Searching...</p>}
          {results.map(r => (
            <button key={r.id} onClick={() => add(r.id)}
              className="w-full text-left px-4 py-2.5 rounded-2xl hover:bg-indigo-50 transition-colors">
              <p className="text-[12px] font-medium text-slate-700">{r.name}</p>
              {r.description && <p className="text-[10px] text-slate-400 truncate">{r.description}</p>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldPickerModal({ pageId, currentFields, onRemove, onClose, onChanged }: {
  pageId: string; currentFields: FieldDef[]; onRemove: (fieldId: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const [catalog, setCatalog] = useState<{ base: { field_key: string; label: string }[]; custom: { field_key: string; label: string }[] } | null>(null);
  const [adhocLabel, setAdhocLabel] = useState("");

  useState(() => {
    fetch(`/api/client-update-pages/${pageId}/fields`).then(r => r.json()).then(setCatalog);
  });

  const usedKeys = new Set(currentFields.filter(f => f.field_source !== "adhoc").map(f => f.field_key));

  const addField = async (fieldSource: "base" | "custom" | "adhoc", fieldKey: string | undefined, label: string) => {
    await fetch(`/api/client-update-pages/${pageId}/fields`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fieldSource, fieldKey, label }),
    });
    onChanged();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Manage fields</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">On this page</p>
            <div className="space-y-1">
              {currentFields.map(f => (
                <div key={f.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
                  <span className="text-[12px] text-slate-700">{f.label}</span>
                  <button onClick={() => onRemove(f.id)} className="p-1 text-slate-300 hover:text-red-500"><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Matter fields</p>
            <div className="flex flex-wrap gap-2">
              {catalog?.base.filter(o => !usedKeys.has(o.field_key)).map(o => (
                <button key={o.field_key} onClick={() => addField("base", o.field_key, o.label)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  + {o.label}
                </button>
              ))}
              {catalog?.custom.filter(o => !usedKeys.has(o.field_key)).map(o => (
                <button key={o.field_key} onClick={() => addField("custom", o.field_key, o.label)}
                  className="px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  + {o.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Add a report-only field</p>
            <p className="text-[11px] text-slate-400 mb-2">Doesn't exist on the matter record — just a note field for this report.</p>
            <div className="flex items-center gap-2">
              <input value={adhocLabel} onChange={e => setAdhocLabel(e.target.value)} placeholder="e.g. Special conditions"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              <button onClick={() => { if (adhocLabel.trim()) { addField("adhoc", undefined, adhocLabel.trim()); setAdhocLabel(""); } }}
                className="px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full">Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
