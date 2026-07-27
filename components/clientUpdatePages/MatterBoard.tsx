// components/clientUpdatePages/MatterBoard.tsx
// Shared, mode-aware renderer for a Client Update Page's matters -- used by
// the public page (app/public/updates/[slug]/page.tsx) for both a logged-in
// staff member (full edit) and an anonymous PIN-gated client (read + note
// only). All page-level configuration (matters, groups, columns, date
// format) is edited right here -- Settings only manages the page itself
// (create/revoke/PIN), not its content.
//
// Groups are NEVER auto-derived from data -- purely user-created. Up to two
// levels, navigated from a left sidebar (search + filters live in the same
// spot as this company's Supabase Logs viewer, adapted to this app's light
// visual style): "Group" (top-level, single-select, e.g. "Conveyancing")
// stacked above "Status" (that group's sub-groups, multi-select checkboxes
// with counts, e.g. "In Progress"/"Settled"/"Terminated" -- checking none
// shows everything). A subgroup can either hold matters manually (drag in
// via the move dropdown) OR define a condition ("this select column equals
// this value") -- when a condition is set, membership is computed live
// from matter data instead of being dragged in. A "Sort by" section (default
// one Settlement Date criterion when present, stackable with "+ Add sort")
// sits below. Each top-level group has its own explicit column set (no
// column, including "Matter" itself, is pinned or special-cased -- every
// one is an ordinary, reorderable, removable field). Table styling
// (spreadsheet mode, the default view) matches
// app/public/tasks/[pageId]/page.tsx's task table.
"use client";

import { useState, useEffect, useMemo } from "react";
import { LayoutGrid, Table2, Trash2, X, MessageSquarePlus, Loader2, Plus, Pencil, Columns3, Calendar, UserPlus, Filter, GripVertical, History, Search, ArrowUp, ArrowDown } from "lucide-react";
import { DATE_FORMATS, formatDate } from "./dateFormat";
import AddMatterModal from "./AddMatterModal";
import ColumnManagerModal from "./ColumnManagerModal";
import GroupConditionModal from "./GroupConditionModal";
import ActivityLogModal from "./ActivityLogModal";

export interface MatterBoardField { id: string; field_source: string; field_key: string; label: string; field_type?: string; select_options?: string[] | null; group_id?: string | null; }
export interface MatterBoardNote { id: string; note_date: string; body: string; author_name: string | null; source: "staff" | "client"; }
export interface MatterBoardItem { id: string; group_id: string | null; matterName: string; values: Record<string, any>; notes: MatterBoardNote[]; }
export interface MatterBoardGroup { id: string; name: string; parent_group_id: string | null; condition_field_id?: string | null; condition_value?: string | null; }

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
  onAddGroup?: (name: string, parentGroupId: string | null, copyFieldsFromGroupId?: string | null) => void;
  onSetGroupCondition?: (groupId: string, fieldId: string | null, value: string | null) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddNote: (itemId: string, note: string) => void;
  onReorderFields?: (fieldIds: string[]) => void;
  onDataChanged?: () => void; // matters added / columns changed -- needs a full refetch
  onDateFormatChanged?: (format: string) => void;
}

function isDateField(field: MatterBoardField): boolean {
  return field.field_type === "date" || field.field_key.includes("date") || field.field_key === "estimated_completion_date";
}

function isCurrencyField(field: MatterBoardField): boolean {
  return field.field_type === "currency";
}

function formatValue(v: any, field: MatterBoardField, dateFormat: string): string {
  if (v == null || v === "") return "";
  if (isDateField(field) && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) return formatDate(String(v), dateFormat);
  if (isCurrencyField(field) && !isNaN(Number(v))) return `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

const UNGROUPED = "__ungrouped__";
const UNCLASSIFIED = "__unclassified__";
const MATTER_NAME_SORT = "__matter_name__";

export default function MatterBoard({
  pageId, groups, items, fields, dateFormat, canEdit, canComment,
  onSaveValue, onRenameGroup, onDeleteGroup, onAddGroup, onSetGroupCondition, onMoveItem, onRemoveItem, onAddNote, onReorderFields, onDataChanged, onDateFormatChanged,
}: Props) {
  const [mode, setMode] = useState<"cards" | "spreadsheet">("spreadsheet");
  const [activeTop, setActiveTop] = useState<string>(UNGROUPED);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sorts, setSorts] = useState<{ fieldId: string; dir: "asc" | "desc" }[]>([]);
  const [showAddMatter, setShowAddMatter] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showDateFormat, setShowDateFormat] = useState(false);
  const [conditionGroupId, setConditionGroupId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);

  const topGroups = groups.filter(g => !g.parent_group_id);
  const ungroupedCount = items.filter(i => !i.group_id).length;
  const topOptions = [
    ...topGroups.map(g => ({ id: g.id, name: g.name, count: items.filter(i => descendantOf(groups, i, g.id)).length })),
    ...(ungroupedCount > 0 || topGroups.length === 0 ? [{ id: UNGROUPED, name: "Ungrouped", count: ungroupedCount }] : []),
  ];

  useEffect(() => {
    if (!topOptions.some(t => t.id === activeTop)) setActiveTop(topOptions[0]?.id ?? UNGROUPED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topGroups.map(g => g.id).join(","), ungroupedCount]);

  const activeTopGroup = topGroups.find(g => g.id === activeTop) || null;
  const subGroups = activeTopGroup ? groups.filter(g => g.parent_group_id === activeTopGroup.id) : [];

  // Each top-level group has its own explicit column set (no shared
  // fallback -- see the migration comment); Ungrouped uses group_id IS NULL
  // fields, subgroups always show their parent's.
  const visibleFields = fields.filter(f => (f.group_id ?? null) === (activeTopGroup?.id ?? null));

  // Items conditionally claimed by one of this top group's subgroups don't
  // also count as unclassified.
  const matchedByCondition = new Set<string>();
  if (activeTopGroup) {
    for (const sg of subGroups) {
      if (!sg.condition_field_id) continue;
      for (const i of items) {
        if (i.group_id === activeTopGroup.id && String(i.values[sg.condition_field_id] ?? "") === sg.condition_value) matchedByCondition.add(i.id);
      }
    }
  }
  const unclassifiedItems = activeTopGroup ? items.filter(i => i.group_id === activeTopGroup.id && !matchedByCondition.has(i.id)) : [];
  const subgroupItems = (sg: MatterBoardGroup) => sg.condition_field_id
    ? items.filter(i => i.group_id === activeTopGroup!.id && String(i.values[sg.condition_field_id!] ?? "") === sg.condition_value)
    : items.filter(i => i.group_id === sg.id);

  const statusOptions = activeTopGroup
    ? [
        ...subGroups.map(g => ({ id: g.id, name: g.name, count: subgroupItems(g).length })),
        ...(unclassifiedItems.length > 0 ? [{ id: UNCLASSIFIED, name: "Unclassified", count: unclassifiedItems.length }] : []),
      ]
    : [];

  // Reset the status filter whenever the active group (or its subgroup set)
  // changes, so a stale selection from a different group's statuses can't
  // silently persist and hide everything.
  useEffect(() => {
    setSelectedStatuses(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTop, subGroups.map(g => g.id).join(",")]);

  const toggleStatus = (id: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // No group -> Ungrouped items. Otherwise: no status boxes checked shows
  // everything in the group (classified + unclassified); checked boxes
  // show only the union of what's checked.
  const groupScopedItems =
    activeTop === UNGROUPED ? items.filter(i => !i.group_id)
    : activeTopGroup ? [...unclassifiedItems, ...subGroups.flatMap(subgroupItems)]
    : [];

  const statusFilteredItems = selectedStatuses.size === 0 ? groupScopedItems : groupScopedItems.filter(i => {
    if (selectedStatuses.has(UNCLASSIFIED) && unclassifiedItems.includes(i)) return true;
    return subGroups.some(sg => selectedStatuses.has(sg.id) && subgroupItems(sg).includes(i));
  });

  const searchedItems = search.trim()
    ? statusFilteredItems.filter(i => {
        const q = search.trim().toLowerCase();
        if (i.matterName.toLowerCase().includes(q)) return true;
        return Object.values(i.values).some(v => v != null && String(v).toLowerCase().includes(q));
      })
    : statusFilteredItems;

  const sortOptions = [{ id: MATTER_NAME_SORT, label: "Matter" }, ...visibleFields.map(f => ({ id: f.id, label: f.label }))];
  // Defaults to a single Settlement Date criterion on first load of a group
  // that has one; once the user touches sorting that choice is left alone.
  // Re-runs per active group since each one's fields (and so its natural
  // default) can differ.
  const [sortInitialisedFor, setSortInitialisedFor] = useState<string | null>(null);
  useEffect(() => {
    const groupKey = activeTopGroup?.id ?? UNGROUPED;
    if (sortInitialisedFor === groupKey || !visibleFields.length) return;
    const settlementField = visibleFields.find(f => f.label.toLowerCase().includes("settlement date"));
    setSorts(settlementField ? [{ fieldId: settlementField.id, dir: "asc" }] : []);
    setSortInitialisedFor(groupKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopGroup?.id, visibleFields.length]);

  const compareOne = (a: MatterBoardItem, b: MatterBoardItem, fieldId: string): number => {
    if (fieldId === MATTER_NAME_SORT) return a.matterName.localeCompare(b.matterName);
    const av = a.values[fieldId];
    const bv = b.values[fieldId];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    const f = visibleFields.find(f => f.id === fieldId);
    if (f && (f.field_type === "number" || f.field_type === "currency")) return Number(av) - Number(bv);
    return String(av).localeCompare(String(bv));
  };

  const visibleItems = useMemo(() => {
    if (!sorts.length) return searchedItems;
    const compare = (a: MatterBoardItem, b: MatterBoardItem): number => {
      for (const s of sorts) {
        const r = compareOne(a, b, s.fieldId);
        if (r !== 0) return s.dir === "asc" ? r : -r;
      }
      return 0;
    };
    return [...searchedItems].sort(compare);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchedItems, sorts]);

  const addSort = () => {
    const used = new Set(sorts.map(s => s.fieldId));
    const next = sortOptions.find(o => !used.has(o.id));
    if (next) setSorts(prev => [...prev, { fieldId: next.id, dir: "asc" }]);
  };
  const updateSort = (index: number, patch: Partial<{ fieldId: string; dir: "asc" | "desc" }>) => {
    setSorts(prev => prev.map((s, i) => i === index ? { ...s, ...patch } : s));
  };
  const removeSort = (index: number) => setSorts(prev => prev.filter((_, i) => i !== index));

  // Flat, indented list of every MANUALLY-assignable group -- conditional
  // subgroups aren't offered here since dragging a matter into one wouldn't
  // do anything (its membership is computed from data, not group_id).
  const moveOptions: { id: string | ""; label: string }[] = [
    { id: "", label: "Ungrouped" },
    ...topGroups.flatMap(g => [
      { id: g.id, label: g.name },
      ...groups.filter(sg => sg.parent_group_id === g.id && !sg.condition_field_id).map(sg => ({ id: sg.id, label: `— ${sg.name}` })),
    ]),
  ];

  const addMatterTargetGroupId = activeTop === UNGROUPED ? null : activeTopGroup?.id ?? null;
  const conditionGroup = groups.find(g => g.id === conditionGroupId) || null;
  const selectFields = visibleFields.filter(f => f.field_type === "select");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[220px] flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-full">
          <Search size={14} className="text-slate-300 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search matters..."
            className="flex-1 min-w-0 text-[12px] outline-none" />
          {search && <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-600 shrink-0"><X size={13} /></button>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
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
              <button onClick={() => setShowLogs(true)} title="Activity log"
                className="p-2 bg-white border border-slate-200 text-slate-500 rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                <History size={14} />
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
      </div>

      <div className="flex flex-col lg:flex-row gap-5 items-start">
        <div className="w-full lg:w-52 lg:shrink-0 space-y-6">
          <SidebarSection title="Group">
            {topOptions.map(t => (
              <SidebarRow key={t.id} label={t.name} count={t.count} active={activeTop === t.id} onClick={() => setActiveTop(t.id)}
                canEdit={canEdit && t.id !== UNGROUPED}
                onRename={onRenameGroup ? name => onRenameGroup(t.id, name) : undefined}
                onDelete={onDeleteGroup ? () => onDeleteGroup(t.id) : undefined} />
            ))}
            {canEdit && onAddGroup && <SidebarAddRow onAdd={name => onAddGroup(name, null, activeTop === UNGROUPED ? null : activeTop)} />}
          </SidebarSection>

          {activeTopGroup && statusOptions.length > 0 && (
            <SidebarSection title="Status">
              {statusOptions.map(t => (
                <SidebarCheckboxRow key={t.id} label={t.name} count={t.count} checked={selectedStatuses.has(t.id)} onToggle={() => toggleStatus(t.id)}
                  canEdit={canEdit && t.id !== UNCLASSIFIED}
                  onRename={onRenameGroup ? name => onRenameGroup(t.id, name) : undefined}
                  onDelete={onDeleteGroup ? () => onDeleteGroup(t.id) : undefined}
                  onOpenCondition={onSetGroupCondition ? () => setConditionGroupId(t.id) : undefined} />
              ))}
              {canEdit && onAddGroup && <SidebarAddRow onAdd={name => onAddGroup(name, activeTopGroup.id)} />}
            </SidebarSection>
          )}

          <SidebarSection title="Sort by">
            <div className="space-y-1.5">
              {sorts.map((s, i) => {
                const usedElsewhere = new Set(sorts.filter((_, j) => j !== i).map(x => x.fieldId));
                return (
                  <div key={i} className="flex items-center gap-1">
                    <select value={s.fieldId} onChange={e => updateSort(i, { fieldId: e.target.value })}
                      className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-full text-[10px] outline-none bg-white">
                      {sortOptions.filter(o => !usedElsewhere.has(o.id) || o.id === s.fieldId).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                    <button onClick={() => updateSort(i, { dir: s.dir === "asc" ? "desc" : "asc" })} title={s.dir === "asc" ? "Ascending" : "Descending"}
                      className="p-1.5 border border-slate-200 rounded-full text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors shrink-0">
                      {s.dir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
                    </button>
                    <button onClick={() => removeSort(i)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0"><X size={12} /></button>
                  </div>
                );
              })}
              {sorts.length < sortOptions.length && (
                <button onClick={addSort}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[10px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  <Plus size={11} /> Add sort
                </button>
              )}
            </div>
          </SidebarSection>
        </div>

        <div className="w-full flex-1 min-w-0">
          {mode === "cards" ? (
            <div className="space-y-3">
              {visibleItems.map(item => (
                <MatterCard key={item.id} item={item} fields={visibleFields} dateFormat={dateFormat} moveOptions={moveOptions} canEdit={canEdit} canComment={canComment}
                  onSaveValue={onSaveValue} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onAddNote={onAddNote} />
              ))}
              {visibleItems.length === 0 && (
                <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">No matters here yet</p>
              )}
            </div>
          ) : (
            <SpreadsheetView items={visibleItems} fields={visibleFields} dateFormat={dateFormat} moveOptions={moveOptions} canEdit={canEdit}
              onSaveValue={onSaveValue} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onReorderFields={onReorderFields} />
          )}
        </div>
      </div>

      {showAddMatter && pageId && (
        <AddMatterModal pageId={pageId} groupId={addMatterTargetGroupId}
          onClose={() => setShowAddMatter(false)} onAdded={() => { setShowAddMatter(false); onDataChanged?.(); }} />
      )}
      {showColumns && pageId && (
        <ColumnManagerModal pageId={pageId} groupId={activeTop === UNGROUPED ? null : activeTopGroup?.id ?? null} currentFields={visibleFields}
          onClose={() => setShowColumns(false)} onChanged={() => onDataChanged?.()} />
      )}
      {conditionGroup && onSetGroupCondition && (
        <GroupConditionModal groupName={conditionGroup.name} fields={selectFields}
          currentFieldId={conditionGroup.condition_field_id ?? null} currentValue={conditionGroup.condition_value ?? null}
          onSave={(fieldId, value) => { onSetGroupCondition(conditionGroup.id, fieldId, value); setConditionGroupId(null); }}
          onClose={() => setConditionGroupId(null)} />
      )}
      {showLogs && pageId && <ActivityLogModal pageId={pageId} onClose={() => setShowLogs(false)} />}
    </div>
  );
}

// A matter belongs to a top-level group's count either directly (group_id
// === topId), via one of that top group's manual sub-groups, or via a
// conditional sub-group's condition matching.
function descendantOf(groups: MatterBoardGroup[], item: MatterBoardItem, topId: string): boolean {
  if (!item.group_id) return false;
  if (item.group_id === topId) return true;
  const g = groups.find(g => g.id === item.group_id);
  return g?.parent_group_id === topId;
}

// ── Sidebar (Group / Status / Sort) ─────────────────────────────────────

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarRow({ label, count, active, onClick, canEdit, onRename, onDelete }: {
  label: string; count: number; active: boolean; onClick: () => void; canEdit: boolean;
  onRename?: (name: string) => void; onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing) {
    return (
      <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
        onBlur={() => { setEditing(false); if (draft.trim() && onRename) onRename(draft.trim()); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
        className="w-full px-3 py-2 rounded-xl border border-indigo-300 outline-none text-[11px] font-medium" />
    );
  }

  return (
    <div className={`group/row flex items-center rounded-xl transition-colors ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
      <button onClick={onClick} className="flex-1 flex items-center justify-between px-3 py-2 text-[11px] font-medium text-left min-w-0">
        <span className="truncate">{label}</span>
        <span className={`shrink-0 ml-2 ${active ? "opacity-70" : "text-slate-400"}`}>{count}</span>
      </button>
      {canEdit && (onRename || onDelete) && (
        <span className="flex items-center gap-0.5 pr-2 shrink-0 opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100">
          {onRename && (
            <button onClick={() => { setDraft(label); setEditing(true); }} className="p-0.5 hover:opacity-70"><Pencil size={10} /></button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="p-0.5 hover:opacity-70"><X size={11} /></button>
          )}
        </span>
      )}
    </div>
  );
}

function SidebarCheckboxRow({ label, count, checked, onToggle, canEdit, onRename, onDelete, onOpenCondition }: {
  label: string; count: number; checked: boolean; onToggle: () => void; canEdit: boolean;
  onRename?: (name: string) => void; onDelete?: () => void; onOpenCondition?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(label);

  if (editing) {
    return (
      <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
        onBlur={() => { setEditing(false); if (draft.trim() && onRename) onRename(draft.trim()); }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(false); }}
        className="w-full px-3 py-2 rounded-xl border border-indigo-300 outline-none text-[11px] font-medium" />
    );
  }

  return (
    <div className="group/row flex items-center rounded-xl px-3 py-1.5 hover:bg-slate-50 transition-colors">
      <label className="flex-1 flex items-center gap-2 min-w-0 cursor-pointer">
        <input type="checkbox" checked={checked} onChange={onToggle} className="accent-indigo-600 shrink-0" />
        <span className="flex-1 text-[11px] text-slate-600 truncate">{label}</span>
        <span className="text-[10px] text-slate-400 shrink-0">{count}</span>
      </label>
      {canEdit && (onRename || onDelete || onOpenCondition) && (
        <span className="flex items-center gap-0.5 pl-1 shrink-0 opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100">
          {onOpenCondition && (
            <button onClick={onOpenCondition} title="Set condition" className="p-0.5 text-slate-400 hover:text-indigo-600"><Filter size={10} /></button>
          )}
          {onRename && (
            <button onClick={() => { setDraft(label); setEditing(true); }} className="p-0.5 text-slate-400 hover:text-indigo-600"><Pencil size={10} /></button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="p-0.5 text-slate-400 hover:text-red-500"><X size={11} /></button>
          )}
        </span>
      )}
    </div>
  );
}

function SidebarAddRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="flex items-center gap-1 pt-1">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" autoFocus
          onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setAdding(false); }}
          className="flex-1 min-w-0 px-3 py-1.5 border border-indigo-300 rounded-full text-[11px] outline-none" />
        <button onClick={submit} className="text-[10px] font-bold text-indigo-600 shrink-0">Add</button>
      </div>
    );
  }
  return (
    <button onClick={() => setAdding(true)}
      className="w-full flex items-center gap-1.5 px-3 py-1.5 mt-1 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[10px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-colors">
      <Plus size={11} /> Add
    </button>
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

  if (field.field_type === "select" && field.select_options?.length) {
    return (
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{field.label}</p>
        {editable ? (
          <select value={value ?? ""} onChange={e => onSave(e.target.value || null)}
            className="w-full px-2 py-1 border border-slate-200 rounded-lg text-[12px] outline-none bg-white">
            <option value="">—</option>
            {field.select_options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <p className="text-[12px] text-slate-700">{value || <span className="text-slate-300">—</span>}</p>
        )}
      </div>
    );
  }

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
// gray headers, row hover). No column is pinned -- "Matter" is just an
// ordinary (removable, reorderable) field like any other; a plain
// horizontally-scrolling table, which sidesteps the overlap bugs a
// CSS-sticky column had. ─────────────────────────────────────────────

function SpreadsheetView({ items, fields, dateFormat, moveOptions, canEdit, onSaveValue, onMoveItem, onRemoveItem, onReorderFields }: {
  items: MatterBoardItem[]; fields: MatterBoardField[]; dateFormat: string; moveOptions: { id: string | ""; label: string }[]; canEdit: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onReorderFields?: (fieldIds: string[]) => void;
}) {
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);

  const handleColumnDrop = (targetId: string) => {
    if (!draggedFieldId || draggedFieldId === targetId || !onReorderFields) { setDraggedFieldId(null); setDragOverFieldId(null); return; }
    const reordered = [...fields];
    const fromIdx = reordered.findIndex(f => f.id === draggedFieldId);
    const toIdx = reordered.findIndex(f => f.id === targetId);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDraggedFieldId(null); setDragOverFieldId(null);
    onReorderFields(reordered.map(f => f.id));
  };

  return (
    <div className="bg-white rounded-[24px] border border-slate-200 overflow-hidden overflow-x-auto">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            {fields.map(f => (
              <th key={f.id} draggable={canEdit && !!onReorderFields}
                onDragStart={() => setDraggedFieldId(f.id)}
                onDragOver={e => { e.preventDefault(); setDragOverFieldId(f.id); }}
                onDrop={() => handleColumnDrop(f.id)}
                onDragEnd={() => { setDraggedFieldId(null); setDragOverFieldId(null); }}
                className={`px-4 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap ${canEdit && onReorderFields ? "cursor-grab active:cursor-grabbing" : ""} ${dragOverFieldId === f.id ? "bg-indigo-50" : ""}`}>
                <span className="inline-flex items-center gap-1">
                  {canEdit && onReorderFields && <GripVertical size={10} className="text-slate-300" />}
                  {f.label}
                </span>
              </th>
            ))}
            {canEdit && onMoveItem && <th className="px-4 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Group</th>}
            {canEdit && onRemoveItem && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
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
            <tr><td colSpan={fields.length + 2} className="px-4 py-10 text-center text-[12px] text-slate-300 italic">No matters here yet</td></tr>
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

  if (field.field_type === "select" && field.select_options?.length) {
    return (
      <td className="px-4 py-4">
        {editable ? (
          <select value={value ?? ""} onChange={e => onSave(e.target.value || null)}
            className="text-[12px] border border-slate-200 rounded-full px-2 py-1 outline-none bg-white">
            <option value="">—</option>
            {field.select_options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (value || "—")}
      </td>
    );
  }

  if (editing) {
    return (
      <td className="px-2 py-2.5">
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
