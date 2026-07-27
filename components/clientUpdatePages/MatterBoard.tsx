// components/clientUpdatePages/MatterBoard.tsx
// Shared, mode-aware renderer for a Client Update Page's matters -- used by
// both the authenticated admin editor (components/settings/ClientUpdatePagesTab.tsx)
// and the public page (app/public/updates/[slug]/page.tsx) when a logged-in
// staff member is viewing it.
//
// Groups are NEVER auto-derived from data (not by client entity, not by
// anything structural) -- they're purely user-created, typically 3-4 of
// them, and navigated as a tab bar with counts, mirroring this company's
// existing "Tasks - Conveyancing" view (per-person pill tabs like
// "Hoang Chau (4)"). One tab is shown at a time; the Cards/Spreadsheet
// toggle controls how that tab's matters render, not which ones.
// All mutations are applied to local state immediately by the caller (see
// the optimistic wrappers in ClientUpdatePagesTab.tsx / the public page) --
// this component just renders whatever `items`/`groups` it's given.
"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, Table2, Trash2, X, MessageSquarePlus, Loader2, Plus, Pencil } from "lucide-react";

export interface MatterBoardField { id: string; field_source: string; field_key: string; label: string; }
export interface MatterBoardNote { id: string; note_date: string; body: string; author_name: string | null; source: "staff" | "client"; }
export interface MatterBoardItem { id: string; group_id: string | null; matterName: string; values: Record<string, any>; notes: MatterBoardNote[]; }
export interface MatterBoardGroup { id: string; name: string; }

interface Props {
  groups: MatterBoardGroup[];
  items: MatterBoardItem[];
  fields: MatterBoardField[];
  canEdit: boolean;
  canComment: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onAddGroup?: (name: string) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddNote: (itemId: string, note: string) => void;
  onAddMatter?: (groupId: string | null) => void;
}

function formatValue(v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

function isDateField(field: MatterBoardField): boolean {
  return field.field_key.includes("date") || field.field_key === "estimated_completion_date";
}

// Sentinel for the "Ungrouped" tab -- distinct from `null` used as a plain
// value so a tab id can round-trip through <button> handlers unambiguously.
const UNGROUPED = "__ungrouped__";

export default function MatterBoard({
  groups, items, fields, canEdit, canComment,
  onSaveValue, onRenameGroup, onDeleteGroup, onAddGroup, onMoveItem, onRemoveItem, onAddNote, onAddMatter,
}: Props) {
  const [mode, setMode] = useState<"cards" | "spreadsheet">("cards");
  const [activeTab, setActiveTab] = useState<string>(UNGROUPED);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingActiveName, setEditingActiveName] = useState(false);
  const [activeNameDraft, setActiveNameDraft] = useState("");

  const ungroupedCount = items.filter(i => !i.group_id).length;
  const tabs = [
    ...groups.map(g => ({ id: g.id, name: g.name, count: items.filter(i => i.group_id === g.id).length })),
    ...(ungroupedCount > 0 || groups.length === 0 ? [{ id: UNGROUPED, name: "Ungrouped", count: ungroupedCount }] : []),
  ];

  // Keep the active tab valid as groups/items change (e.g. the active
  // group got deleted, or this is the first render).
  useEffect(() => {
    if (!tabs.some(t => t.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? UNGROUPED);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map(g => g.id).join(","), ungroupedCount]);

  const activeItems = items.filter(i => (activeTab === UNGROUPED ? !i.group_id : i.group_id === activeTab));
  const activeGroup = groups.find(g => g.id === activeTab) || null;

  const submitAddGroup = () => {
    if (!newGroupName.trim() || !onAddGroup) return;
    onAddGroup(newGroupName.trim());
    setNewGroupName("");
    setAddingGroup(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 rounded-full text-[11px] font-bold transition-colors ${
                activeTab === t.id ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
              }`}>
              {t.name} ({t.count})
            </button>
          ))}
          {canEdit && onAddGroup && (
            addingGroup ? (
              <div className="flex items-center gap-1.5">
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name" autoFocus
                  onKeyDown={e => { if (e.key === "Enter") submitAddGroup(); if (e.key === "Escape") setAddingGroup(false); }}
                  className="px-3 py-1.5 border border-indigo-300 rounded-full text-[11px] outline-none w-32" />
                <button onClick={submitAddGroup} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">Add</button>
                <button onClick={() => setAddingGroup(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setAddingGroup(true)} title="Add group"
                className="p-2 rounded-full border border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                <Plus size={13} />
              </button>
            )
          )}
        </div>

        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1 shrink-0">
          <button onClick={() => setMode("cards")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${mode === "cards" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>
            <LayoutGrid size={12} /> Cards
          </button>
          <button onClick={() => setMode("spreadsheet")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${mode === "spreadsheet" ? "bg-white text-slate-800 shadow-sm" : "text-slate-400"}`}>
            <Table2 size={12} /> Spreadsheet
          </button>
        </div>
      </div>

      {canEdit && activeGroup && (
        <div className="flex items-center gap-2">
          {editingActiveName ? (
            <input value={activeNameDraft} onChange={e => setActiveNameDraft(e.target.value)} autoFocus
              onBlur={() => { setEditingActiveName(false); if (activeNameDraft.trim() && onRenameGroup) onRenameGroup(activeGroup.id, activeNameDraft.trim()); }}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              className="text-[11px] font-bold text-slate-500 bg-transparent border-b border-indigo-300 outline-none" />
          ) : (
            <button onClick={() => { setActiveNameDraft(activeGroup.name); setEditingActiveName(true); }}
              className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors">
              <Pencil size={10} /> Rename
            </button>
          )}
          {onDeleteGroup && (
            <button onClick={() => onDeleteGroup(activeGroup.id)}
              className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors">
              <Trash2 size={10} /> Delete group
            </button>
          )}
          {onAddMatter && (
            <button onClick={() => onAddMatter(activeGroup.id)} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">
              + Add matter
            </button>
          )}
        </div>
      )}
      {canEdit && !activeGroup && onAddMatter && (
        <button onClick={() => onAddMatter(null)} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">
          + Add matter
        </button>
      )}

      {mode === "cards" ? (
        <div className="space-y-3">
          {activeItems.map(item => (
            <MatterCard key={item.id} item={item} fields={fields} groups={groups} canEdit={canEdit} canComment={canComment}
              onSaveValue={onSaveValue} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onAddNote={onAddNote} />
          ))}
          {activeItems.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">No matters here yet</p>
          )}
        </div>
      ) : (
        <SpreadsheetView items={activeItems} fields={fields} groups={groups} canEdit={canEdit}
          onSaveValue={onSaveValue} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} />
      )}
    </div>
  );
}

// ── Cards mode ───────────────────────────────────────────────────────

function MatterCard({ item, fields, groups, canEdit, canComment, onSaveValue, onMoveItem, onRemoveItem, onAddNote }: {
  item: MatterBoardItem; fields: MatterBoardField[]; groups: MatterBoardGroup[]; canEdit: boolean; canComment: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddNote: (itemId: string, note: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <p className="flex-1 text-[12px] font-medium text-slate-700">{item.matterName}</p>
        {canEdit && onMoveItem && groups.length > 0 && (
          <select value={item.group_id || ""} onChange={e => { e.stopPropagation(); onMoveItem(item.id, e.target.value || null); }} onClick={e => e.stopPropagation()}
            className="text-[11px] border border-slate-200 rounded-full px-2.5 py-1 outline-none bg-white">
            <option value="">Ungrouped</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        {canEdit && onRemoveItem && (
          <button onClick={e => { e.stopPropagation(); onRemoveItem(item.id); }} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
        )}
      </div>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fields.map(f => (
              <ValueCell key={f.id} field={f} value={item.values[f.id]} editable={canEdit && !!onSaveValue}
                onSave={v => onSaveValue?.(item.id, f.id, v)} />
            ))}
          </div>
          <NotesPanel notes={item.notes} canComment={canComment} onAdd={note => onAddNote(item.id, note)} />
        </div>
      )}
    </div>
  );
}

function ValueCell({ field, value, editable, onSave }: { field: MatterBoardField; value: any; editable: boolean; onSave: (v: any) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  const commit = () => { setEditing(false); if (draft !== (value ?? "")) onSave(draft === "" ? null : draft); };

  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{field.label}</p>
      {editing ? (
        <input autoFocus type={isDateField(field) ? "date" : "text"} value={draft ?? ""} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-full px-2 py-1 border border-indigo-300 rounded-lg text-[12px] outline-none" />
      ) : (
        <p onClick={() => editable && (setDraft(value ?? ""), setEditing(true))}
          className={`text-[12px] text-slate-700 rounded px-1 -mx-1 min-h-[18px] ${editable ? "cursor-text hover:bg-slate-50" : ""}`}>
          {value == null || value === "" ? <span className="text-slate-300">—</span> : formatValue(value)}
        </p>
      )}
    </div>
  );
}

function NotesPanel({ notes, canComment, onAdd }: { notes: MatterBoardNote[]; canComment: boolean; onAdd: (note: string) => void }) {
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!input.trim()) return;
    setSubmitting(true);
    await onAdd(input.trim());
    setInput("");
    setSubmitting(false);
  };

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Notes</p>
      {notes.length === 0 && <p className="text-[11px] text-slate-300 italic">No notes yet</p>}
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
      {canComment && (
        <div className="flex items-center gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Add a note..."
            onKeyDown={e => { if (e.key === "Enter") submit(); }}
            className="flex-1 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400" />
          <button onClick={submit} disabled={submitting || !input.trim()} className="p-1.5 text-indigo-600 hover:text-indigo-800 disabled:opacity-30 transition-colors shrink-0">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Spreadsheet mode -- a dense grid, like the source Excel report ────

function SpreadsheetView({ items, fields, groups, canEdit, onSaveValue, onMoveItem, onRemoveItem }: {
  items: MatterBoardItem[]; fields: MatterBoardField[]; groups: MatterBoardGroup[]; canEdit: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
}) {
  return (
    <div className="overflow-x-auto bg-white border border-slate-300 rounded-lg">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-300">
            <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-r border-slate-200 sticky left-0 bg-slate-50 whitespace-nowrap">Matter</th>
            {fields.map(f => (
              <th key={f.id} className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-r border-slate-200 whitespace-nowrap">{f.label}</th>
            ))}
            {canEdit && onMoveItem && groups.length > 0 && <th className="text-left px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-wide border-r border-slate-200 whitespace-nowrap">Group</th>}
            {canEdit && onRemoveItem && <th className="w-8 border-slate-200" />}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} className={`border-b border-slate-200 ${idx % 2 === 1 ? "bg-slate-50/40" : ""} hover:bg-indigo-50/30`}>
              <td className="px-3 py-1.5 font-medium text-slate-700 whitespace-nowrap border-r border-slate-100 sticky left-0 bg-inherit">{item.matterName}</td>
              {fields.map(f => (
                <SpreadsheetCell key={f.id} field={f} value={item.values[f.id]} editable={canEdit && !!onSaveValue}
                  onSave={v => onSaveValue?.(item.id, f.id, v)} />
              ))}
              {canEdit && onMoveItem && groups.length > 0 && (
                <td className="px-2 py-1 border-r border-slate-100">
                  <select value={item.group_id || ""} onChange={e => onMoveItem(item.id, e.target.value || null)}
                    className="text-[11px] border border-slate-200 rounded-full px-2 py-0.5 outline-none bg-white">
                    <option value="">Ungrouped</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </td>
              )}
              {canEdit && onRemoveItem && (
                <td className="px-2 py-1">
                  <button onClick={() => onRemoveItem(item.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={fields.length + 3} className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">No matters here yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SpreadsheetCell({ field, value, editable, onSave }: { field: MatterBoardField; value: any; editable: boolean; onSave: (v: any) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  const commit = () => { setEditing(false); if (draft !== (value ?? "")) onSave(draft === "" ? null : draft); };

  if (editing) {
    return (
      <td className="px-1.5 py-1 border-r border-slate-100">
        <input autoFocus type={isDateField(field) ? "date" : "text"} value={draft ?? ""} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-32 px-2 py-1 border border-indigo-300 rounded text-[12px] outline-none" />
      </td>
    );
  }
  return (
    <td onClick={() => editable && (setDraft(value ?? ""), setEditing(true))}
      className={`px-3 py-1.5 whitespace-nowrap text-slate-700 border-r border-slate-100 ${editable ? "cursor-text hover:bg-indigo-50/50" : ""}`}>
      {value == null || value === "" ? <span className="text-slate-300">—</span> : formatValue(value)}
    </td>
  );
}
