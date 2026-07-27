// components/settings/ClientUpdatePagesTab.tsx
// Admin management for Client Update Pages -- modeled on
// components/settings/PublicTaskPagesTab.tsx for the list/create/revoke
// shell, plus a page editor (groups, matters, fields, values, notes) since
// unlike public task pages this content is curated per page, not derived
// live from a scope.
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Plus, Copy, Check, Trash2, ExternalLink, X, ArrowLeft, FolderPlus, Search,
} from "lucide-react";
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
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [showAddMatter, setShowAddMatter] = useState<string | null>(null); // groupId or "" for ungrouped
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const [copied, setCopied] = useState(false);

  useProgressBarWhile(isLoading);
  if (isLoading || !data) return null;
  const { page, groups, items, fields } = data;

  const addGroup = async () => {
    if (!newGroupName.trim()) return;
    await fetch(`/api/client-update-pages/${pageId}/groups`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newGroupName.trim() }),
    });
    setNewGroupName(""); setShowAddGroup(false); refetch();
  };

  const renameGroup = async (groupId: string, name: string) => {
    await fetch(`/api/client-update-pages/${pageId}/groups/${groupId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    refetch();
  };

  const deleteGroup = async (groupId: string) => {
    if (!window.confirm("Delete this group? Its matters move to Ungrouped, nothing else changes.")) return;
    await fetch(`/api/client-update-pages/${pageId}/groups/${groupId}`, { method: "DELETE" });
    refetch();
  };

  const moveItem = async (itemId: string, groupId: string | null) => {
    await fetch(`/api/client-update-pages/${pageId}/items/${itemId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId }),
    });
    refetch();
  };

  const removeItem = async (itemId: string) => {
    await fetch(`/api/client-update-pages/${pageId}/items/${itemId}`, { method: "DELETE" });
    refetch();
  };

  const saveValue = async (itemId: string, fieldId: string, value: any) => {
    await fetch(`/api/client-update-pages/${pageId}/values`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, fieldId, value }),
    });
    refetch();
  };

  const addNote = async (itemId: string, note: string) => {
    if (!note.trim()) return;
    await fetch(`/api/client-update-pages/${pageId}/notes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, note }),
    });
    refetch();
  };

  const removeField = async (fieldId: string) => {
    await fetch(`/api/client-update-pages/${pageId}/fields/${fieldId}`, { method: "DELETE" });
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
          <p className="text-[11px] text-slate-400">PIN {page.access_code} · {publicUrl}</p>
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

      {groups.map(g => (
        <GroupSection key={g.id} group={g} items={itemsFor(g.id)} fields={fields} allGroups={groups}
          onRename={name => renameGroup(g.id, name)} onDelete={() => deleteGroup(g.id)}
          onMoveItem={moveItem} onRemoveItem={removeItem} onSaveValue={saveValue} onAddNote={addNote}
          onAddMatter={() => setShowAddMatter(g.id)} />
      ))}

      <GroupSection group={null} items={itemsFor(null)} fields={fields} allGroups={groups}
        onMoveItem={moveItem} onRemoveItem={removeItem} onSaveValue={saveValue} onAddNote={addNote}
        onAddMatter={() => setShowAddMatter("")} />

      {showAddGroup ? (
        <div className="flex items-center gap-2">
          <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name"
            onKeyDown={e => { if (e.key === "Enter") addGroup(); }}
            autoFocus className="px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
          <button onClick={addGroup} className="px-4 py-2.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full">Add</button>
          <button onClick={() => setShowAddGroup(false)} className="px-4 py-2.5 text-slate-400 text-[11px] font-bold">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setShowAddGroup(true)}
          className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-slate-200 rounded-full text-[11px] font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
          <FolderPlus size={14} /> Add group
        </button>
      )}

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

function GroupSection({ group, items, fields, allGroups, onRename, onDelete, onMoveItem, onRemoveItem, onSaveValue, onAddNote, onAddMatter }: {
  group: Group | null; items: Item[]; fields: FieldDef[]; allGroups: Group[];
  onRename?: (name: string) => void; onDelete?: () => void;
  onMoveItem: (itemId: string, groupId: string | null) => void;
  onRemoveItem: (itemId: string) => void;
  onSaveValue: (itemId: string, fieldId: string, value: any) => void;
  onAddNote: (itemId: string, note: string) => void;
  onAddMatter: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group?.name || "");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  if (!group && items.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {editingName ? (
          <input value={nameDraft} onChange={e => setNameDraft(e.target.value)}
            onBlur={() => { setEditingName(false); if (nameDraft.trim() && onRename) onRename(nameDraft.trim()); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            autoFocus className="text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-transparent border-b border-indigo-300 outline-none" />
        ) : (
          <p onClick={() => group && setEditingName(true)} className={`text-[11px] font-bold text-slate-500 uppercase tracking-widest ${group ? "cursor-pointer hover:text-indigo-600" : ""}`}>
            {group ? group.name : "Ungrouped"}
          </p>
        )}
        {group && <button onClick={onDelete} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><X size={12} /></button>}
        <button onClick={onAddMatter} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">+ Add matter</button>
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-2xl">
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}>
              <p className="flex-1 text-[12px] font-medium text-slate-700">{item.matterName}</p>
              <select value={group?.id || ""} onChange={e => { e.stopPropagation(); onMoveItem(item.id, e.target.value || null); }} onClick={e => e.stopPropagation()}
                className="text-[11px] border border-slate-200 rounded-full px-2.5 py-1 outline-none bg-white">
                <option value="">Ungrouped</option>
                {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <button onClick={e => { e.stopPropagation(); onRemoveItem(item.id); }} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
            {expandedItem === item.id && (
              <div className="border-t border-slate-100 px-4 py-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {fields.map(f => (
                    <ValueCell key={f.id} field={f} value={item.values[f.id]} onSave={v => onSaveValue(item.id, f.id, v)} />
                  ))}
                </div>
                <NotesPanel notes={item.notes} onAdd={note => onAddNote(item.id, note)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ValueCell({ field, value, onSave }: { field: FieldDef; value: any; onSave: (v: any) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  const commit = () => { setEditing(false); if (draft !== (value ?? "")) onSave(draft === "" ? null : draft); };
  const isDate = field.field_key.includes("date") || field.field_key === "estimated_completion_date";

  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{field.label}</p>
      {editing ? (
        <input autoFocus type={isDate ? "date" : "text"} value={draft ?? ""} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-full px-2 py-1 border border-indigo-300 rounded-lg text-[12px] outline-none" />
      ) : (
        <p onClick={() => { setDraft(value ?? ""); setEditing(true); }} className="text-[12px] text-slate-700 cursor-text hover:bg-slate-50 rounded px-1 -mx-1 min-h-[18px]">
          {value == null || value === "" ? <span className="text-slate-300">—</span> : String(value)}
        </p>
      )}
    </div>
  );
}

function NotesPanel({ notes, onAdd }: { notes: Note[]; onAdd: (note: string) => void }) {
  const [input, setInput] = useState("");
  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Notes</p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {notes.map(n => (
          <div key={n.id} className="text-[11px] flex gap-2">
            <span className="text-slate-400 w-20 shrink-0">{n.note_date}</span>
            <span className={n.source === "client" ? "text-indigo-700" : "text-slate-600"}>
              {n.body}{n.author_name ? ` — ${n.author_name}` : ""}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} placeholder="Add a note..."
          onKeyDown={e => { if (e.key === "Enter" && input.trim()) { onAdd(input.trim()); setInput(""); } }}
          className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400" />
      </div>
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
