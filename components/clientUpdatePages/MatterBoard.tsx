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
// with counts, e.g. "In Progress"/"Settled"/"Terminated" -- defaults to just
// "In Progress" checked on first load of a group, since Status is shared
// across every group; checking none shows everything). A subgroup can
// either hold matters manually (drag in via the move dropdown) OR define a
// condition ("this select column equals this value") -- when a condition is
// set, membership is computed live from matter data instead of being
// dragged in. Below that, "Filters" is a separate, generic ad-hoc mechanism
// (add/remove any number of them): pick any visible field and check off
// which of its currently-present distinct values to show -- works for a
// select field or a free-text one like Matter Description alike, unlike
// Status/subgroups which are purpose-built for classification. A "Sort by"
// section (default one Settlement Date criterion when present, stackable
// with "+ Add sort") sits below that. Columns are shared across every
// top-level group by default (stable, predictable) -- a group only gets its
// own different columns once explicitly "customized" (and can be reverted
// back to shared at any time), see the fields/customize-columns routes. No
// column, including "Matter" itself, is pinned or special-cased by default
// -- every one is an ordinary, reorderable (drag or the column manager's
// up/down buttons), removable field; freezing the first column in
// spreadsheet mode is an explicit opt-in toggle, not automatic. Table
// styling (spreadsheet mode, the default view) matches
// app/public/tasks/[pageId]/page.tsx's task table.
"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { LayoutGrid, Table2, Trash2, X, MessageSquarePlus, Loader2, Plus, Pencil, Columns3, Calendar, UserPlus, Filter, GripVertical, History, Search, ArrowUp, ArrowDown, Sparkles, RotateCw, Eraser, ChevronUp, ChevronDown, ChevronRight, Pin, Mail } from "lucide-react";
import { DATE_FORMATS, formatDate } from "./dateFormat";
import AddMatterModal from "./AddMatterModal";
import ColumnManagerModal from "./ColumnManagerModal";
import GroupConditionModal from "./GroupConditionModal";
import ActivityLogModal from "./ActivityLogModal";
import CellHistoryPopover, { type CellLogEntry } from "./CellHistoryPopover";
import EntityOfficeholdersPanel from "./EntityOfficeholdersPanel";
import IrregularityFixPanel from "./IrregularityFixPanel";

export interface MatterBoardField { id: string; field_source: string; field_key: string; label: string; field_type?: string; select_options?: string[] | null; group_id?: string | null; }
export interface MatterBoardNote { id: string; note_date: string; body: string; author_name: string | null; source: "staff" | "client"; created_at?: string | null; property_id?: string | null; }
export interface MatterBoardEmail { id: string; subject: string | null; from_name: string | null; from_address: string | null; snippet: string | null; email_date: string; added_by_name: string | null; created_at?: string | null; }
export interface MatterBoardProperty { id: string; address: string | null; values: Record<string, any>; }
export interface MatterBoardItem { id: string; group_id: string | null; matterName: string; values: Record<string, any>; notes: MatterBoardNote[]; emails: MatterBoardEmail[]; properties?: MatterBoardProperty[]; ai_summary?: string | null; ai_summary_generated_at?: string | null; }
export interface MatterBoardGroup { id: string; name: string; parent_group_id: string | null; condition_field_id?: string | null; condition_value?: string | null; default_status_names?: string[] | null; }
export interface MatterBoardFormatRule { id: string; field_id: string; value: string; color: string; }

interface Props {
  pageId?: string; // required when canEdit -- backs Add matter / Manage columns / date format
  // 'entities' -- an entities-based page (see client_update_pages.base_table)
  // -- swaps a handful of "matter" copy strings for "entity" and shows the
  // Directors/Trust inline-expand section on each row instead of the
  // property split. Undefined/'projects' means today's matters-only board,
  // unchanged.
  baseTable?: "projects" | "entities" | "custom_table";
  // 'auto_fed' (see client_update_pages.page_kind) -- items are entirely
  // system-generated (e.g. Irregularities rows, from the auto_fed rule
  // engine), so Add/Remove are hidden and the row-expand area shows the
  // fix-this-field panel instead of Officeholders/Notes/Emails. Undefined/
  // 'user_dependent' means today's staff-managed board, unchanged. Distinct
  // from baseTable -- baseTable picks WHERE an item's data lives, pageKind
  // picks whether staff or the system owns adding/removing items.
  pageKind?: "user_dependent" | "auto_fed";
  groups: MatterBoardGroup[];
  items: MatterBoardItem[];
  fields: MatterBoardField[];
  formatRules: MatterBoardFormatRule[];
  dateFormat: string;
  freezeFirstColumn?: boolean;
  canEdit: boolean;
  canComment: boolean;
  onSaveValue?: (itemId: string, fieldId: string, value: any, propertyId: string | undefined, reason: string) => void;
  onFetchCellHistory: (itemId: string, fieldId: string) => Promise<CellLogEntry[]>;
  onRenameGroup?: (groupId: string, name: string) => void;
  onDeleteGroup?: (groupId: string) => void;
  onAddGroup?: (name: string, parentGroupId: string | null) => void;
  onSetGroupCondition?: (groupId: string, fieldId: string | null, value: string | null) => void;
  onAddFieldOption?: (fieldId: string, option: string) => Promise<void>;
  onSetDefaultStatusFilter?: (groupId: string, names: string[]) => void;
  onCustomizeColumns?: (groupId: string) => void;
  onRevertColumns?: (groupId: string) => Promise<void>;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddNote: (itemId: string, note: string, propertyId?: string) => void;
  onAddEmail?: (itemId: string, email: { subject: string; fromName: string; snippet: string; emailDate: string }) => void;
  onRemoveEmail?: (itemId: string, emailId: string) => void;
  onGenerateSummary?: (itemId: string) => Promise<void>;
  onSummarizeOpenMatters?: () => Promise<{ generated: number; skipped: number; failed: string[] }>;
  onClearSummaries?: () => Promise<number>;
  onRenameMatter?: (itemId: string, name: string) => void;
  onReorderFields?: (fieldIds: string[]) => void;
  onDataChanged?: () => void; // matters added / columns changed -- needs a full refetch
  onDateFormatChanged?: (format: string) => void;
  onFreezeFirstColumnChanged?: (freeze: boolean) => void;
  onAddFormatRule?: (fieldId: string, value: string, color: string) => void;
  onUpdateFormatRule?: (ruleId: string, patch: { fieldId?: string; value?: string; color?: string }) => void;
  onRemoveFormatRule?: (ruleId: string) => void;
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

// The Status-checkbox selection staff makes persists page-wide (as the
// group's own default_status_names, in the database -- see the groups
// PATCH route) for every viewer, staff and client alike. A CLIENT can
// still locally override it without changing that shared default or
// affecting any other viewer -- that override lives only here, in their
// own browser's localStorage. Persisted by subgroup NAME rather than id so
// it still resolves correctly if ids ever change. Keyed off the URL path
// (stable for both staff and client) + the top-level group id.
const statusPrefKey = (groupId: string) => `client_update_status_pref_${typeof window !== "undefined" ? window.location.pathname : ""}_${groupId}`;
function getSavedStatusNames(groupId: string): string[] | null {
  try {
    const raw = localStorage.getItem(statusPrefKey(groupId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveStatusNames(groupId: string, names: string[]) {
  try { localStorage.setItem(statusPrefKey(groupId), JSON.stringify(names)); } catch { /* ignore */ }
}

// Fixed swatch -> full, statically-written Tailwind class strings (never
// built dynamically, e.g. `bg-${color}-50` -- the JIT compiler only picks
// up classes it can see written out literally in source).
const FORMAT_COLORS: Record<string, { swatch: string; row: string; smRow: string; cardBg: string; border: string }> = {
  red: { swatch: "bg-red-400", row: "bg-red-50", smRow: "sm:bg-red-50", cardBg: "bg-red-50/40", border: "border-l-red-400" },
  amber: { swatch: "bg-amber-400", row: "bg-amber-50", smRow: "sm:bg-amber-50", cardBg: "bg-amber-50/40", border: "border-l-amber-400" },
  green: { swatch: "bg-emerald-400", row: "bg-emerald-50", smRow: "sm:bg-emerald-50", cardBg: "bg-emerald-50/40", border: "border-l-emerald-400" },
  blue: { swatch: "bg-blue-400", row: "bg-blue-50", smRow: "sm:bg-blue-50", cardBg: "bg-blue-50/40", border: "border-l-blue-400" },
  purple: { swatch: "bg-purple-400", row: "bg-purple-50", smRow: "sm:bg-purple-50", cardBg: "bg-purple-50/40", border: "border-l-purple-400" },
  slate: { swatch: "bg-slate-400", row: "bg-slate-100", smRow: "sm:bg-slate-100", cardBg: "bg-slate-100/40", border: "border-l-slate-400" },
};
const FORMAT_COLOR_KEYS = Object.keys(FORMAT_COLORS);

export default function MatterBoard({
  pageId, baseTable = "projects", pageKind = "user_dependent", groups, items, fields, formatRules, dateFormat, freezeFirstColumn, canEdit, canComment,
  onSaveValue, onFetchCellHistory, onRenameGroup, onDeleteGroup, onAddGroup, onSetGroupCondition, onAddFieldOption, onSetDefaultStatusFilter, onCustomizeColumns, onRevertColumns, onMoveItem, onRemoveItem, onAddNote, onAddEmail, onRemoveEmail, onGenerateSummary, onSummarizeOpenMatters, onClearSummaries, onRenameMatter, onReorderFields, onDataChanged, onDateFormatChanged, onFreezeFirstColumnChanged, onAddFormatRule, onUpdateFormatRule, onRemoveFormatRule,
}: Props) {
  const [mode, setMode] = useState<"cards" | "spreadsheet">("spreadsheet");
  const [activeTop, setActiveTop] = useState<string>(UNGROUPED);
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<{ fieldId: string; values: Set<string> }[]>([]);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sorts, setSorts] = useState<{ fieldId: string; dir: "asc" | "desc" }[]>([]);
  const [showAddMatter, setShowAddMatter] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [showDateFormat, setShowDateFormat] = useState(false);
  const [conditionGroupId, setConditionGroupId] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [summarizingAll, setSummarizingAll] = useState(false);
  // A staff value edit doesn't hit onSaveValue directly -- see
  // requestSaveValue below -- it stops here first so staff must give a
  // reason before the change actually saves and lands in the per-cell log
  // a client can see (CellHistoryPopover).
  const [pendingSave, setPendingSave] = useState<{ itemId: string; fieldId: string; fieldLabel: string; propertyId?: string; newValue: any } | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [historyTarget, setHistoryTarget] = useState<{ itemId: string; fieldId: string; fieldLabel: string; field: MatterBoardField } | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const summarizeOpenMatters = async () => {
    if (!onSummarizeOpenMatters || summarizingAll) return;
    setSummarizingAll(true);
    try {
      const result = await onSummarizeOpenMatters();
      const parts = [`Generated ${result.generated} summar${result.generated === 1 ? "y" : "ies"}`];
      if (result.failed.length) parts.push(`${result.failed.length} failed: ${result.failed.join(", ")}`);
      window.alert(parts.join(" — "));
    } finally {
      setSummarizingAll(false);
    }
  };

  const clearSummaries = async () => {
    if (!onClearSummaries || clearingAll) return;
    if (!window.confirm("Clear the AI summary from every matter on this page? This can't be undone, but they can be regenerated.")) return;
    setClearingAll(true);
    try {
      const cleared = await onClearSummaries();
      window.alert(`Cleared ${cleared} summar${cleared === 1 ? "y" : "ies"}`);
    } finally {
      setClearingAll(false);
    }
  };

  // Opens the reason prompt instead of saving straight away -- passed to
  // MatterCard/SpreadsheetView in place of onSaveValue, so ValueCell/
  // SpreadsheetCell's own commit() logic (only fires on a real change)
  // doesn't need to know anything changed about the flow.
  const requestSaveValue = (itemId: string, fieldId: string, value: any, propertyId?: string) => {
    const field = fields.find(f => f.id === fieldId);
    setReasonInput("");
    setPendingSave({ itemId, fieldId, propertyId, newValue: value, fieldLabel: field?.label || "this field" });
  };

  const confirmPendingSave = () => {
    if (!pendingSave || !reasonInput.trim() || !onSaveValue) return;
    onSaveValue(pendingSave.itemId, pendingSave.fieldId, pendingSave.newValue, pendingSave.propertyId, reasonInput.trim());
    setPendingSave(null);
  };

  const showCellHistory = (itemId: string, fieldId: string, fieldLabel: string) => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return;
    setHistoryTarget({ itemId, fieldId, fieldLabel, field });
  };

  const topGroups = groups.filter(g => !g.parent_group_id);
  const ungroupedCount = items.filter(i => !i.group_id).length;

  // The Group list's count is the "still open" count -- just In Progress +
  // Not Exchanged, not every matter regardless of status (Settled/
  // Terminated ones are done, and Unclassified is a data gap, so a bare
  // total was mostly noise once a group actually had matters winding down).
  // Falls back to the plain total for a group that hasn't set up either of
  // those subgroups yet, so a fresh group doesn't just show 0.
  const OPEN_STATUS_NAMES = new Set(["in progress", "not exchanged"]);
  const openStatusCountFor = (topId: string): number => {
    const subs = groups.filter(g => g.parent_group_id === topId && OPEN_STATUS_NAMES.has(g.name.trim().toLowerCase()));
    if (!subs.length) return items.filter(i => descendantOf(groups, i, topId)).length;
    return subs.reduce((sum, sg) => sum + (sg.condition_field_id
      ? items.filter(i => i.group_id === topId && String(i.values[sg.condition_field_id!] ?? "") === sg.condition_value).length
      : items.filter(i => i.group_id === sg.id).length
    ), 0);
  };

  const topOptions = [
    ...topGroups.map(g => ({ id: g.id, name: g.name, count: openStatusCountFor(g.id) })),
    ...(ungroupedCount > 0 || topGroups.length === 0 ? [{ id: UNGROUPED, name: "Ungrouped", count: ungroupedCount }] : []),
  ];

  useEffect(() => {
    if (!topOptions.some(t => t.id === activeTop)) setActiveTop(topOptions[0]?.id ?? UNGROUPED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topGroups.map(g => g.id).join(","), ungroupedCount]);

  const activeTopGroup = topGroups.find(g => g.id === activeTop) || null;
  const subGroups = activeTopGroup ? groups.filter(g => g.parent_group_id === activeTopGroup.id) : [];

  // A top-level group shows the shared column set (group_id IS NULL) by
  // default; it only diverges once explicitly customized (own group_id-
  // scoped rows exist), and can be reverted back to shared at any time --
  // see the fields route's header comment. Ungrouped always shows the
  // shared set (it can't diverge), and a subgroup always shows its parent
  // top-level group's columns.
  const hasCustomColumns = !!activeTopGroup && fields.some(f => f.group_id === activeTopGroup.id);
  const visibleFields = hasCustomColumns ? fields.filter(f => f.group_id === activeTopGroup!.id) : fields.filter(f => f.group_id === null);

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

  // Resolves subgroup NAMES (In Progress/Settled/Terminated) to this
  // group's own subgroup ids -- names, not ids, since a saved/default
  // selection needs to resolve consistently even though each group's
  // subgroups are separate rows with separate ids.
  const resolveStatusNames = (names: string[]): Set<string> => {
    const set = new Set(names.map(n => n.trim().toLowerCase()));
    return new Set(subGroups.filter(sg => set.has(sg.name.trim().toLowerCase())).map(sg => sg.id));
  };

  // Priority on first load of a group: the CLIENT's own saved override (if
  // they're a client and have one) > staff's page-wide default
  // (default_status_names, applies to every viewer) > auto-select
  // "In Progress" if nothing's ever been configured. Once the viewer
  // touches the checkboxes themselves that choice is left alone for the
  // rest of the session, same guarded-init pattern as sort/filters.
  const [statusInitialisedFor, setStatusInitialisedFor] = useState<string | null>(null);
  useEffect(() => {
    const groupKey = activeTopGroup?.id ?? UNGROUPED;
    if (statusInitialisedFor === groupKey) return;

    let initial: Set<string> | null = null;
    if (!canEdit && activeTopGroup) {
      const saved = getSavedStatusNames(activeTopGroup.id);
      if (saved) initial = resolveStatusNames(saved);
    }
    if (!initial && activeTopGroup?.default_status_names != null) {
      initial = resolveStatusNames(activeTopGroup.default_status_names);
    }
    if (!initial) {
      const inProgress = subGroups.find(sg => sg.name.trim().toLowerCase() === "in progress");
      initial = inProgress ? new Set([inProgress.id]) : new Set();
    }
    setSelectedStatuses(initial);
    setStatusInitialisedFor(groupKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTopGroup?.id, activeTopGroup?.default_status_names, canEdit, subGroups.map(g => g.id).join(",")]);

  // Ad-hoc filters reference a specific field id, which is only meaningful
  // within the active group's own visible columns -- reset on group change
  // for the same reason the status filter does.
  useEffect(() => {
    setFilters([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTop]);

  const toggleStatus = (id: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (activeTopGroup) {
        const names = subGroups.filter(sg => next.has(sg.id)).map(sg => sg.name);
        if (canEdit) onSetDefaultStatusFilter?.(activeTopGroup.id, names);
        else saveStatusNames(activeTopGroup.id, names);
      }
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

  // Distinct values are read from groupScopedItems (not the
  // progressively-narrowed result) so a filter's own checkbox list doesn't
  // shrink out from under the user as other filters/search/status change --
  // works for any field regardless of its declared type (a free-text field
  // like Matter Description just gets whatever distinct values are
  // currently present, not a fixed option list).
  const distinctValuesFor = (fieldId: string): string[] => {
    const vals = new Set<string>();
    for (const i of groupScopedItems) {
      const v = i.values[fieldId];
      if (v != null && v !== "") vals.add(String(v));
    }
    return [...vals].sort();
  };

  const filterFilteredItems = filters.reduce(
    (acc, f) => (f.values.size === 0 ? acc : acc.filter(i => f.values.has(String(i.values[f.fieldId] ?? "")))),
    statusFilteredItems
  );

  const addFilter = () => {
    const used = new Set(filters.map(f => f.fieldId));
    const next = visibleFields.find(f => !used.has(f.id));
    if (next) setFilters(prev => [...prev, { fieldId: next.id, values: new Set() }]);
  };
  const updateFilterField = (index: number, fieldId: string) => setFilters(prev => prev.map((f, i) => i === index ? { fieldId, values: new Set() } : f));
  const toggleFilterValue = (index: number, value: string) => setFilters(prev => prev.map((f, i) => {
    if (i !== index) return f;
    const next = new Set(f.values);
    if (next.has(value)) next.delete(value); else next.add(value);
    return { ...f, values: next };
  }));
  const removeFilter = (index: number) => setFilters(prev => prev.filter((_, i) => i !== index));

  // First matching rule wins (rules are ordered, top to bottom). A rule's
  // field_id is resolved to THIS group's own field with the same label
  // (see resolveRuleFieldId's comment) rather than compared directly --
  // formatting rules are page-wide, but each top-level group can have its
  // own differently-id'd copy of a same-named column once customized, so
  // comparing the raw id only ever matched whichever one group the rule
  // happened to be set on.
  const colorForItem = (item: MatterBoardItem): string | null => {
    for (const rule of formatRules) {
      const fieldId = resolveRuleFieldId(rule, fields, visibleFields);
      if (fieldId && String(item.values[fieldId] ?? "") === rule.value) return rule.color;
    }
    return null;
  };

  const addFormatRule = () => {
    if (!onAddFormatRule) return;
    const field = visibleFields[0];
    if (!field) return;
    const value = distinctValuesFor(field.id)[0];
    if (!value) return;
    onAddFormatRule(field.id, value, FORMAT_COLOR_KEYS[formatRules.length % FORMAT_COLOR_KEYS.length]);
  };

  const searchedItems = search.trim()
    ? filterFilteredItems.filter(i => {
        const q = search.trim().toLowerCase();
        if (i.matterName.toLowerCase().includes(q)) return true;
        return Object.values(i.values).some(v => v != null && String(v).toLowerCase().includes(q));
      })
    : filterFilteredItems;

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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={baseTable === "entities" ? "Search entities..." : "Search matters..."}
            className="flex-1 min-w-0 text-[12px] outline-none" />
          {search && <button onClick={() => setSearch("")} title="Clear search" className="text-slate-300 hover:text-slate-600 shrink-0"><X size={13} /></button>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {canEdit && pageId && (
            <>
              {pageKind !== "auto_fed" && (
                <button onClick={() => setShowAddMatter(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
                  <UserPlus size={13} /> {baseTable === "entities" ? "Add entities" : "Add matters"}
                </button>
              )}
              <button onClick={() => setShowColumns(true)} title="Manage columns"
                className="p-2 bg-white border border-slate-200 text-slate-500 rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                <Columns3 size={14} />
              </button>
              {onSummarizeOpenMatters && (
                <button onClick={summarizeOpenMatters} disabled={summarizingAll} title="Generate AI summaries for open matters with emails, that don't have one yet"
                  className="p-2 bg-white border border-slate-200 text-slate-500 rounded-full hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 transition-colors">
                  {summarizingAll ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                </button>
              )}
              {onClearSummaries && (
                <button onClick={clearSummaries} disabled={clearingAll} title="Clear all AI summaries on this page"
                  className="p-2 bg-white border border-slate-200 text-slate-500 rounded-full hover:border-red-300 hover:text-red-600 disabled:opacity-40 transition-colors">
                  {clearingAll ? <Loader2 size={14} className="animate-spin" /> : <Eraser size={14} />}
                </button>
              )}
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
          {mode === "spreadsheet" && onFreezeFirstColumnChanged && (
            <button onClick={() => onFreezeFirstColumnChanged(!freezeFirstColumn)} title="Freeze the first column"
              className={`p-2 border rounded-full transition-colors ${freezeFirstColumn ? "bg-indigo-50 border-indigo-200 text-indigo-600" : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300 hover:text-indigo-600"}`}>
              <Pin size={14} />
            </button>
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
            {canEdit && onAddGroup && <SidebarAddRow onAdd={name => onAddGroup(name, null)} />}
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

          <SidebarSection title="Filters">
            <div className="space-y-3">
              {filters.map((f, i) => {
                const usedElsewhere = new Set(filters.filter((_, j) => j !== i).map(x => x.fieldId));
                const options = distinctValuesFor(f.fieldId);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center gap-1">
                      <select value={f.fieldId} onChange={e => updateFilterField(i, e.target.value)}
                        className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-full text-[10px] outline-none bg-white">
                        {visibleFields.filter(vf => !usedElsewhere.has(vf.id) || vf.id === f.fieldId).map(vf => <option key={vf.id} value={vf.id}>{vf.label}</option>)}
                      </select>
                      <button onClick={() => removeFilter(i)} title="Remove filter" className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0"><X size={12} /></button>
                    </div>
                    <div className="pl-1 space-y-0.5 max-h-32 overflow-y-auto">
                      {options.length === 0 && <p className="text-[10px] text-slate-300 italic px-2 py-1">No values yet</p>}
                      {options.map(o => (
                        <label key={o} className="flex items-center gap-2 px-2 py-0.5 cursor-pointer">
                          <input type="checkbox" checked={f.values.has(o)} onChange={() => toggleFilterValue(i, o)} className="accent-indigo-600 shrink-0" />
                          <span className="text-[11px] text-slate-600 truncate">{o}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {filters.length < visibleFields.length && (
                <button onClick={addFilter}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[10px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                  <Plus size={11} /> Add filter
                </button>
              )}
            </div>
          </SidebarSection>

          {(formatRules.length > 0 || (canEdit && onAddFormatRule)) && (
            <SidebarSection title="Formatting">
              <div className="space-y-2">
                {formatRules.map(rule => {
                  const originalField = fields.find(f => f.id === rule.field_id);
                  const resolvedFieldId = resolveRuleFieldId(rule, fields, visibleFields);
                  const field = visibleFields.find(f => f.id === resolvedFieldId);
                  const options = field ? distinctValuesFor(field.id) : [];
                  return (
                    <div key={rule.id} className="space-y-1">
                      <div className="relative flex items-center gap-1">
                        <button onClick={() => canEdit && onUpdateFormatRule && setColorPickerFor(colorPickerFor === rule.id ? null : rule.id)}
                          title="Change colour" className={`w-4 h-4 rounded-full shrink-0 ${FORMAT_COLORS[rule.color]?.swatch || "bg-slate-300"}`} />
                        {canEdit && onUpdateFormatRule ? (
                          <select value={resolvedFieldId ?? ""} onChange={e => onUpdateFormatRule(rule.id, { fieldId: e.target.value, value: distinctValuesFor(e.target.value)[0] || "" })}
                            className="flex-1 min-w-0 px-2 py-1.5 border border-slate-200 rounded-full text-[10px] outline-none bg-white">
                            {!resolvedFieldId && <option value="">{originalField?.label || "?"} (not on this group)</option>}
                            {visibleFields.map(vf => <option key={vf.id} value={vf.id}>{vf.label}</option>)}
                          </select>
                        ) : (
                          <span className="flex-1 min-w-0 text-[11px] text-slate-600 truncate">{originalField?.label || "?"} = {rule.value}</span>
                        )}
                        {canEdit && onRemoveFormatRule && (
                          <button onClick={() => onRemoveFormatRule(rule.id)} title="Remove rule" className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0"><X size={12} /></button>
                        )}
                        {colorPickerFor === rule.id && onUpdateFormatRule && (
                          <div className="absolute top-full mt-1 left-6 bg-white border border-slate-200 rounded-2xl shadow-lg p-2 z-20 flex gap-1.5">
                            {FORMAT_COLOR_KEYS.map(c => (
                              <button key={c} onClick={() => { onUpdateFormatRule(rule.id, { color: c }); setColorPickerFor(null); }} title={c}
                                className={`w-5 h-5 rounded-full ${FORMAT_COLORS[c].swatch} ${rule.color === c ? "ring-2 ring-offset-1 ring-slate-400" : ""}`} />
                            ))}
                          </div>
                        )}
                      </div>
                      {/* Its own full-width row, not squeezed alongside the
                          Column select above -- two selects sharing one
                          narrow sidebar row left this one collapsed to just
                          a few px wide (the Column select's intrinsic width
                          is set by its longest label, e.g. "Balance of
                          Deposit Payment Date", which crowded this one out
                          entirely). */}
                      {canEdit && onUpdateFormatRule && (
                        <select value={rule.value} onChange={e => onUpdateFormatRule(rule.id, { value: e.target.value })}
                          className="w-full pl-6 pr-2 py-1.5 border border-slate-200 rounded-full text-[10px] outline-none bg-white">
                          {!options.includes(rule.value) && rule.value && <option value={rule.value}>{rule.value}</option>}
                          {options.length === 0 && <option value="">No values yet</option>}
                          {options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      )}
                    </div>
                  );
                })}
                {canEdit && onAddFormatRule && visibleFields.length > 0 && (
                  <button onClick={addFormatRule}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-[10px] font-bold hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                    <Plus size={11} /> Add rule
                  </button>
                )}
              </div>
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
                    <button onClick={() => removeSort(i)} title="Remove sort" className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0"><X size={12} /></button>
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
              {expandByProperty(visibleItems, propertyFieldIdsOf(visibleFields)).map(({ key, item, propertyId }) => (
                <MatterCard key={key} item={item} propertyId={propertyId} fields={visibleFields} dateFormat={dateFormat} moveOptions={moveOptions} canEdit={canEdit} canComment={canComment} color={colorForItem(item)} baseTable={baseTable} pageKind={pageKind} pageId={pageId}
                  onSaveValue={onSaveValue ? requestSaveValue : undefined} onShowHistory={showCellHistory} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onAddNote={onAddNote} onAddEmail={onAddEmail} onRemoveEmail={onRemoveEmail} onGenerateSummary={onGenerateSummary} onRenameMatter={onRenameMatter} />
              ))}
              {visibleItems.length === 0 && (
                <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">{baseTable === "entities" ? "No entities here yet" : "No matters here yet"}</p>
              )}
            </div>
          ) : (
            <SpreadsheetView items={visibleItems} fields={visibleFields} dateFormat={dateFormat} moveOptions={moveOptions} canEdit={canEdit} canComment={canComment} freezeFirstColumn={!!freezeFirstColumn} baseTable={baseTable} pageKind={pageKind} pageId={pageId} colorForItem={colorForItem}
              onSaveValue={onSaveValue ? requestSaveValue : undefined} onShowHistory={showCellHistory} onMoveItem={onMoveItem} onRemoveItem={onRemoveItem} onReorderFields={onReorderFields} onAddNote={onAddNote} onAddEmail={onAddEmail} onRemoveEmail={onRemoveEmail} />
          )}
        </div>
      </div>

      {showAddMatter && pageId && (
        <AddMatterModal pageId={pageId} groupId={addMatterTargetGroupId} baseTable={baseTable}
          onClose={() => setShowAddMatter(false)} onAdded={() => { setShowAddMatter(false); onDataChanged?.(); }} />
      )}
      {showColumns && pageId && (
        <ColumnManagerModal pageId={pageId} groupId={hasCustomColumns ? activeTopGroup!.id : null} currentFields={visibleFields}
          groupName={activeTopGroup?.name ?? null} isCustomized={hasCustomColumns}
          onCustomize={activeTopGroup && onCustomizeColumns ? () => onCustomizeColumns(activeTopGroup.id) : undefined}
          onRevert={activeTopGroup && onRevertColumns ? () => onRevertColumns(activeTopGroup.id) : undefined}
          onReorderFields={onReorderFields}
          onClose={() => setShowColumns(false)} onChanged={() => onDataChanged?.()} />
      )}
      {conditionGroup && onSetGroupCondition && (
        <GroupConditionModal groupName={conditionGroup.name} fields={selectFields}
          currentFieldId={conditionGroup.condition_field_id ?? null} currentValue={conditionGroup.condition_value ?? null}
          onSave={(fieldId, value) => { onSetGroupCondition(conditionGroup.id, fieldId, value); setConditionGroupId(null); }}
          onAddFieldOption={onAddFieldOption}
          onClose={() => setConditionGroupId(null)} />
      )}
      {showLogs && pageId && <ActivityLogModal pageId={pageId} onClose={() => setShowLogs(false)} />}
      {pendingSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setPendingSave(null); }}>
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-sm mx-4 p-8">
            <h3 className="text-[14px] font-bold text-slate-800">Why is {pendingSave.fieldLabel.toLowerCase()} changing?</h3>
            <p className="text-[11px] text-slate-400 mt-1">This is shown to the client alongside the change.</p>
            <textarea autoFocus value={reasonInput} onChange={e => setReasonInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmPendingSave(); } if (e.key === "Escape") setPendingSave(null); }}
              placeholder="e.g. Settlement pushed back by the vendor's bank"
              className="w-full mt-4 px-4 py-3 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" rows={3} />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => setPendingSave(null)} className="px-4 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-700 transition-colors">Cancel</button>
              <button onClick={confirmPendingSave} disabled={!reasonInput.trim()}
                className="px-5 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                Save change
              </button>
            </div>
          </div>
        </div>
      )}
      {historyTarget && (
        <CellHistoryPopover field={historyTarget.field} fieldLabel={historyTarget.fieldLabel} dateFormat={dateFormat}
          onFetch={() => onFetchCellHistory(historyTarget.itemId, historyTarget.fieldId)}
          onClose={() => setHistoryTarget(null)} />
      )}
    </div>
  );
}

// A formatting rule's field_id is snapshotted from whichever group was
// active when the rule's Column was set -- but rules are page-wide
// (client_update_page_format_rules has no group_id), and each top-level
// group can have its own differently-id'd copy of a same-named column
// (e.g. "Status") once customized -- see the customize-columns route.
// Comparing the raw id directly meant a rule only ever matched whichever
// ONE group it happened to be set on, and looked "unset" everywhere else;
// worse, editing it from a different group's Formatting panel could
// silently reassign field_id to that group's fields, breaking it for the
// original one. Resolves by label instead, against whichever group's own
// field list is passed in, so "Status = Terminated" applies consistently
// everywhere a same-named column exists.
function resolveRuleFieldId(rule: MatterBoardFormatRule, allFields: MatterBoardField[], groupFields: MatterBoardField[]): string | null {
  const original = allFields.find(f => f.id === rule.field_id);
  if (!original) return null;
  const matched = groupFields.find(f => f.label === original.label);
  return matched ? matched.id : null;
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

// A matter with 2+ linked properties (project_properties junction -- see
// lib/schema/systemTableRelations.ts's property_id entry) renders as one
// row/card per property instead of one for the whole matter -- Matter
// Number/name and every other (matter-level) field repeat identically
// across them, since it's still the same underlying matter; only fields
// that genuinely live on the property (Property Address, and any
// field_source: 'property' column -- see the fields route's header
// comment) differ per row, each pulling that specific property's own
// value. A single-property (or property-less) matter is unaffected --
// exactly one display row, same as before this existed. Filtering/
// sorting/grouping all still operate on the underlying items (one per
// matter) -- this only runs at the final render step, so it never has to
// reconcile two rows of the same matter landing in different filtered
// positions. `key` is distinct per row (item.id alone would collide) but
// value edits and notes/emails still key off item.id (the matter, via
// onSaveValue/onAddNote's itemId param) plus a separate propertyId, so a
// property-sourced field edited from one row only ever writes to that
// row's own property -- see the values/notes routes' handling of
// propertyId. Notes are filtered per row too: a note with no property_id
// (the default, and every note added before this existed) shows on every
// row of the matter; one tagged to a specific property only shows on that
// row.
function propertyFieldIdsOf(fields: MatterBoardField[]): string[] {
  return fields.filter(f => f.field_key === "property_address" || f.field_source === "property").map(f => f.id);
}

function expandByProperty(items: MatterBoardItem[], propertyFieldIds: string[]): { key: string; item: MatterBoardItem; propertyId: string | undefined }[] {
  return items.flatMap(item => {
    const props = item.properties || [];
    if (props.length <= 1) return [{ key: item.id, item, propertyId: props[0]?.id }];
    return props.map(p => ({
      key: `${item.id}::${p.id}`,
      propertyId: p.id,
      item: {
        ...item,
        values: propertyFieldIds.length ? { ...item.values, ...Object.fromEntries(propertyFieldIds.map(fid => [fid, p.values[fid] ?? null])) } : item.values,
        notes: item.notes.filter(n => n.property_id == null || n.property_id === p.id),
      },
    }));
  });
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
      {/* Always reserved at this width, even with nothing to show (e.g.
          Ungrouped, which has no rename/delete) -- otherwise a row without
          icons has nothing claiming this space, so its label/count sit
          further right than every sibling row that does have icons. */}
      <span className="flex items-center gap-0.5 pr-2 w-9 shrink-0 justify-end opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100">
        {canEdit && onRename && (
          <button onClick={() => { setDraft(label); setEditing(true); }} title="Rename" className="p-0.5 hover:opacity-70"><Pencil size={10} /></button>
        )}
        {canEdit && onDelete && (
          <button onClick={onDelete} title="Delete" className="p-0.5 hover:opacity-70"><X size={11} /></button>
        )}
      </span>
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
      {/* Same fixed-width reservation as SidebarRow's icon slot, for the
          same reason -- Unclassified (no rename/delete/condition) would
          otherwise sit misaligned against every real subgroup row. */}
      <span className="flex items-center gap-0.5 pl-1 w-[51px] shrink-0 justify-end opacity-100 lg:opacity-0 lg:group-hover/row:opacity-100">
        {canEdit && onOpenCondition && (
          <button onClick={onOpenCondition} title="Set condition" className="p-0.5 text-slate-400 hover:text-indigo-600"><Filter size={10} /></button>
        )}
        {canEdit && onRename && (
          <button onClick={() => { setDraft(label); setEditing(true); }} title="Rename" className="p-0.5 text-slate-400 hover:text-indigo-600"><Pencil size={10} /></button>
        )}
        {canEdit && onDelete && (
          <button onClick={onDelete} title="Delete" className="p-0.5 text-slate-400 hover:text-red-500"><X size={11} /></button>
        )}
      </span>
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

function MatterCard({ item, propertyId, fields, dateFormat, moveOptions, canEdit, canComment, color, baseTable, pageKind, pageId, onSaveValue, onShowHistory, onMoveItem, onRemoveItem, onAddNote, onAddEmail, onRemoveEmail, onGenerateSummary, onRenameMatter }: {
  item: MatterBoardItem; propertyId?: string; fields: MatterBoardField[]; dateFormat: string; moveOptions: { id: string | ""; label: string }[];
  canEdit: boolean; canComment: boolean; color: string | null; baseTable?: "projects" | "entities" | "custom_table"; pageKind?: "user_dependent" | "auto_fed"; pageId?: string;
  onSaveValue?: (itemId: string, fieldId: string, value: any, propertyId?: string) => void;
  onShowHistory?: (itemId: string, fieldId: string, fieldLabel: string) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onAddNote: (itemId: string, note: string, propertyId?: string) => void;
  onAddEmail?: (itemId: string, email: { subject: string; fromName: string; snippet: string; emailDate: string }) => void;
  onRemoveEmail?: (itemId: string, emailId: string) => void;
  onGenerateSummary?: (itemId: string) => Promise<void>;
  onRenameMatter?: (itemId: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(item.matterName);

  const generateSummary = async () => {
    if (!onGenerateSummary || generating) return;
    setGenerating(true);
    try { await onGenerateSummary(item.id); } finally { setGenerating(false); }
  };

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== item.matterName) onRenameMatter?.(item.id, trimmed);
  };

  const colorClasses = color ? FORMAT_COLORS[color] : null;

  return (
    <div className={`border rounded-2xl ${colorClasses ? `border-l-4 ${colorClasses.border} ${colorClasses.cardBg} border-y-slate-200 border-r-slate-200` : "bg-white border-slate-200"}`}>
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input value={titleDraft} onChange={e => setTitleDraft(e.target.value)} autoFocus onClick={e => e.stopPropagation()}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTitleDraft(item.matterName); setEditingTitle(false); } }}
              className="w-full px-2 -mx-2 py-0.5 border border-indigo-300 rounded-lg text-[12px] font-medium outline-none" />
          ) : (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700">
              <span className="truncate">{item.matterName}</span>
              {canEdit && onRenameMatter && (
                <button onClick={e => { e.stopPropagation(); setTitleDraft(item.matterName); setEditingTitle(true); }} title="Rename this card"
                  className="shrink-0 text-slate-300 hover:text-indigo-600 transition-colors"><Pencil size={10} /></button>
              )}
            </p>
          )}
          {item.ai_summary ? (
            <p className="flex items-start gap-1.5 mt-0.5 text-[11px] text-slate-400 italic">
              <span>{item.ai_summary}</span>
              {canEdit && onGenerateSummary && (
                <button onClick={e => { e.stopPropagation(); generateSummary(); }} disabled={generating} title="Regenerate summary"
                  className="shrink-0 not-italic text-slate-300 hover:text-indigo-600 disabled:opacity-40 transition-colors">
                  {generating ? <Loader2 size={10} className="animate-spin" /> : <RotateCw size={10} />}
                </button>
              )}
            </p>
          ) : canEdit && onGenerateSummary ? (
            <button onClick={e => { e.stopPropagation(); generateSummary(); }} disabled={generating}
              className="flex items-center gap-1 mt-0.5 text-[11px] text-indigo-500 hover:text-indigo-700 disabled:opacity-40 transition-colors">
              {generating ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              {generating ? "Summarising..." : "Summarise emails"}
            </button>
          ) : null}
        </div>
        {canEdit && onMoveItem && (
          <select value={item.group_id || ""} onChange={e => { e.stopPropagation(); onMoveItem(item.id, e.target.value || null); }} onClick={e => e.stopPropagation()}
            className="text-[11px] border border-slate-200 rounded-full px-2.5 py-1 outline-none bg-white">
            {moveOptions.map(o => <option key={o.id || "none"} value={o.id}>{o.label}</option>)}
          </select>
        )}
        {canEdit && onRemoveItem && (
          <button onClick={e => { e.stopPropagation(); onRemoveItem(item.id); }} title="Remove from this page" className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
        )}
      </div>
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {fields.map(f => (
              <ValueCell key={f.id} field={f} value={item.values[f.id]} dateFormat={dateFormat} editable={canEdit && !!onSaveValue}
                onSave={v => onSaveValue?.(item.id, f.id, v, propertyId)}
                onShowHistory={onShowHistory ? () => onShowHistory(item.id, f.id, f.label) : undefined} />
            ))}
          </div>
          {baseTable === "entities" && pageId && (
            <EntityOfficeholdersPanel pageId={pageId} itemId={item.id} canEdit={canEdit} />
          )}
          {pageKind === "auto_fed" && pageId && (
            <IrregularityFixPanel pageId={pageId} itemId={item.id} canEdit={canEdit} />
          )}
          <NotesPanel notes={item.notes} dateFormat={dateFormat} canComment={canComment} onAdd={note => onAddNote(item.id, note, propertyId)} />
          {baseTable !== "entities" && pageKind !== "auto_fed" && (
            <EmailsPanel emails={item.emails} dateFormat={dateFormat} canEdit={canEdit} onAdd={onAddEmail ? email => onAddEmail(item.id, email) : undefined} onRemove={onRemoveEmail ? emailId => onRemoveEmail(item.id, emailId) : undefined} />
          )}
        </div>
      )}
    </div>
  );
}

function ValueCell({ field, value, dateFormat, editable: editableProp, onSave, onShowHistory }: { field: MatterBoardField; value: any; dateFormat: string; editable: boolean; onSave: (v: any) => void; onShowHistory?: () => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const editable = editableProp && field.field_source !== "related_entity"; // read-only -- see values/route.ts

  const commit = () => { setEditing(false); if (draft !== (value ?? "")) onSave(draft === "" ? null : draft); };

  const labelRow = (
    <div className="flex items-center gap-1 mb-1">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{field.label}</p>
      {onShowHistory && (
        <button onClick={onShowHistory} title="See what changed" className="text-slate-300 hover:text-indigo-600 transition-colors"><History size={9} /></button>
      )}
    </div>
  );

  if (field.field_type === "select" && field.select_options?.length) {
    return (
      <div>
        {labelRow}
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
      {labelRow}
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

// note_date (a plain date, possibly backdated by staff -- see the notes
// POST route's noteDate param) supplies the DAY; created_at (the real
// moment it was saved, never backdated) supplies the TIME. Falls back to
// date-only if created_at isn't present (e.g. a stale cached note).
function formatNoteTimestamp(note: MatterBoardNote, dateFormat: string): string {
  const datePart = formatDate(note.note_date, dateFormat);
  if (!note.created_at) return datePart;
  const time = new Date(note.created_at);
  if (isNaN(time.getTime())) return datePart;
  return `${datePart}, ${time.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function NotesPanel({ notes, dateFormat, canComment, onAdd }: { notes: MatterBoardNote[]; dateFormat: string; canComment: boolean; onAdd: (note: string) => void }) {
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
            <span className="text-slate-400 w-32 shrink-0">{formatNoteTimestamp(n, dateFormat)}</span>
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
          <button onClick={submit} disabled={submitting || !input.trim()} title="Add note" className="p-1.5 text-indigo-600 hover:text-indigo-800 disabled:opacity-30 transition-colors shrink-0">
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquarePlus size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}

// Distinct from NotesPanel -- this is a structured, staff-only log of real
// email correspondence (subject/sender/date/summary) that also feeds
// lib/ai/matterEmailSummary.ts, not free-text commentary. The list itself
// is shown to everyone (same as staff-authored notes already are, on this
// client-facing page), but only staff (canEdit) can log or remove an entry
// -- there's no public API route for this, see the emails route's header.
function EmailsPanel({ emails, dateFormat, canEdit, onAdd, onRemove }: {
  emails: MatterBoardEmail[]; dateFormat: string; canEdit: boolean;
  onAdd?: (email: { subject: string; fromName: string; snippet: string; emailDate: string }) => void;
  onRemove?: (emailId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [snippet, setSnippet] = useState("");
  const [emailDate, setEmailDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!onAdd || (!subject.trim() && !snippet.trim())) return;
    setSubmitting(true);
    await onAdd({ subject: subject.trim(), fromName: fromName.trim(), snippet: snippet.trim(), emailDate });
    setSubject(""); setFromName(""); setSnippet(""); setEmailDate(new Date().toISOString().slice(0, 10));
    setSubmitting(false);
    setAdding(false);
  };

  return (
    <div className="border-t border-slate-100 pt-3 space-y-2">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Emails</p>
      {emails.length === 0 && <p className="text-[11px] text-slate-300 italic">No emails logged yet</p>}
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {emails.map(e => (
          <div key={e.id} className="group/email text-[11px] flex items-start gap-2">
            <span className="text-slate-400 w-24 shrink-0">{formatDate(e.email_date, dateFormat)}</span>
            <span className="flex-1 min-w-0 text-slate-600">
              {e.subject && <span className="font-medium">{e.subject}</span>}
              {e.from_name ? ` — ${e.from_name}` : ""}
              {e.snippet ? <span className="block text-slate-400 truncate">{e.snippet}</span> : null}
            </span>
            {canEdit && onRemove && (
              <button onClick={() => onRemove(e.id)} title="Remove this email" className="shrink-0 p-0.5 text-slate-300 opacity-0 group-hover/email:opacity-100 hover:text-red-500 transition-colors">
                <X size={11} />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && onAdd && (
        adding ? (
          <div className="space-y-1.5 border border-slate-200 rounded-xl p-2.5">
            <div className="flex items-center gap-1.5">
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" autoFocus
                className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none" />
              <input type="date" value={emailDate} onChange={e => setEmailDate(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none shrink-0" />
            </div>
            <input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="From"
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none" />
            <textarea value={snippet} onChange={e => setSnippet(e.target.value)} placeholder="Summary..." rows={2}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded-2xl text-[11px] outline-none resize-none" />
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setAdding(false)} className="text-[10px] font-bold text-slate-400">Cancel</button>
              <button onClick={submit} disabled={submitting || (!subject.trim() && !snippet.trim())}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-[10px] font-bold rounded-full disabled:opacity-40 transition-colors">
                {submitting && <Loader2 size={11} className="animate-spin" />} Log email
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 text-[11px] text-indigo-500 hover:text-indigo-700 transition-colors">
            <Mail size={12} /> Log an email
          </button>
        )
      )}
    </div>
  );
}

// ── Spreadsheet mode -- styled like app/public/tasks/[pageId]/page.tsx's
// task table (rounded white card, horizontal-only row separators, uppercase
// gray headers, row hover). No column is pinned by default -- "Matter" is
// just an ordinary (removable, reorderable) field like any other; a plain
// horizontally-scrolling table (custom-styled, always-visible scrollbar --
// see .matter-spreadsheet-scroll in globals.css -- so a mouse user can see
// there's more to scroll to). freezeFirstColumn is an explicit opt-in (see
// MatterBoard's toolbar Pin toggle) that sticks whichever field is
// currently first via CSS sticky + an opaque background + z-index on just
// that one cell per row -- the earlier always-on frozen column was a
// bigger frozen-panel construct that had an overlap bug on scroll; this is
// deliberately narrower in scope to avoid repeating that. The sticky
// styling only applies from the `sm:` breakpoint up -- on a touch/mobile
// viewport a sticky cell can swallow the horizontal swipe gesture that
// starts on it (a WebKit quirk with sticky elements inside a scrolling
// ancestor), which blocked scrolling entirely; below `sm:` the "frozen"
// column just behaves like every other column. A small chevron column at
// the very left (always sm:sticky at left-0, independent of
// freezeFirstColumn -- it's a UI control, not data) expands a row inline
// to show/add its notes, same as Cards mode -- when freezeFirstColumn is
// also on, the frozen field sits at left-8 instead of left-0 so the two
// sticky columns don't overlap. ─────────────────────────────────────────

function SpreadsheetView({ items, fields, dateFormat, moveOptions, canEdit, canComment, freezeFirstColumn, baseTable, pageKind, pageId, colorForItem, onSaveValue, onShowHistory, onMoveItem, onRemoveItem, onReorderFields, onAddNote, onAddEmail, onRemoveEmail }: {
  items: MatterBoardItem[]; fields: MatterBoardField[]; dateFormat: string; moveOptions: { id: string | ""; label: string }[]; canEdit: boolean; canComment: boolean;
  freezeFirstColumn: boolean; baseTable?: "projects" | "entities" | "custom_table"; pageKind?: "user_dependent" | "auto_fed"; pageId?: string;
  colorForItem: (item: MatterBoardItem) => string | null;
  onSaveValue?: (itemId: string, fieldId: string, value: any, propertyId?: string) => void;
  onShowHistory?: (itemId: string, fieldId: string, fieldLabel: string) => void;
  onMoveItem?: (itemId: string, groupId: string | null) => void;
  onRemoveItem?: (itemId: string) => void;
  onReorderFields?: (fieldIds: string[]) => void;
  onAddNote: (itemId: string, note: string, propertyId?: string) => void;
  onAddEmail?: (itemId: string, email: { subject: string; fromName: string; snippet: string; emailDate: string }) => void;
  onRemoveEmail?: (itemId: string, emailId: string) => void;
}) {
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverFieldId, setDragOverFieldId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const totalCols = fields.length + 1 + (canEdit && onMoveItem ? 1 : 0) + (canEdit && onRemoveItem ? 1 : 0);

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
    <div className="bg-white rounded-[24px] border border-slate-200 overflow-hidden overflow-x-auto matter-spreadsheet-scroll">
      <table className="w-full min-w-[760px] text-[13px]">
        <thead>
          <tr className="border-b border-slate-100 text-left">
            <th className="w-8 sm:sticky sm:left-0 sm:z-20 sm:bg-white" />
            {fields.map((f, i) => (
              <th key={f.id} draggable={canEdit && !!onReorderFields}
                onDragStart={() => setDraggedFieldId(f.id)}
                onDragOver={e => { e.preventDefault(); setDragOverFieldId(f.id); }}
                onDrop={() => handleColumnDrop(f.id)}
                onDragEnd={() => { setDraggedFieldId(null); setDragOverFieldId(null); }}
                className={`px-4 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap ${canEdit && onReorderFields ? "cursor-grab active:cursor-grabbing" : ""} ${dragOverFieldId === f.id ? "bg-indigo-50" : ""} ${freezeFirstColumn && i === 0 ? "sm:sticky sm:left-8 sm:z-20 sm:bg-white sm:border-r sm:border-slate-200" : ""}`}>
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
          {expandByProperty(items, propertyFieldIdsOf(fields)).map(({ key, item, propertyId }) => {
            const rowColor = colorForItem(item);
            const rowColorClasses = rowColor ? FORMAT_COLORS[rowColor] : null;
            const expanded = expandedId === item.id;
            return (
            <Fragment key={key}>
            <tr className={`border-b ${expanded ? "border-transparent" : "border-slate-50 last:border-0"} ${rowColorClasses ? rowColorClasses.row : "hover:bg-slate-50"}`}>
              <td className={`sm:sticky sm:left-0 sm:z-10 ${rowColorClasses?.smRow || "sm:bg-white"}`}>
                <button onClick={() => setExpandedId(expanded ? null : item.id)} title={expanded ? "Collapse" : "Expand for notes"}
                  className="flex items-center justify-center w-8 h-8 text-slate-300 hover:text-indigo-600 transition-colors">
                  <ChevronRight size={13} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
                </button>
              </td>
              {fields.map((f, i) => (
                <SpreadsheetCell key={f.id} field={f} value={item.values[f.id]} dateFormat={dateFormat} editable={canEdit && !!onSaveValue} frozen={freezeFirstColumn && i === 0} frozenBg={rowColorClasses?.smRow}
                  onSave={v => onSaveValue?.(item.id, f.id, v, propertyId)}
                  onShowHistory={onShowHistory ? () => onShowHistory(item.id, f.id, f.label) : undefined} />
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
                  <button onClick={() => onRemoveItem(item.id)} title="Remove from this page" className="p-1 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                </td>
              )}
            </tr>
            {expanded && (
              <tr className="border-b border-slate-50 last:border-0">
                <td colSpan={totalCols} className="px-6 pb-4 pt-1 bg-slate-50/50 space-y-3">
                  {baseTable === "entities" && pageId && (
                    <EntityOfficeholdersPanel pageId={pageId} itemId={item.id} canEdit={canEdit} />
                  )}
                  {pageKind === "auto_fed" && pageId && (
                    <IrregularityFixPanel pageId={pageId} itemId={item.id} canEdit={canEdit} />
                  )}
                  <NotesPanel notes={item.notes} dateFormat={dateFormat} canComment={canComment} onAdd={note => onAddNote(item.id, note, propertyId)} />
                  {baseTable !== "entities" && pageKind !== "auto_fed" && (
                    <EmailsPanel emails={item.emails} dateFormat={dateFormat} canEdit={canEdit} onAdd={onAddEmail ? email => onAddEmail(item.id, email) : undefined} onRemove={onRemoveEmail ? emailId => onRemoveEmail(item.id, emailId) : undefined} />
                  )}
                </td>
              </tr>
            )}
            </Fragment>
            );
          })}
          {items.length === 0 && (
            <tr><td colSpan={totalCols} className="px-4 py-10 text-center text-[12px] text-slate-300 italic">{baseTable === "entities" ? "No entities here yet" : "No matters here yet"}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SpreadsheetCell({ field, value, dateFormat, editable: editableProp, frozen, frozenBg, onSave, onShowHistory }: { field: MatterBoardField; value: any; dateFormat: string; editable: boolean; frozen?: boolean; frozenBg?: string; onSave: (v: any) => void; onShowHistory?: () => void }) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const editable = editableProp && field.field_source !== "related_entity"; // read-only -- see values/route.ts

  const commit = () => { setEditing(false); if (draft !== (value ?? "")) onSave(draft === "" ? null : draft); };
  // sm: prefixed -- see the header comment above SpreadsheetView for why
  // freezing only applies from that breakpoint up, never on a touch/mobile
  // viewport.
  // sm:left-8 (not left-0) -- the always-sticky expand-toggle column (see
  // SpreadsheetView) occupies left-0 first; this sits right after it.
  const frozenClass = frozen ? `sm:sticky sm:left-8 sm:z-10 sm:border-r sm:border-slate-200 ${frozenBg || "sm:bg-white"}` : "";

  const historyButton = onShowHistory && (
    <button onClick={e => { e.stopPropagation(); onShowHistory(); }} title="See what changed"
      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-indigo-600 transition-opacity shrink-0"><History size={10} /></button>
  );

  if (field.field_type === "select" && field.select_options?.length) {
    return (
      <td className={`group px-4 py-4 ${frozenClass}`}>
        <span className="inline-flex items-center gap-1.5">
          {editable ? (
            <select value={value ?? ""} onChange={e => onSave(e.target.value || null)}
              className="text-[12px] border border-slate-200 rounded-full px-2 py-1 outline-none bg-white">
              <option value="">—</option>
              {field.select_options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (value || "—")}
          {historyButton}
        </span>
      </td>
    );
  }

  if (editing) {
    return (
      <td className={`px-2 py-2 ${frozenClass}`}>
        <input autoFocus type={isDateField(field) ? "date" : "text"} value={draft ?? ""} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          className="w-full min-w-[140px] px-3 py-2 border border-indigo-300 rounded-full text-[12px] outline-none" />
      </td>
    );
  }
  return (
    <td onClick={() => editable && (setDraft(value ?? ""), setEditing(true))}
      className={`group px-4 py-4 whitespace-nowrap text-slate-600 ${editable ? "cursor-text hover:bg-indigo-50/50" : ""} ${frozenClass}`}>
      <span className="inline-flex items-center gap-1.5">
        {value == null || value === "" ? "—" : formatValue(value, field, dateFormat)}
        {historyButton}
      </span>
    </td>
  );
}
