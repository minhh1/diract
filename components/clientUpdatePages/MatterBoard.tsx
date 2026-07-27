// components/clientUpdatePages/MatterBoard.tsx
// Shared, mode-aware renderer for a Client Update Page's matters -- used by
// both the authenticated admin editor (components/settings/ClientUpdatePagesTab.tsx)
// and the public page (app/public/updates/[slug]/page.tsx) when a logged-in
// staff member is viewing it. Two toggleable layouts (cards / spreadsheet)
// over the same data and the same callbacks; the caller decides what's
// actually editable via `canEdit`/`canComment` and supplies the callbacks
// that hit either the authenticated admin routes or the public PIN-gated
// routes -- this component has no opinion on which.
// All mutations are applied to local state immediately by the caller (see
// the optimistic wrappers in ClientUpdatePagesTab.tsx / the public page) --
// this component just renders whatever `items`/`groups` it's given.
"use client";

import { useState } from "react";
import { LayoutGrid, Table2, Trash2, X, MessageSquarePlus, Loader2, Plus } from "lucide-react";

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

export default function MatterBoard({
  groups, items, fields, canEdit, canComment,
  onSaveValue, onRenameGroup, onDeleteGroup, onAddGroup, onMoveItem, onRemoveItem, onAddNote, onAddMatter,
}: Props) {
  const [mode, setMode] = useState<"cards" | "spreadsheet">("cards");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const itemsFor = (groupId: string | null) => items.filter(i => i.group_id === groupId);
  const ungrouped = itemsFor(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
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

      {mode === "cards" ? (
        <div className="space-y-6">
          {groups.map(g => (
            <CardGroupSection key={g.id} group={g} items={itemsFor(g.id)} fields={fields} allGroups={groups}
              canEdit={canEdit} canComment={canComment}
              onRenameGroup={onRenameGroup} onDeleteGroup={onDeleteGroup}
              onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onSaveValue={onSaveValue} onAddNote={onAddNote}
              onAddMatter={onAddMatter ? () => onAddMatter(g.id) : undefined} />
          ))}
          <CardGroupSection group={null} items={ungrouped} fields={fields} allGroups={groups}
            canEdit={canEdit} canComment={canComment}
            onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onSaveValue={onSaveValue} onAddNote={onAddNote}
            onAddMatter={onAddMatter ? () => onAddMatter(null) : undefined} />

          {canEdit && onAddGroup && (
            showAddGroup ? (
              <div className="flex items-center gap-2">
                <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="Group name"
                  onKeyDown={e => { if (e.key === "Enter" && newGroupName.trim()) { onAddGroup(newGroupName.trim()); setNewGroupName(""); setShowAddGroup(false); } }}
                  autoFocus className="px-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400" />
                <button onClick={() => { if (newGroupName.trim()) { onAddGroup(newGroupName.trim()); setNewGroupName(""); setShowAddGroup(false); } }}
                  className="px-4 py-2.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full">Add</button>
                <button onClick={() => setShowAddGroup(false)} className="px-4 py-2.5 text-slate-400 text-[11px] font-bold">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowAddGroup(true)}
                className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-slate-200 rounded-full text-[11px] font-bold text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                <Plus size={14} /> Add group
              </button>
            )
          )}
        </div>
      ) : (
        <SpreadsheetView groups={groups} items={items} fields={fields} canEdit={canEdit}
          onSaveValue={onSaveValue} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} />
      )}
    </div>
  );
}

// ── Cards mode ───────────────────────────────────────────────────────

function CardGroupSection({ group, items, fields, allGroups, canEdit, canComment, onRenameGroup, onDeleteGroup, onMoveItem, onRemoveItem, onSaveValue, onAddNote, onAddMatter }: {
  group: MatterBoardGroup | null; items: MatterBoardItem[]; fields: MatterBoardField[]; allGroups: MatterBoardGroup[];
  canEdit: boolean; canComment: boolean;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onAddNote: (itemId: string, note: string) => void;
  onAddMatter?: () => void;
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
            onBlur={() => { setEditingName(false); if (nameDraft.trim() && onRenameGroup && group) onRenameGroup(group.id, nameDraft.trim()); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            autoFocus className="text-[11px] font-bold text-slate-500 uppercase tracking-widest bg-transparent border-b border-indigo-300 outline-none" />
        ) : (
          <p onClick={() => canEdit && group && setEditingName(true)} className={`text-[11px] font-bold text-slate-500 uppercase tracking-widest ${canEdit && group ? "cursor-pointer hover:text-indigo-600" : ""}`}>
            {group ? group.name : "Ungrouped"}
          </p>
        )}
        {canEdit && group && onDeleteGroup && <button onClick={() => onDeleteGroup(group.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><X size={12} /></button>}
        {canEdit && onAddMatter && <button onClick={onAddMatter} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 transition-colors">+ Add matter</button>}
      </div>

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-2xl">
            <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}>
              <p className="flex-1 text-[12px] font-medium text-slate-700">{item.matterName}</p>
              {canEdit && onMoveItem && (
                <select value={group?.id || ""} onChange={e => { e.stopPropagation(); onMoveItem(item.id, e.target.value || null); }} onClick={e => e.stopPropagation()}
                  className="text-[11px] border border-slate-200 rounded-full px-2.5 py-1 outline-none bg-white">
                  <option value="">Ungrouped</option>
                  {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              {canEdit && onRemoveItem && (
                <button onClick={e => { e.stopPropagation(); onRemoveItem(item.id); }} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
              )}
            </div>
            {expandedItem === item.id && (
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
        ))}
      </div>
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

// ── Spreadsheet mode ─────────────────────────────────────────────────

function SpreadsheetView({ groups, items, fields, canEdit, onSaveValue, onMoveItem, onRemoveItem }: {
  groups: MatterBoardGroup[]; items: MatterBoardItem[]; fields: MatterBoardField[]; canEdit: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
}) {
  const groupName = (id: string | null) => id ? (groups.find(g => g.id === id)?.name || "—") : "Ungrouped";

  return (
    <div className="overflow-x-auto bg-white border border-slate-200 rounded-[24px]">
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="text-left px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-white">Matter</th>
            <th className="text-left px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Group</th>
            {fields.map(f => (
              <th key={f.id} className="text-left px-4 py-3 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{f.label}</th>
            ))}
            {canEdit && onRemoveItem && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50">
              <td className="px-4 py-2 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white">{item.matterName}</td>
              <td className="px-4 py-2">
                {canEdit && onMoveItem ? (
                  <select value={item.group_id || ""} onChange={e => onMoveItem(item.id, e.target.value || null)}
                    className="text-[11px] border border-slate-200 rounded-full px-2 py-1 outline-none bg-white">
                    <option value="">Ungrouped</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                ) : groupName(item.group_id)}
              </td>
              {fields.map(f => (
                <SpreadsheetCell key={f.id} field={f} value={item.values[f.id]} editable={canEdit && !!onSaveValue}
                  onSave={v => onSaveValue?.(item.id, f.id, v)} />
              ))}
              {canEdit && onRemoveItem && (
                <td className="px-2 py-2">
                  <button onClick={() => onRemoveItem(item.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={fields.length + 3} className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">No matters</td></tr>
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
      <td className="px-2 py-1">
        <input autoFocus type={isDateField(field) ? "date" : "text"} value={draft ?? ""} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-32 px-2 py-1 border border-indigo-300 rounded-lg text-[12px] outline-none" />
      </td>
    );
  }
  return (
    <td onClick={() => editable && (setDraft(value ?? ""), setEditing(true))}
      className={`px-4 py-2 whitespace-nowrap text-slate-700 ${editable ? "cursor-text hover:bg-indigo-50/50" : ""}`}>
      {value == null || value === "" ? <span className="text-slate-300">—</span> : formatValue(value)}
    </td>
  );
}
