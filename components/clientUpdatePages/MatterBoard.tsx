// components/clientUpdatePages/MatterBoard.tsx
// Shared, mode-aware renderer for a Client Update Page's matters -- used by
// the public page (app/public/updates/[slug]/page.tsx) for both a logged-in
// staff member (full edit) and an anonymous PIN-gated client (read + note
// only). All page-level configuration (matters, groups, columns, date
// format) is edited right here -- Settings only manages the page itself
// (create/revoke/PIN), not its content.
//
// Groups are NEVER auto-derived from data -- purely user-created, and
// navigated as pill tabs with counts (mirroring this company's existing
// "Tasks - Conveyancing" per-person tabs). Up to two levels: a top-level
// group (e.g. "Conveyancing") can itself contain sub-groups (e.g. "In
// Progress"/"Settled"/"Terminated"), shown as a second tab row beneath the
// first when present. Table styling (spreadsheet mode) matches
// app/public/tasks/[pageId]/page.tsx's task table.
"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, Table2, Trash2, X, MessageSquarePlus, Loader2, Plus, Pencil, Columns3, Calendar, UserPlus } from "lucide-react";
import { DATE_FORMATS, formatDate } from "./dateFormat";
import AddMatterModal from "./AddMatterModal";
import ColumnManagerModal from "./ColumnManagerModal";

export interface MatterBoardField { id: string; field_source: string; field_key: string; label: string; }
export interface MatterBoardNote { id: string; note_date: string; body: string; author_name: string | null; source: "staff" | "client"; }
export interface MatterBoardItem { id: string; group_id: string | null; matterName: string; values: Record<string, any>; notes: MatterBoardNote[]; }
export interface MatterBoardGroup { id: string; name: string; parent_group_id: string | null; }

interface Props {
  pageId?: string; // required when canEdit -- backs Add matter / Manage columns / date format
  groups: MatterBoardGroup[];
  items: MatterBoardItem[];
  fields: MatterBoardField[];
  dateFormat: string;
  canEdit: boolean;
  canComment: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onAddGroup?: (name: string, parentGroupId: string | null) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddNote: (itemId: string, note: string) => void;
  onDataChanged?: () => void; // matters added / columns changed -- needs a full refetch
  onDateFormatChanged?: (format: string) => void;
}

function isDateField(field: MatterBoardField): boolean {
  return field.field_key.includes("date") || field.field_key === "estimated_completion_date";
}

function formatValue(v: any, field: MatterBoardField, dateFormat: string): string {
  if (v == null || v === "") return "";
  if (isDateField(field) && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return formatDate(String(v), dateFormat);
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

const UNGROUPED = "__ungrouped__";
const DIRECT = "__direct__";

export default function MatterBoard({
  pageId, groups, items, fields, dateFormat, canEdit, canComment,
  onSaveValue, onRenameGroup, onDeleteGroup, onAddGroup, onMoveItem, onRemoveItem, onAddNote, onDataChanged, onDateFormatChanged,
}: Props) {
  const [mode, setMode] = useState<"cards" | "spreadsheet">("cards");
  const [activeTop, setActiveTop] = useState<string>(UNGROUPED);
  const [activeSub, setActiveSub] = useState<string>(DIRECT);
  const [showAddMatter, setShowAddMatter] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showDateFormat, setShowDateFormat] = useState(false);

  const topGroups = groups.filter(g => !g.parent_group_id);
  const ungroupedCount = items.filter(i => !i.group_id).length;
  const topTabs = [
    ...topGroups.map(g => ({ id: g.id, name: g.name, count: items.filter(i => descendantOf(groups, i.group_id, g.id)).length })),
    ...(ungroupedCount > 0 || topGroups.length === 0 ? [{ id: UNGROUPED, name: "Ungrouped", count: ungroupedCount }] : []),
  ];

  useEffect(() => {
    if (!topTabs.some(t => t.id === activeTop)) setActiveTop(topTabs[0]?.id ?? UNGROUPED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topGroups.map(g => g.id).join(","), ungroupedCount]);

  const activeTopGroup = topGroups.find(g => g.id === activeTop) || null;
  const subGroups = activeTopGroup ? groups.filter(g => g.parent_group_id === activeTopGroup.id) : [];
  const directCount = activeTopGroup ? items.filter(i => i.group_id === activeTopGroup.id).length : 0;
  const subTabs = activeTopGroup
    ? [
        ...(directCount > 0 || subGroups.length === 0 ? [{ id: DIRECT, name: "General", count: directCount }] : []),
        ...subGroups.map(g => ({ id: g.id, name: g.name, count: items.filter(i => i.group_id === g.id).length })),
      ]
    : [];

  useEffect(() => {
    if (!activeTopGroup) return;
    if (!subTabs.some(t => t.id === activeSub)) setActiveSub(subTabs[0]?.id ?? DIRECT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTop, subGroups.map(g => g.id).join(",")]);

  const visibleGroupId: string | null =
    activeTop === UNGROUPED ? null
    : activeSub && activeSub !== DIRECT ? activeSub
    : activeTop;

  const visibleItems = items.filter(i => (visibleGroupId === null ? !i.group_id : i.group_id === visibleGroupId));

  // Flat, indented list of every group a matter can be moved to.
  const moveOptions: { id: string | ""; label: string }[] = [
    { id: "", label: "Ungrouped" },
    ...topGroups.flatMap(g => [
      { id: g.id, label: g.name },
      ...groups.filter(sg => sg.parent_group_id === g.id).map(sg => ({ id: sg.id, label: `— ${sg.name}` })),
    ]),
  ];

  const addMatterTargetGroupId = visibleGroupId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <TabRow tabs={topTabs} active={activeTop} onSelect={setActiveTop} canEdit={canEdit}
          onAdd={canEdit && onAddGroup ? name => onAddGroup(name, null) : undefined}
          onRename={onRenameGroup} onDelete={onDeleteGroup} />

        <div className="flex items-center gap-2">
          {canEdit && pageId && (
            <>
              <button onClick={() => setShowAddMatter(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
                <UserPlus size={13} /> Add matters
              </button>
              <button onClick={() => setShowColumns(true)} title="Manage columns"
                className="p-2 bg-white border border-slate-200 text-slate-500 rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                <Columns3 size={14} />
              </button>
              <div className="relative">
                <button onClick={() => setShowDateFormat(v => !v)} title="Date format"
                  className="p-2 bg-white border border-slate-200 text-slate-500 rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  <Calendar size={14} />
                </button>
                {showDateFormat && (
                  <div className="absolute right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-lg p-1.5 z-20 w-40">
                    {DATE_FORMATS.map(f => (
                      <button key={f.value} onClick={() => { onDateFormatChanged?.(f.value); setShowDateFormat(false); }}
                        className={`w-full text-left px-3 py-2 rounded-xl text-[11px] transition-colors ${dateFormat === f.value ? "bg-indigo-50 text-indigo-700 font-bold" : "text-slate-600 hover:bg-slate-50"}`}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
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
      </div>

      {activeTopGroup && (
        <TabRow small tabs={subTabs} active={activeSub} onSelect={setActiveSub} canEdit={canEdit}
          onAdd={canEdit && onAddGroup ? name => onAddGroup(name, activeTopGroup.id) : undefined}
          onRename={onRenameGroup} onDelete={onDeleteGroup} excludeFromEdit={new Set([DIRECT])} />
      )}

      {mode === "cards" ? (
        <div className="space-y-3">
          {visibleItems.map(item => (
            <MatterCard key={item.id} item={item} fields={fields} dateFormat={dateFormat} moveOptions={moveOptions} canEdit={canEdit} canComment={canComment}
              onSaveValue={onSaveValue} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onAddNote={onAddNote} />
          ))}
          {visibleItems.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">No matters here yet</p>
          )}
        </div>
      ) : (
        <SpreadsheetView items={visibleItems} fields={fields} dateFormat={dateFormat} moveOptions={moveOptions} canEdit={canEdit}
          onSaveValue={onSaveValue} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} />
      )}

      {showAddMatter && pageId && (
        <AddMatterModal pageId={pageId} groupId={addMatterTargetGroupId}
          onClose={() => setShowAddMatter(false)} onAdded={() => { setShowAddMatter(false); onDataChanged?.(); }} />
      )}
      {showColumns && pageId && (
        <ColumnManagerModal pageId={pageId} currentFields={fields}
          onClose={() => setShowColumns(false)} onChanged={() => onDataChanged?.()} />
      )}
    </div>
  );
}

// A matter belongs to a top-level tab's count either directly (group_id ===
// topId) or via one of that top group's sub-groups.
function descendantOf(groups: MatterBoardGroup[], itemGroupId: string | null, topId: string): boolean {
  if (!itemGroupId) return false;
  if (itemGroupId === topId) return true;
  const g = groups.find(g => g.id === itemGroupId);
  return g?.parent_group_id === topId;
}

// ── Tab row (shared by top-level and sub-level) ────────────────────────

function TabRow({ tabs, active, onSelect, canEdit, onAdd, onRename, onDelete, small, excludeFromEdit }: {
  tabs: { id: string; name: string; count: number }[];
  active: string;
  onSelect: (id: string) => void;
  canEdit: boolean;
  onAdd?: (name: string) => void;
  onRename?: (groupId: string, name: string) => void;
  onDelete?: (groupId: string) => void;
  small?: boolean;
  excludeFromEdit?: Set<string>;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const submitAdd = () => {
    if (!newName.trim() || !onAdd) return;
    onAdd(newName.trim());
    setNewName("");
    setAdding(false);
  };

  const nonEditable = excludeFromEdit || new Set([UNGROUPED]);

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tabs.map(t => {
        const isActive = active === t.id;
        const editable = canEdit && isActive && !nonEditable.has(t.id) && (onRename || onDelete);
        if (editingId === t.id) {
          return (
            <input key={t.id} value={editDraft} onChange={e => setEditDraft(e.target.value)} autoFocus
              onBlur={() => { setEditingId(null); if (editDraft.trim() && onRename) onRename(t.id, editDraft.trim()); }}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingId(null); }}
              className={`px-3.5 py-2 rounded-full border border-indigo-300 outline-none ${small ? "text-[10px]" : "text-[11px]"} font-bold w-32`} />
          );
        }
        return (
          <div key={t.id} className={`flex items-center rounded-full transition-colors ${isActive ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"}`}>
            <button onClick={() => onSelect(t.id)}
              className={`${small ? "px-3 py-1.5 text-[10px]" : "px-3.5 py-2 text-[11px]"} font-bold`}>
              {t.name} ({t.count})
            </button>
            {editable && (
              <span className="flex items-center gap-0.5 pr-2">
                {onRename && (
                  <button onClick={() => { setEditDraft(t.name); setEditingId(t.id); }} className="p-0.5 opacity-70 hover:opacity-100"><Pencil size={10} /></button>
                )}
                {onDelete && (
                  <button onClick={() => onDelete(t.id)} className="p-0.5 opacity-70 hover:opacity-100"><X size={11} /></button>
                )}
              </span>
            )}
          </div>
        );
      })}
      {canEdit && onAdd && (
        adding ? (
          <div className="flex items-center gap-1.5">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Group name" autoFocus
              onKeyDown={e => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") setAdding(false); }}
              className={`px-3 py-1.5 border border-indigo-300 rounded-full ${small ? "text-[10px]" : "text-[11px]"} outline-none w-28`} />
            <button onClick={submitAdd} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">Add</button>
            <button onClick={() => setAdding(false)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} title="Add group"
            className={`${small ? "p-1.5" : "p-2"} rounded-full border border-dashed border-slate-200 text-slate-400 hover:border-indigo-300 hover:text-indigo-600 transition-colors`}>
            <Plus size={small ? 11 : 13} />
          </button>
        )
      )}
    </div>
  );
}

// ── Cards mode ───────────────────────────────────────────────────────

function MatterCard({ item, fields, dateFormat, moveOptions, canEdit, canComment, onSaveValue, onMoveItem, onRemoveItem, onAddNote }: {
  item: MatterBoardItem; fields: MatterBoardField[]; dateFormat: string; moveOptions: { id: string | ""; label: string }[];
  canEdit: boolean; canComment: boolean;
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
        {canEdit && onMoveItem && (
          <select value={item.group_id || ""} onChange={e => { e.stopPropagation(); onMoveItem(item.id, e.target.value || null); }} onClick={e => e.stopPropagation()}
            className="text-[11px] border border-slate-200 rounded-full px-2.5 py-1 outline-none bg-white">
            {moveOptions.map(o => <option key={o.id || "none"} value={o.id}>{o.label}</option>)}
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
              <ValueCell key={f.id} field={f} value={item.values[f.id]} dateFormat={dateFormat} editable={canEdit && !!onSaveValue}
                onSave={v => onSaveValue?.(item.id, f.id, v)} />
            ))}
          </div>
          <NotesPanel notes={item.notes} canComment={canComment} onAdd={note => onAddNote(item.id, note)} />
        </div>
      )}
    </div>
  );
}

function ValueCell({ field, value, dateFormat, editable, onSave }: { field: MatterBoardField; value: any; dateFormat: string; editable: boolean; onSave: (v: any) => void }) {
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
          {value == null || value === "" ? <span className="text-slate-300">—</span> : formatValue(value, field, dateFormat)}
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

// ── Spreadsheet mode -- styled like app/public/tasks/[pageId]/page.tsx's
// task table (rounded white card, horizontal-only row separators, uppercase
// gray headers, row hover) with a working sticky Matter column. ─────────

function SpreadsheetView({ items, fields, dateFormat, moveOptions, canEdit, onSaveValue, onMoveItem, onRemoveItem }: {
  items: MatterBoardItem[]; fields: MatterBoardField[]; dateFormat: string; moveOptions: { id: string | ""; label: string }[]; canEdit: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
}) {
  return (
    <div className="bg-white rounded-[24px] border border-slate-200 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="px-4 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[220px] sticky left-0 bg-white z-10">Matter</th>
            {fields.map(f => (
              <th key={f.id} className="px-4 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">{f.label}</th>
            ))}
            {canEdit && onMoveItem && <th className="px-4 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Group</th>}
            {canEdit && onRemoveItem && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 group">
              <td className="px-4 py-4 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white group-hover:bg-slate-50 z-10">{item.matterName}</td>
              {fields.map(f => (
                <SpreadsheetCell key={f.id} field={f} value={item.values[f.id]} dateFormat={dateFormat} editable={canEdit && !!onSaveValue}
                  onSave={v => onSaveValue?.(item.id, f.id, v)} />
              ))}
              {canEdit && onMoveItem && (
                <td className="px-4 py-4">
                  <select value={item.group_id || ""} onChange={e => onMoveItem(item.id, e.target.value || null)}
                    className="text-[11px] border border-slate-200 rounded-full px-2 py-1 outline-none bg-white">
                    {moveOptions.map(o => <option key={o.id || "none"} value={o.id}>{o.label}</option>)}
                  </select>
                </td>
              )}
              {canEdit && onRemoveItem && (
                <td className="px-4 py-4">
                  <button onClick={() => onRemoveItem(item.id)} className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                </td>
              )}
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={fields.length + 3} className="px-4 py-10 text-center text-[12px] text-slate-300 italic">No matters here yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SpreadsheetCell({ field, value, dateFormat, editable, onSave }: { field: MatterBoardField; value: any; dateFormat: string; editable: boolean; onSave: (v: any) => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  const commit = () => { setEditing(false); if (draft !== (value ?? "")) onSave(draft === "" ? null : draft); };

  if (editing) {
    return (
      <td className="px-2 py-2">
        <input autoFocus type={isDateField(field) ? "date" : "text"} value={draft ?? ""} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-32 px-2 py-1.5 border border-indigo-300 rounded-full text-[12px] outline-none" />
      </td>
    );
  }
  return (
    <td onClick={() => editable && (setDraft(value ?? ""), setEditing(true))}
      className={`px-4 py-4 whitespace-nowrap text-slate-600 ${editable ? "cursor-text hover:bg-indigo-50/50" : ""}`}>
      {value == null || value === "" ? "—" : formatValue(value, field, dateFormat)}
    </td>
  );
}
