"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Loader2, X, Check, Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PILL_SIZE_CLASSES, type PillSize } from "@/lib/dashboardWidgets/pillSize";
import NewEntityModal from "@/components/NewEntityModal";
import NewPropertyModal from "@/components/NewPropertyModal";
import NewProjectModal from "@/components/NewProjectModal";
import NewRecordModal, { pickCreateFields } from "@/components/dashboard/NewRecordModal";
import { createRecord } from "@/lib/services/customTableService";
import type { CustomTableField } from "@/lib/hooks/useCustomTable";
import { getStaffScopeIds } from "@/lib/teamScope";

interface RelationOption {
  id: string;
  label: string;
  // Lowercased blob of every field this option can be matched against
  // (display field(s) + configured search fields) -- absent on options that
  // were resolved individually rather than through the full candidate list
  // (e.g. a single already-selected value's label), which never need it.
  searchText?: string;
  // entities only -- set when this option's entities.roles includes a
  // trustee-type role. Drives the "acting as trustee for this?" capacity
  // prompt in selectOption below -- never part of label/searchText, purely
  // a selection-time signal.
  hasTrusteeRole?: boolean;
}

// The two role values that make an entity a trustee -- kept in sync with
// components/NewEntityModal.tsx's own TRUSTEE_ROLE_TYPES (not shared/
// imported since that file is client-creation-form-specific and this one is
// a much more widely reused primitive; a fixed 2-item list is cheap to keep
// duplicated).
const TRUSTEE_ROLE_TYPES = ['Corporate Trustee', 'Non Corporate Trustee'];

// Sentinel filterValue set by FieldConfigPanel when an admin restricts a
// relation to "Signed-in user only" -- there's no static value to type in
// for "whoever is signed in", so it's resolved to the real auth uid here at
// query time instead.
export const CURRENT_USER_SENTINEL = '$current_user';

// Sentinel filterValue for a role-aware "Staff" relation: a company admin
// can bill as anyone (sees every Staff entity), everyone else can only bill
// as themselves -- see lib/teamScope.ts. Unlike $current_user this CAN
// resolve to many rows (for an admin), so it's handled as
// an `.in('id', ...)` restriction rather than a single `.eq()`, and it
// always implies `entity_type = 'Staff'` on top (this sentinel only makes
// sense for a Staff-typed field) -- that companion filter is what actually
// fixes a picker showing non-staff entities (e.g. property-owning
// companies) even for an admin, who gets no id restriction at all.
export const TEAM_SCOPE_SENTINEL = '$team_scope';

// Module-level (not per-component) dedup + short-lived cache for the two
// mount-time fetches below (label resolution, "signed-in user" auto-select).
// A dashboard commonly renders the SAME field (e.g. Staff) in more than one
// widget at once -- the filter bar and the quick-add form both mount their
// own RelationPicker for it -- and with no sharing between instances, each
// independently fires the identical request the moment it mounts (confirmed
// live: two concurrent, byte-for-byte identical queries for one page load).
// `inFlight` collapses concurrent callers onto one real request; `cache`
// then serves the same key again for a short window after -- e.g.
// navigating back to a dashboard right after leaving it, or two widgets
// that don't happen to mount in the exact same tick. 30s: long enough to
// cover realistic mount timing and quick re-navigation, short enough that
// something like a newly-linked team member doesn't stay stale for long.
// Deliberately NOT used for the search-on-open query below -- that's a
// direct user action that should always hit fresh data, not a mount-time
// stampede.
const CACHE_TTL_MS = 30_000;
// The full candidate-list cache (see fetchAllSystemTableOptions/
// fetchAllOptions below) gets a much longer TTL than label/auto-select
// lookups above -- it's meant to survive from page load (see
// warmRelationOptionsCache, called once from CompanyContext on sign-in)
// until whenever the user actually opens a picker, not just cover a mount-
// time stampede. 5 minutes: long enough that "open the site, work for a
// bit, then search a Matter" still hits warm cache; short enough that a
// matter created minutes ago in another tab shows up on the next natural
// refetch instead of staying invisible all session.
const OPTIONS_CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();
const inFlight = new Map<string, Promise<unknown>>();

function dedupedFetch<T>(key: string, fetcher: () => Promise<T>, ttlMs: number = CACHE_TTL_MS): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value as T);
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = fetcher()
    .then(value => {
      inFlight.delete(key);
      // Prune expired entries here rather than on a timer -- cache stays
      // small in practice (a handful of relation fields per dashboard) so
      // this is cheap, and it means no cleanup interval to leak/forget.
      const now = Date.now();
      for (const [k, v] of cache) if (v.expiresAt <= now) cache.delete(k);
      cache.set(key, { value, expiresAt: now + ttlMs });
      return value;
    })
    .catch(err => { inFlight.delete(key); throw err; });
  inFlight.set(key, promise);
  return promise;
}

async function resolveFilterValue(filterValue: string | null | undefined): Promise<string | null> {
  // $team_scope resolves to MANY rows for the candidate LIST (see
  // getStaffScopeIds), but for "whose own row auto-selects" specifically,
  // that always means the signed-in user's own -- same operation
  // $current_user already does, and a team leader/admin still wants
  // themselves picked as the sensible default, same as everyone else.
  if (filterValue !== CURRENT_USER_SENTINEL && filterValue !== TEAM_SCOPE_SENTINEL) return filterValue ?? null;
  // Keyed on nothing but "current user" -- every field needing this shares
  // one cached/in-flight lookup regardless of which table/filter it's for.
  return dedupedFetch('current-user-id', async () => {
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  });
}

interface Props {
  // Exactly one of these identifies the target — a system table (entities/
  // projects/properties) or a sibling custom table.
  linkedSystemTable?: string | null;
  linkedTableId?: string | null;
  displayField?: string | null; // system-table column to search/show, default 'name'
  // Optional second field combined onto every label as "<displayField> —
  // <displayField2>" (e.g. "260586 — Onsell Contract - Dahlia by Azure Lot
  // 35" combining a Matter Number custom field with the matter's Project
  // Name) -- same format as displayField for a system-table target (native
  // column, or 'cf:<company_custom_fields.id>'); for a custom-table target
  // (linkedTableId), a field_key on that table's own company_table_fields.
  // Configured per-field in components/schema/FieldConfigPanel.tsx.
  displayField2?: string | null;
  // Extra fields to match the search query against, besides displayField --
  // native column names, or 'cf:<company_custom_fields.id>' for a custom
  // field (e.g. Matter Number on projects). System table only. Configured
  // per-field in components/schema/FieldConfigPanel.tsx.
  searchFieldKeys?: string[] | null;
  // Restricts results to rows where this native column equals this value
  // (e.g. entity_type = 'Staff'). System table only. Never applied when
  // resolving the *current* value's label, so an out-of-filter selection
  // still displays correctly.
  filterColumn?: string | null;
  filterValue?: string | null;
  // Required in single-select mode (the default); unused when `multiple` is
  // true, so optional here rather than forcing every multi-select caller to
  // pass a no-op.
  value?: string | null;
  // 3rd arg (capacity) is additive -- every existing caller ignoring it is
  // unaffected. Only set (non-null) for linkedSystemTable="entities" when
  // the picked entity holds a trustee role and the user answered the
  // capacity prompt below with "Acting as trustee" -- 'Trustee' string, or
  // null for "plain/primary capacity, nothing changes" (see selectOption).
  onSelect?: (id: string | null, label: string | null, capacity?: string | null) => void;
  // Multi-select mode (field.allow_multiple) -- renders every selected
  // option as a removable chip instead of one label, and clicking an option
  // in the dropdown toggles it instead of selecting-and-closing. Reuses this
  // component's existing search/options fetching untouched (it's shape-
  // agnostic); only selection state and rendering branch on this. `value`/
  // `onSelect` above are ignored when true -- use `values`/`onSelectMulti`
  // instead. Kept as a second prop pair rather than overloading value's type
  // to string | string[], so every existing single-select caller (the vast
  // majority) needs zero changes.
  multiple?: boolean;
  values?: string[];
  onSelectMulti?: (ids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
  // Already-resolved label for `value`, when the caller has one (e.g. a
  // grid row's CustomTableRecord.displayValues, batched once per relation
  // field for the whole record set -- see resolveRelationLabels in
  // lib/hooks/useCustomTable.ts). When given, skips this component's own
  // per-instance label fetch entirely -- without it, a grid of N rows each
  // mounting their own RelationPicker independently re-fetches the same
  // label N times over, which at real volume (hundreds/thousands of rows)
  // floods the browser with concurrent requests until it starts failing
  // with ERR_INSUFFICIENT_RESOURCES (confirmed on a 1000-row trust ledger
  // grid). Only ever used to seed the initial label -- if `value` changes
  // later without a matching prop update, the normal fetch path resolves it.
  initialLabel?: string;
  // Seeds the "as trustee" affordance the same way initialLabel seeds the
  // label -- 'Trustee' when this value was picked/saved with that capacity
  // (see supabase/migrations/20260729430000_relation_value_capacity.sql),
  // null/undefined otherwise. Single-select, linkedSystemTable="entities"
  // only; ignored everywhere else.
  initialCapacity?: string | null;
  // Visual size (padding/text) -- see lib/dashboardWidgets/pillSize.ts.
  // Undefined means 'md', the size every existing caller already renders at.
  size?: PillSize;
  // 'plain' (DashboardGrid only) drops the rounded pill chrome for a flat
  // spreadsheet-cell look, and suppresses the closed/empty "Select..."
  // fallback text -- see FieldValueInput's Variant doc comment. Undefined
  // means 'pill', what every existing caller already renders at.
  variant?: 'pill' | 'plain';
  // Single-select + linkedSystemTable="entities" only -- adds a pinned
  // "+ Add new entity" row at the bottom of the dropdown that opens
  // NewEntityModal inline (same onRefresh-wraps-onSelect precedent
  // UniversalSelectionModal already uses) and auto-selects the newly
  // created entity. Opt-in per caller (e.g. CreateInvoiceModal's Debtor
  // field) rather than a blanket default, since most relation pickers on
  // this component have no business creating new rows.
  allowCreateEntity?: boolean;
  // Broader version of allowCreateEntity -- adds a pinned "+ Add new…" row
  // for ANY relation target, not just entities: NewPropertyModal/
  // NewProjectModal for linkedSystemTable 'properties'/'projects', or
  // NewRecordModal (+ createRecord, same flow CustomTableMasterPage's own
  // "new record" button uses) for a sibling custom table (linkedTableId).
  // Independent of allowCreateEntity so existing entities-only callers are
  // untouched -- a caller that wants entities-only can keep using that prop,
  // this one is for callers (e.g. an in-cell relation picker that doesn't
  // know ahead of time what kind of relation it's editing) that want
  // "create new" for whatever the target turns out to be.
  allowCreateNew?: boolean;
  // Pins a clear-the-filter row at the top of the dropdown, labelled with
  // this text (e.g. "All Staff") -- DashboardFilterBar's own use case: an
  // admin narrows a filter to one person via the normal search/select
  // below, then needs an equally obvious way back to "everyone" from
  // inside the SAME picker, not just the small X next to a value that's
  // already selected. Undefined (the default) renders nothing extra --
  // every non-filter caller (quick-add forms, grid cells) is unaffected.
  clearLabel?: string;
  // Whether the "$current_user"/"$team_scope" auto-select effect below
  // should apply -- true (the default) matches every existing caller
  // (quick-add forms, grid cells: "who am I logging this as" sensibly
  // defaults to me). DashboardFilterBar passes false for an admin viewer,
  // since a FILTER defaulting to "just my own entries" is the opposite of
  // what "let admin view everyone's" needs -- see its own doc comment.
  autoSelectSelf?: boolean;
}

// Resolves the primary display field's value (plus an optional second
// field, combined as "<primary> — <secondary>") for records of a custom
// (company_tables) table -- used both to label the currently-selected value
// and to build the search results list.
async function fetchCustomTableRecordLabels(
  tableId: string, recordIds?: string[], secondaryFieldKey?: string | null
): Promise<RelationOption[]> {
  const { data: tableRow } = await supabase.from('company_tables').select('primary_field_key').eq('id', tableId).maybeSingle();
  const { data: fieldsData } = await supabase.from('company_table_fields').select('id, field_key').eq('table_id', tableId).is('deleted_at', null);
  const primaryField = (fieldsData || []).find(f => f.field_key === tableRow?.primary_field_key) || (fieldsData || [])[0];
  if (!primaryField) return [];
  const secondaryField = secondaryFieldKey ? (fieldsData || []).find(f => f.field_key === secondaryFieldKey) : undefined;

  let query = supabase
    .from('company_table_records')
    .select('id, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean)')
    .eq('table_id', tableId)
    .is('deleted_at', null);
  // recordIds undefined means "give me every candidate" (the picker's full,
  // cached option list -- see fetchAllOptions below) rather than a small
  // browse page, so this needs a limit generous enough not to silently drop
  // real rows the way a low page size did before (see
  // fetchAllSystemTableOptions's comment for the bug that caused).
  if (recordIds) query = query.in('id', recordIds);
  else query = query.limit(5000);

  const { data: records } = await query;
  return (records || []).map((r: any) => {
    const valueOf = (fieldId: string) => {
      const v = (r.values || []).find((val: any) => val.field_id === fieldId);
      return v ? (v.value_text ?? v.value_number ?? v.value_date ?? '') : '';
    };
    const primary = String(valueOf(primaryField.id) || 'Untitled');
    const secondary = secondaryField ? String(valueOf(secondaryField.id) || '') : '';
    return { id: r.id, label: secondary ? `${primary} — ${secondary}` : primary };
  });
}

// Resolves displayField2's value for a batch of system-table rows and
// appends it onto each row's already-resolved label -- separate from the
// primary field's own resolution since a 'cf:<id>' second field lives in
// company_custom_field_values, not a column on linkedSystemTable, so it
// can't be folded into the same select() as the primary field.
async function appendDisplayField2(
  rows: RelationOption[], linkedSystemTable: string, displayField2: string | null | undefined
): Promise<RelationOption[]> {
  if (!displayField2 || rows.length === 0) return rows;
  const ids = rows.map(r => r.id);
  const byId = new Map<string, string>();
  if (displayField2.startsWith('cf:')) {
    const cfId = displayField2.slice(3);
    const { data } = await supabase
      .from('company_custom_field_values')
      .select('record_id, value_text, value_number, value_date, value_boolean')
      .eq('field_id', cfId)
      .in('record_id', ids);
    (data || []).forEach((v: any) => {
      const val = v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean !== null ? v.value_boolean : null);
      if (val !== null && val !== undefined) byId.set(v.record_id, String(val));
    });
  } else {
    const { data } = await supabase.from(linkedSystemTable).select(`id, ${displayField2}`).in('id', ids);
    (data || []).forEach((r: any) => { if (r[displayField2] != null) byId.set(r.id, String(r[displayField2])); });
  }
  return rows.map(r => byId.has(r.id) ? { ...r, label: `${r.label} — ${byId.get(r.id)}` } : r);
}

// Fetches EVERY candidate row for a system-table relation once (native
// columns and every configured cf: search field / displayField2, batched
// into as few queries as this needs), instead of the old "server-side
// ilike + limit(20) on every keystroke" -- see fetchAllOptions below, which
// caches this and filters it client-side on `query`, so typing after the
// first fetch does zero network round trips. limit(5000) here is what fixed
// the original bug this replaced: a custom field's value (e.g. Matter
// Number) has no relationship to the display column's alphabetical order,
// so a small page could miss a real match once a table grew past it
// (confirmed live: 523 matters, page limit 200, "no matches" for a real
// matter number) -- fetching the whole set up front avoids that by
// construction, since nothing is ever paged out of what gets searched.
async function fetchAllSystemTableOptions(
  linkedSystemTable: string,
  displayField: string | null | undefined,
  displayField2: string | null | undefined,
  searchFieldKeys: string[] | null | undefined,
  filterColumn: string | null | undefined,
  filterValue: string | null | undefined
): Promise<RelationOption[]> {
  const col = displayField || 'name';
  const nativeExtra = (searchFieldKeys || []).filter(k => !k.startsWith('cf:'));
  const cfSearchIds = (searchFieldKeys || []).filter(k => k.startsWith('cf:')).map(k => k.slice(3));
  const col2IsCf = !!displayField2 && displayField2.startsWith('cf:');
  const col2Native = displayField2 && !col2IsCf ? displayField2 : null;
  // roles only exists on entities -- fetched here (not just on open, see
  // isRelationField's isEntities check below) so the capacity prompt in
  // selectOption knows before the user picks, not after.
  const isEntities = linkedSystemTable === 'entities';
  const nativeCols = Array.from(new Set([col, ...nativeExtra, ...(col2Native ? [col2Native] : []), ...(isEntities ? ['roles'] : [])]));

  let q = supabase.from(linkedSystemTable).select(`id, ${nativeCols.join(', ')}`).is('deleted_at', null).order(col).limit(5000);
  if (filterColumn && filterValue === TEAM_SCOPE_SENTINEL) {
    q = q.eq('entity_type', 'Staff');
    const scopeIds = await dedupedFetch('team-scope-ids', getStaffScopeIds);
    // .in() with an empty array matches nothing and is valid regardless of
    // column type -- unlike the .eq(col, '__none__') sentinel this replaced,
    // which 400s on a uuid column (id) since '__none__' isn't a valid uuid
    // literal (confirmed live: PostgREST error 22P02). That silently emptied
    // the whole options list -- via the caught/swallowed fetch error, not a
    // legitimately-empty result -- for any $team_scope user with zero scope
    // ids (no Staff entity of their own, no delegated team).
    if (scopeIds !== null) q = q.in('id', scopeIds);
  } else if (filterColumn) {
    const resolvedValue = await resolveFilterValue(filterValue);
    // Same fix as above -- filterColumn can also be a uuid column (e.g.
    // linked_profile_id).
    q = q.in(filterColumn, resolvedValue ? [resolvedValue] : []);
  }
  const { data: rows } = await q;
  const ids = (rows || []).map((r: any) => r.id);

  // Every cf: field this option list needs a value for (search fields plus
  // a cf: displayField2), resolved in one batched query per distinct field
  // id -- same batching approach as resolveRelationLabels in
  // lib/hooks/useCustomTable.ts.
  const allCfIds = Array.from(new Set([...cfSearchIds, ...(col2IsCf ? [displayField2!.slice(3)] : [])]));
  const cfByField = new Map<string, Map<string, string>>(); // fieldId -> recordId -> value
  if (allCfIds.length && ids.length) {
    const { data: cfRows } = await supabase
      .from('company_custom_field_values')
      .select('field_id, record_id, value_text, value_number, value_date, value_boolean')
      .in('field_id', allCfIds)
      .in('record_id', ids);
    (cfRows || []).forEach((v: any) => {
      const val = v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean !== null ? v.value_boolean : null);
      if (val === null || val === undefined) return;
      if (!cfByField.has(v.field_id)) cfByField.set(v.field_id, new Map());
      cfByField.get(v.field_id)!.set(v.record_id, String(val));
    });
  }

  return (rows || []).map((r: any) => {
    const primary = String(r[col] ?? 'Untitled');
    const secondary = col2IsCf ? cfByField.get(displayField2!.slice(3))?.get(r.id) : (col2Native ? r[col2Native] : null);
    const label = secondary ? `${primary} — ${secondary}` : primary;
    const searchParts = [
      primary,
      ...nativeExtra.map(c => r[c]),
      ...cfSearchIds.map(id => cfByField.get(id)?.get(r.id)),
    ].filter((v): v is string | number => v !== null && v !== undefined);
    return {
      id: r.id, label, searchText: searchParts.join(' ').toLowerCase(),
      ...(isEntities ? { hasTrusteeRole: (r.roles || []).some((role: string) => TRUSTEE_ROLE_TYPES.includes(role)) } : {}),
    };
  });
}

// Builds the exact same cache key the "fetch full list on open" effect
// below uses -- factored out so warmRelationOptionsCache (called once at
// sign-in, before any picker has even mounted) writes to the identical slot
// a later real RelationPicker instance reads from. Any drift between the
// two would silently defeat the warm-up (a real open would just miss the
// cache and refetch), so this is the one place either side is allowed to
// build one.
function optionsCacheKey(
  linkedSystemTable: string | null | undefined,
  linkedTableId: string | null | undefined,
  displayField: string | null | undefined,
  displayField2: string | null | undefined,
  searchFieldKeys: string[] | null | undefined,
  filterColumn: string | null | undefined,
  filterValue: string | null | undefined
): string {
  return `options:${linkedSystemTable ?? ''}:${linkedTableId ?? ''}:${displayField ?? ''}:${displayField2 ?? ''}:${(searchFieldKeys || []).join(',')}:${filterColumn ?? ''}:${filterValue ?? ''}`;
}

// Pre-warms the full-candidate-list cache for every distinct relation
// config currently in use against a system table (properties/entities/
// projects -- "Matters" for a firm that's renamed Projects, see
// CompanyContext's tableLabelOverrides) -- called once at sign-in
// (CompanyContext.tsx) so the FIRST time a user opens a relation picker,
// not just the second, is instant. Scoped to system-table targets: those
// are the ones a firm-wide table (like Matters, at hundreds of rows) makes
// slow on a cold fetch; a custom-table relation's target is typically much
// smaller and isn't worth warming speculatively for every table in the
// schema. Distinct configs are deduped before fetching so e.g. six
// different "Matter" fields across six tables that all search/display the
// same way (the common case) cost one fetch, not six.
export async function warmRelationOptionsCache(): Promise<void> {
  const { data: fields } = await supabase
    .from('company_table_fields')
    .select('linked_system_table, linked_display_field, linked_display_field_2, linked_search_field_keys, linked_filter_column, linked_filter_value')
    .in('linked_system_table', ['properties', 'entities', 'projects'])
    .is('deleted_at', null);
  if (!fields?.length) return;

  const seen = new Set<string>();
  for (const f of fields) {
    const key = optionsCacheKey(
      f.linked_system_table, null, f.linked_display_field, f.linked_display_field_2,
      f.linked_search_field_keys, f.linked_filter_column, f.linked_filter_value
    );
    if (seen.has(key)) continue;
    seen.add(key);
    // Fire-and-forget, same dedup/cache every real picker reads from -- a
    // failure here (e.g. offline) just means the normal on-open fetch
    // covers it later, so nothing awaits or surfaces these.
    dedupedFetch(
      key,
      () => fetchAllSystemTableOptions(
        f.linked_system_table!, f.linked_display_field, f.linked_display_field_2,
        f.linked_search_field_keys, f.linked_filter_column, f.linked_filter_value
      ),
      OPTIONS_CACHE_TTL_MS
    ).catch(() => {});
  }
}

// Drops every cached entities candidate-list and label entry (both keyed
// with a "options:entities:..."/"label:entities:..." prefix -- see
// optionsCacheKey/the label-resolution effect below) -- called after an
// entity is edited elsewhere (RecordDashboard.tsx's roles multi-select)
// so a picker opened moments later doesn't show a stale hasTrusteeRole
// flag or label from before the edit. OPTIONS_CACHE_TTL_MS (5 minutes) is
// long enough that without this, a just-added Corporate Trustee role
// wouldn't show the capacity prompt until the cache aged out on its own --
// confirmed live, that's exactly what a real edit-then-pick test hit.
export function invalidateEntityRelationCache(): void {
  for (const key of cache.keys()) {
    if (key.startsWith('options:entities:') || key.startsWith('label:entities:')) cache.delete(key);
  }
}

export default function RelationPicker({
  linkedSystemTable, linkedTableId, displayField, displayField2, searchFieldKeys, filterColumn, filterValue,
  value, onSelect, multiple, values, onSelectMulti, disabled, placeholder, initialLabel, initialCapacity, size = 'md', variant = 'pill',
  allowCreateEntity, allowCreateNew, autoSelectSelf = true, clearLabel,
}: Props) {
  // allowCreateEntity keeps its original entities-only behavior untouched;
  // allowCreateNew widens it to whatever the actual target is.
  const canCreateNew = allowCreateNew || (allowCreateEntity && linkedSystemTable === 'entities');
  const createTargetKind: 'entities' | 'properties' | 'projects' | 'custom' | null = !canCreateNew
    ? null
    : linkedSystemTable === 'entities' ? 'entities'
    : linkedSystemTable === 'properties' ? 'properties'
    : linkedSystemTable === 'projects' ? 'projects'
    : linkedTableId ? 'custom'
    : null;
  const plain = variant === 'plain';
  // py-1.5/px-1.5 (not the original py-1/px-0.5) -- DashboardGrid's own
  // plain usage sits inside a <td> with an explicit fixed pixel width, so a
  // near-zero click target there still occupies the full cell. MatterBoard's
  // in-cell picker (Client Update Pages spreadsheet) has no such fixed
  // width -- an empty relation cell (no label, plain suppresses the
  // "Select..." placeholder below) could shrink to almost nothing in the
  // flex layout, making it hard to even find, let alone click. A bit more
  // padding keeps a real, visible/clickable minimum in both contexts.
  const sizeClass = plain ? 'py-1.5 px-1.5 text-[12px]' : PILL_SIZE_CLASSES[size];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Single-select, entities only -- set when the just-picked option holds a
  // trustee role, swapping the dropdown's option list for a "which
  // capacity?" choice until answered (see selectOption/finalizeSelection).
  const [pendingCapacityOpt, setPendingCapacityOpt] = useState<RelationOption | null>(null);
  // The whole candidate list, fetched once per open (see the effect below)
  // and cached -- `options` (further down) is a client-side `.filter()` of
  // this on `query`, not a separate fetch, so typing has zero network
  // latency after the list first loads.
  const [fullOptions, setFullOptions] = useState<RelationOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentLabel, setCurrentLabel] = useState(initialLabel ?? '');
  // 'Trustee' or null -- see the Props doc comment on initialCapacity.
  // Drives the underlined "as trustee" affordance in the closed-state
  // label; the trust's actual name is deliberately NOT fetched/shown here
  // -- it's fetched on demand (loadTrustName below) only when the user
  // clicks that affordance, keeping this component's normal render/fetch
  // path untouched for every value that doesn't need it.
  const [capacity, setCapacity] = useState<string | null>(initialCapacity ?? null);
  const [showTrustPopover, setShowTrustPopover] = useState(false);
  const [trustPopoverName, setTrustPopoverName] = useState<string | null>(null);
  const [trustPopoverLoading, setTrustPopoverLoading] = useState(false);
  // Multi-select mode only -- id -> resolved label, for rendering chips.
  // Options already carry their own label once fetched/searched, so this
  // only needs to cover ids selected before their label was ever seen in
  // `options` (e.g. on initial load of a record with existing links).
  const [multiLabels, setMultiLabels] = useState<Record<string, string>>({});
  // canCreateNew only -- whether the inline create-new modal is open, and
  // (createTargetKind === 'custom' only) the target table's own name/fields,
  // fetched on demand the moment "+ Add new…" is clicked (this component
  // never otherwise loads a custom table's field catalog).
  const [showCreateEntity, setShowCreateEntity] = useState(false);
  const [customCreateInfo, setCustomCreateInfo] = useState<{ tableName: string; primaryFieldKey: string | null; fields: CustomTableField[] } | null>(null);
  const [loadingCustomCreateInfo, setLoadingCustomCreateInfo] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Which value id `currentLabel` is already known-correct for -- set
  // synchronously by the picker's own click handler (it already knows the
  // label of whatever it just clicked) so the resolution effect below can
  // skip a redundant round-trip for a selection that was just made here.
  // Seeded from `initialLabel` too, for the same reason -- a caller-supplied
  // label is just as "already known-correct" as a just-made selection.
  const resolvedForRef = useRef<string | null>(initialLabel !== undefined && value ? value : null);
  // Set only by the picker's own clear (X) button, never by the auto-select
  // effect below -- lets a "Signed-in user only" field actually stay empty
  // after a deliberate clear, instead of the effect immediately refilling
  // it the moment `value` goes back to null.
  const userClearedRef = useRef(false);

  // Resolve the current value's display label whenever it changes.
  useEffect(() => {
    if (multiple) return;
    if (!value) {
      // No id to resolve a label for. Normally that just means "nothing
      // selected" -- but a caller can pass initialLabel with no matching id
      // at all (e.g. MatterBoard's in-cell picker for a field that used to
      // be plain text before it became a real relation: existing rows have
      // a free-text value_text and no value_record_id yet). Only clear an
      // already-resolved label when `value` genuinely changed away from a
      // real id (resolvedForRef.current not null) -- on first mount with no
      // id, resolvedForRef.current is already null, so this leaves
      // useState's initialLabel-seeded currentLabel alone instead of
      // wiping it to blank the instant the component mounts.
      if (resolvedForRef.current !== null) { setCurrentLabel(''); resolvedForRef.current = null; }
      return;
    }
    if (resolvedForRef.current === value) return;
    let active = true;
    const cacheKey = `label:${linkedSystemTable ?? ''}:${linkedTableId ?? ''}:${displayField ?? ''}:${displayField2 ?? ''}:${value}`;
    dedupedFetch(cacheKey, async () => {
      let label = '';
      if (linkedSystemTable) {
        const col = displayField || 'name';
        // .is('deleted_at', null) matches the linkedTableId branch below
        // (fetchCustomTableRecordLabels always filters it) -- without this,
        // a relation pointing at a soft-deleted entity/project/property
        // would keep showing its stale label forever, inconsistently with
        // how a deleted custom-table record's relation goes blank instead.
        const { data } = await supabase.from(linkedSystemTable).select(`id, ${col}`).eq('id', value).is('deleted_at', null).maybeSingle();
        const primary = data ? String((data as any)[col] ?? '') : '';
        if (!primary) return '';
        const [withSecondary] = await appendDisplayField2([{ id: value, label: primary }], linkedSystemTable, displayField2);
        return withSecondary.label;
      } else if (linkedTableId) {
        const [opt] = await fetchCustomTableRecordLabels(linkedTableId, [value], displayField2);
        return opt?.label || '';
      }
      return label;
    }).then(label => {
      if (active) { setCurrentLabel(label); resolvedForRef.current = value; }
    });
    return () => { active = false; };
  }, [multiple, value, linkedSystemTable, linkedTableId, displayField, displayField2]);

  // Multi-select mode: resolve labels for every selected id not already
  // known (from a prior search's `options`, or already resolved). Runs
  // whenever the selected id set changes -- e.g. loading a record with
  // existing links, or after toggling a new one on.
  useEffect(() => {
    if (!multiple) return;
    const ids = values || [];
    const known = new Set([...Object.keys(multiLabels), ...options.map(o => o.id)]);
    const unresolved = ids.filter(id => !known.has(id));
    if (unresolved.length === 0) return;
    let active = true;
    (async () => {
      let resolved: RelationOption[] = [];
      if (linkedSystemTable) {
        const col = displayField || 'name';
        const { data } = await supabase.from(linkedSystemTable).select(`id, ${col}`).in('id', unresolved).is('deleted_at', null);
        resolved = await appendDisplayField2(
          (data || []).map((r: any) => ({ id: r.id, label: String(r[col] ?? 'Untitled') })),
          linkedSystemTable, displayField2
        );
      } else if (linkedTableId) {
        resolved = await fetchCustomTableRecordLabels(linkedTableId, unresolved, displayField2);
      }
      if (active && resolved.length) {
        setMultiLabels(prev => {
          const next = { ...prev };
          resolved.forEach(r => { next[r.id] = r.label; });
          return next;
        });
      }
    })();
    return () => { active = false; };
  }, [multiple, values, linkedSystemTable, linkedTableId, displayField, displayField2]);

  // Auto-fills a "Signed-in user only" field the moment it mounts empty --
  // that filter can only ever match zero or one row (the entity linked to
  // the current auth user), so there's nothing to pick from a list; picking
  // it automatically is the point ("map the time entry to the team member"
  // without an extra click every time). No separate "only once" ref guard --
  // the `if (value || ...) return` below already stops it from re-running
  // once a value is set, and a plain boolean ref turned out to be actively
  // harmful: React's dev-mode StrictMode double-invokes this effect
  // (mount -> cleanup -> mount again) on the SAME ref instance, so a
  // "have I already tried" flag set by the first (deliberately-cancelled)
  // invocation was still `true` on the second, real one -- permanently
  // skipping the fetch that would have actually landed. Confirmed live: the
  // request always resolved with the right row, just always into an
  // `active === false` closure.
  useEffect(() => {
    if (
      !autoSelectSelf || multiple || value || userClearedRef.current || !linkedSystemTable || filterColumn !== 'linked_profile_id' ||
      (filterValue !== CURRENT_USER_SENTINEL && filterValue !== TEAM_SCOPE_SENTINEL)
    ) return;
    let active = true;
    const col = displayField || 'name';
    const cacheKey = `autoSelect:${linkedSystemTable}:${filterColumn}:${filterValue}:${col}:${displayField2 ?? ''}`;
    dedupedFetch(cacheKey, async () => {
      const userId = await resolveFilterValue(filterValue);
      if (!userId) return null;
      let q = supabase.from(linkedSystemTable).select(`id, ${col}`).eq('linked_profile_id', userId).is('deleted_at', null);
      // $team_scope's candidate list is entity_type='Staff' only (see
      // fetchAllSystemTableOptions above) -- the auto-selected row has to
      // come from that same set, or it'd pick something the picker's own
      // search couldn't otherwise find.
      if (filterValue === TEAM_SCOPE_SENTINEL) q = q.eq('entity_type', 'Staff');
      const { data } = await q.maybeSingle();
      if (!data) return null;
      const primary = String((data as any)[col] ?? '');
      const [withSecondary] = await appendDisplayField2([{ id: (data as any).id, label: primary }], linkedSystemTable, displayField2);
      return { id: (data as any).id, label: withSecondary.label };
    }).then(row => {
      if (active && row) {
        setCurrentLabel(row.label);
        resolvedForRef.current = row.id;
        onSelect?.(row.id, row.label);
      }
    });
    return () => { active = false; };
    // onSelect deliberately excluded -- callers pass a fresh inline function
    // every render (e.g. FieldValueInput's `id => onCommit(id)`), so
    // including it here re-ran this effect (and cancelled the in-flight
    // fetch via the cleanup's `active = false`) on every unrelated parent
    // re-render, before the request had a chance to resolve. Matches the
    // same omission already made in the label-resolution effect above.
  }, [autoSelectSelf, multiple, value, linkedSystemTable, filterColumn, filterValue, displayField, displayField2]);

  // Fetches the WHOLE candidate list once per open (not on every keystroke)
  // and caches it (dedupedFetch above) -- typing after the first open just
  // filters this in memory (the `options` useMemo below), so it's instant
  // instead of waiting on a fresh server round trip per keystroke. Keyed on
  // everything that changes what the list contains, not on `query`, via the
  // same key builder warmRelationOptionsCache uses -- so a system-table
  // relation's very first open, at page load, can already be warm.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    const cacheKey = optionsCacheKey(linkedSystemTable, linkedTableId, displayField, displayField2, searchFieldKeys, filterColumn, filterValue);
    dedupedFetch(cacheKey, async (): Promise<RelationOption[]> => {
      if (linkedSystemTable) {
        return fetchAllSystemTableOptions(linkedSystemTable, displayField, displayField2, searchFieldKeys, filterColumn, filterValue);
      }
      if (linkedTableId) {
        const all = await fetchCustomTableRecordLabels(linkedTableId, undefined, displayField2);
        return all.map(o => ({ ...o, searchText: o.label.toLowerCase() }));
      }
      return [];
    }, OPTIONS_CACHE_TTL_MS).then(list => {
      if (active) { setFullOptions(list); setLoading(false); }
    });
    return () => { active = false; };
  }, [open, linkedSystemTable, linkedTableId, displayField, displayField2, searchFieldKeys, filterColumn, filterValue]);

  // Instant client-side filter of the cached full list -- no debounce, no
  // network call, so every keystroke updates immediately.
  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return fullOptions.slice(0, 20);
    return fullOptions.filter(o => (o.searchText ?? o.label.toLowerCase()).includes(q)).slice(0, 50);
  }, [fullOptions, query]);

  // Keyboard nav: which option ArrowUp/Down has moved to, confirmed by
  // Enter/Tab -- -1 means none (so a bare Tab/Enter on an unfiltered browse
  // list, e.g. the dropdown just opened with nothing typed, doesn't
  // surprise-select the alphabetically-first row). Reset to -1 whenever the
  // option list itself changes (a keystroke, or the dropdown re-opening),
  // since a stale index from the previous list could point at an unrelated
  // row (or past the end of a now-shorter one).
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  useEffect(() => { setHighlightedIndex(-1); }, [options]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setQuery(''); setPendingCapacityOpt(null); setShowTrustPopover(false); }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // The "as trustee" popover (showTrustPopover) is shown in the CLOSED
  // state (`showTrustPopover && !open` below) -- the outside-click handler
  // above only ever attaches while `open` is true, so it never ran while
  // this popover was showing and clicking elsewhere on the page did
  // nothing. Separate effect, keyed on showTrustPopover itself instead of
  // open, so it closes regardless of the main dropdown's state.
  useEffect(() => {
    if (!showTrustPopover) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setShowTrustPopover(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTrustPopover]);

  if (disabled) {
    const label = multiple
      ? (values || []).map(id => multiLabels[id] ?? options.find(o => o.id === id)?.label).filter(Boolean).join(', ')
      : currentLabel;
    return (
      <div
        title={label || undefined}
        className={plain ? `w-full font-medium text-slate-500 truncate ${sizeClass}` : `w-full bg-slate-50 border border-slate-200 rounded-full font-medium text-slate-500 truncate ${sizeClass}`}
      >
        {label || (plain ? '' : '—')}
      </div>
    );
  }

  // Finalizes a pick with a specific capacity -- shared by selectOption
  // below (the no-ambiguity path) and the capacity-prompt buttons rendered
  // when pendingCapacityOpt is set.
  const finalizeSelection = (opt: RelationOption, pickedCapacity: string | null) => {
    setCurrentLabel(opt.label);
    setCapacity(pickedCapacity);
    setTrustPopoverName(null);
    resolvedForRef.current = opt.id;
    onSelect?.(opt.id, opt.label, pickedCapacity);
    setQuery('');
    setOpen(false);
    setPendingCapacityOpt(null);
  };

  // "as trustee" is shown as a click-to-reveal affordance, not baked into
  // the label -- which trust stays out of the label text (that's what made
  // Property Owner too wide) but is still one click away rather than
  // hidden entirely. Not cached (unlike the options/label fetches above)
  // -- a single lightweight row lookup, fired only on an explicit click,
  // and always-fresh matters more here than saving a round trip, since the
  // link can change independently via the entity's own "Trust" field
  // (RecordDashboard.tsx's withTrustField).
  const toggleTrustPopover = async () => {
    if (showTrustPopover) { setShowTrustPopover(false); return; }
    setShowTrustPopover(true);
    if (!value) { setTrustPopoverName(null); return; }
    setTrustPopoverLoading(true);
    const { data } = await supabase.from('entity_relationships')
      .select('trust:parent_entity_id(name)')
      .eq('child_entity_id', value).eq('relationship_type', 'Trustee')
      .or('is_current.is.null,is_current.eq.true')
      .maybeSingle();
    setTrustPopoverName((data as any)?.trust?.name || null);
    setTrustPopoverLoading(false);
  };

  // Shared by the option click handler and the Tab/Enter-with-one-match
  // shortcut below, so the two ways of confirming a pick can't drift apart.
  // Single-select only -- multi-select's own `toggle` (inside the
  // `multiple` branch below) is its equivalent.
  const selectOption = (opt: RelationOption) => {
    // entities only -- an entity holding a trustee role is ambiguous about
    // which capacity it's acting in for THIS specific link (the same
    // company can be "just itself" on one matter and "as trustee" on
    // another), so always ask instead of guessing. Keeps the dropdown open,
    // swapping its content for the capacity choice (see the render below).
    if (opt.hasTrusteeRole) { setPendingCapacityOpt(opt); return; }
    // Already know the label from the option clicked -- set it immediately
    // instead of waiting on the value-resolution effect below to re-fetch
    // it from the server, which was the visible lag on every relation pick.
    setCurrentLabel(opt.label);
    resolvedForRef.current = opt.id;
    onSelect?.(opt.id, opt.label);
    setQuery('');
    setOpen(false);
  };

  // canCreateNew only -- after a create modal makes a row (entity, property,
  // project, or a custom-table record), invalidate this field's cached
  // candidate list (same key the "fetch on open" effect reads) and refetch
  // it so the new row is actually findable, then auto-select it via the same
  // path a normal click would -- otherwise the viewer would have to close
  // and reopen the dropdown just to find the row they were staring at a
  // moment ago. Defined before the `multiple` branch below (rather than
  // after, where selectOption lived) since that branch returns early and
  // needs this too -- multi-select ADDS the new row to the current selection
  // instead of replacing it.
  const handleCreated = async (newId?: string) => {
    setShowCreateEntity(false);
    if (!linkedSystemTable && !linkedTableId) return;
    const key = optionsCacheKey(linkedSystemTable, linkedTableId, displayField, displayField2, searchFieldKeys, filterColumn, filterValue);
    cache.delete(key);
    setLoading(true);
    const list = linkedSystemTable
      ? await fetchAllSystemTableOptions(linkedSystemTable, displayField, displayField2, searchFieldKeys, filterColumn, filterValue)
      : await fetchCustomTableRecordLabels(linkedTableId!, undefined, displayField2);
    cache.set(key, { value: list, expiresAt: Date.now() + OPTIONS_CACHE_TTL_MS });
    setFullOptions(list);
    setLoading(false);
    const match = newId && list.find(o => o.id === newId);
    if (!match) { setOpen(true); return; }
    if (multiple) {
      setMultiLabels(prev => ({ ...prev, [match.id]: match.label }));
      onSelectMulti?.([...(values || []), match.id]);
      setOpen(true);
    } else {
      selectOption(match);
    }
  };

  // createTargetKind === 'custom' only -- NewRecordModal needs the target
  // table's own field catalog to know what to prompt for (same shape
  // CustomTableMasterPage's "new record" flow already fetches at page load;
  // fetched lazily here instead, since this component never otherwise needs
  // a sibling table's fields).
  const openCreateModal = async () => {
    setOpen(false);
    if (createTargetKind === 'custom' && linkedTableId && !customCreateInfo) {
      setLoadingCustomCreateInfo(true);
      const [{ data: table }, { data: fields }] = await Promise.all([
        supabase.from('company_tables').select('name, primary_field_key').eq('id', linkedTableId).maybeSingle(),
        supabase.from('company_table_fields').select('*').eq('table_id', linkedTableId).is('deleted_at', null).order('display_order'),
      ]);
      setCustomCreateInfo({ tableName: table?.name || 'record', primaryFieldKey: table?.primary_field_key || null, fields: (fields || []) as CustomTableField[] });
      setLoadingCustomCreateInfo(false);
    }
    setShowCreateEntity(true);
  };

  // createTargetKind === 'custom' only -- same createRecord() call
  // CustomTableMasterPage's own "new record" button makes, just resolving
  // companyId/userId itself the way NewEntityModal/NewPropertyModal already
  // do internally (this component has neither in scope otherwise).
  const createCustomTableRecordHere = async (values: Record<string, any>): Promise<string | null> => {
    if (!linkedTableId) return 'No target table';
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'Not signed in';
    const { data: profile } = await supabase.from('profiles').select('active_company_id').eq('id', user.id).single();
    const companyId = profile?.active_company_id;
    if (!companyId) return 'No active company';
    const result = await createRecord(linkedTableId, companyId, user.id, values, customCreateInfo?.fields || []);
    if (!result) return 'Could not create record';
    if ('error' in result) return result.error;
    await handleCreated(result.id);
    return null;
  };

  const createNewLabel = createTargetKind === 'entities' ? 'Add new entity'
    : createTargetKind === 'properties' ? 'Add new property'
    : createTargetKind === 'projects' ? 'Add new matter'
    : createTargetKind === 'custom' ? `Add new ${customCreateInfo?.tableName || 'record'}`
    : '';

  const createButton = canCreateNew && (
    <button
      type="button"
      onClick={openCreateModal}
      className="w-full text-left px-4 py-2 text-[12px] font-bold text-indigo-600 hover:bg-indigo-50 border-t border-slate-100 flex items-center gap-1.5"
    >
      <Plus size={12} /> {loadingCustomCreateInfo ? <Loader2 size={12} className="animate-spin" /> : createNewLabel}
    </button>
  );

  const createModal = canCreateNew && (
    <>
      {createTargetKind === 'entities' && <NewEntityModal isOpen={showCreateEntity} onClose={() => setShowCreateEntity(false)} onRefresh={handleCreated} />}
      {createTargetKind === 'properties' && <NewPropertyModal isOpen={showCreateEntity} onClose={() => setShowCreateEntity(false)} onRefresh={handleCreated} />}
      {createTargetKind === 'projects' && <NewProjectModal isOpen={showCreateEntity} onClose={() => setShowCreateEntity(false)} onRefresh={handleCreated} />}
      {createTargetKind === 'custom' && showCreateEntity && customCreateInfo && (
        <NewRecordModal
          tableName={customCreateInfo.tableName}
          fields={pickCreateFields(customCreateInfo.fields, customCreateInfo.primaryFieldKey)}
          onCreate={createCustomTableRecordHere}
          onClose={() => setShowCreateEntity(false)}
        />
      )}
    </>
  );

  if (multiple) {
    const selectedIds = values || [];
    const labelOf = (id: string) => multiLabels[id] ?? options.find(o => o.id === id)?.label ?? '…';
    const toggle = (opt: RelationOption) => {
      const next = selectedIds.includes(opt.id)
        ? selectedIds.filter(id => id !== opt.id)
        : [...selectedIds, opt.id];
      setMultiLabels(prev => ({ ...prev, [opt.id]: opt.label }));
      onSelectMulti?.(next);
    };
    return (
      <div ref={containerRef} className="relative w-full">
        <div
          onClick={() => setOpen(true)}
          className={plain
            ? `w-full min-h-[28px] font-medium outline-none cursor-pointer flex flex-wrap items-center gap-1.5 rounded-sm focus-within:ring-2 focus-within:ring-indigo-100 ${sizeClass}`
            : `w-full min-h-[38px] bg-slate-50 border border-slate-200 rounded-2xl font-medium outline-none cursor-pointer flex flex-wrap items-center gap-1.5 focus-within:ring-2 focus-within:ring-indigo-100 ${sizeClass}`}
        >
          {selectedIds.map(id => (
            <span key={id} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 rounded-full pl-2.5 pr-1.5 py-1 text-[11px] font-semibold">
              {labelOf(id)}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onSelectMulti?.(selectedIds.filter(x => x !== id)); }}
                className="text-indigo-400 hover:text-red-500"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {open ? (
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlightedIndex(i => Math.min(i + 1, options.length - 1));
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlightedIndex(i => Math.max(i - 1, 0));
                  return;
                }
                // Enter/Tab confirms the arrow-highlighted option; with
                // nothing highlighted (dropdown just opened, no arrows
                // pressed yet) a search narrowed to exactly one match still
                // confirms that one -- otherwise Tab just moves focus on and
                // Enter does nothing, so an untouched browse list can't
                // surprise-select its alphabetically-first row. Enter is
                // prevented so it doesn't also submit an enclosing form;
                // Tab's own focus-move behavior is left alone, it just also
                // toggles the match on the way out.
                if (e.key !== 'Enter' && e.key !== 'Tab') return;
                const target = highlightedIndex >= 0 ? options[highlightedIndex] : (options.length === 1 ? options[0] : null);
                if (!target) return;
                if (e.key === 'Enter') e.preventDefault();
                toggle(target);
                setQuery('');
                if (e.key === 'Tab') setOpen(false);
              }}
              placeholder={selectedIds.length ? '' : (placeholder || (plain ? '' : 'Search...'))}
              className="flex-1 min-w-[80px] bg-transparent outline-none"
            />
          ) : selectedIds.length === 0 && (placeholder || !plain) ? (
            <span className="text-slate-400">{placeholder || 'Select...'}</span>
          ) : null}
        </div>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-slate-300" /></div>
            ) : options.length === 0 ? (
              <p className="text-[11px] text-slate-300 italic text-center py-4">No matches</p>
            ) : (
              options.map((opt, i) => {
                const checked = selectedIds.includes(opt.id);
                const isHighlighted = i === highlightedIndex;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt)}
                    onMouseEnter={() => setHighlightedIndex(i)}
                    className={`w-full text-left px-4 py-2 text-[12px] font-medium flex items-center gap-2 transition-colors ${
                      checked ? 'bg-indigo-50 text-indigo-700' : isHighlighted ? 'bg-slate-50 text-slate-700' : 'text-slate-700 hover:bg-indigo-50'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'}`}>
                      {checked && <Check size={9} className="text-white" />}
                    </span>
                    {opt.label}
                  </button>
                );
              })
            )}
            {createButton}
          </div>
        )}

        {createModal}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        onClick={() => setOpen(true)}
        className={plain
          ? `w-full font-medium outline-none cursor-pointer flex items-center justify-between gap-2 rounded-sm focus-within:ring-2 focus-within:ring-indigo-100 ${sizeClass}`
          : `w-full bg-slate-50 border border-slate-200 rounded-full font-medium outline-none cursor-pointer flex items-center justify-between gap-2 focus-within:ring-2 focus-within:ring-indigo-100 ${sizeClass}`}
      >
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex(i => Math.min(i + 1, options.length - 1));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex(i => Math.max(i - 1, 0));
                return;
              }
              // Enter/Tab confirms the arrow-highlighted option; with
              // nothing highlighted (dropdown just opened, no arrows
              // pressed yet) a search narrowed to exactly one match still
              // confirms that one -- otherwise Tab just moves focus on and
              // Enter does nothing, so an untouched browse list can't
              // surprise-select its alphabetically-first row. Enter is
              // prevented so it doesn't also submit an enclosing form;
              // Tab's own focus-move behavior is left alone, it just also
              // picks the match on the way out.
              if (e.key !== 'Enter' && e.key !== 'Tab') return;
              const target = highlightedIndex >= 0 ? options[highlightedIndex] : (options.length === 1 ? options[0] : null);
              if (!target) return;
              if (e.key === 'Enter') e.preventDefault();
              selectOption(target);
            }}
            placeholder={placeholder || (plain ? '' : 'Search...')}
            className="w-full bg-transparent outline-none"
          />
        ) : (
          <span className="flex items-center gap-1 min-w-0">
            <span
              title={currentLabel || undefined}
              className={`truncate ${currentLabel ? 'text-slate-700' : 'text-slate-400'}`}
            >
              {currentLabel || placeholder || (plain ? '' : 'Select...')}
            </span>
            {capacity === 'Trustee' && (
              <button type="button" onClick={e => { e.stopPropagation(); toggleTrustPopover(); }}
                className="shrink-0 underline decoration-dotted text-slate-400 hover:text-indigo-600 transition-colors">
                as trustee
              </button>
            )}
          </span>
        )}
        {currentLabel && !open && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setCurrentLabel(''); setCapacity(null); setShowTrustPopover(false); resolvedForRef.current = null; userClearedRef.current = true; onSelect?.(null, null); }}
            className="text-slate-300 hover:text-red-500 shrink-0"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {showTrustPopover && !open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 px-3 py-2 min-w-[160px]">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Trust</p>
          <p className="text-[12px] font-medium text-slate-700">
            {trustPopoverLoading ? <Loader2 size={12} className="animate-spin text-slate-300" /> : (trustPopoverName || <span className="text-slate-300 italic">No trust linked</span>)}
          </p>
        </div>
      )}

      {open && pendingCapacityOpt && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-indigo-200 rounded-2xl shadow-xl z-50 p-3 space-y-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Acting as, for this?</p>
          <button type="button" onClick={() => finalizeSelection(pendingCapacityOpt, null)}
            className="w-full text-left px-3 py-2 text-[12px] font-medium text-slate-700 rounded-xl hover:bg-indigo-50 transition-colors">
            {pendingCapacityOpt.label} <span className="text-slate-400">(itself)</span>
          </button>
          <button type="button" onClick={() => finalizeSelection(pendingCapacityOpt, 'Trustee')}
            className="w-full text-left px-3 py-2 text-[12px] font-medium text-slate-700 rounded-xl hover:bg-indigo-50 transition-colors">
            {pendingCapacityOpt.label} <span className="text-slate-400">(as trustee)</span>
          </button>
          <button type="button" onClick={() => setPendingCapacityOpt(null)}
            className="w-full text-left px-3 py-1 text-[11px] text-slate-400 hover:text-slate-600">Back</button>
        </div>
      )}
      {open && !pendingCapacityOpt && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-60 overflow-y-auto">
          {clearLabel && (
            <button
              type="button"
              onClick={() => {
                setCurrentLabel(''); resolvedForRef.current = null; userClearedRef.current = true;
                onSelect?.(null, null);
                setQuery(''); setOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-[12px] font-bold transition-colors border-b border-slate-100 ${
                !value ? 'text-indigo-600 bg-indigo-50/60' : 'text-slate-500 hover:bg-indigo-50'
              }`}
            >
              {clearLabel}
            </button>
          )}
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 size={14} className="animate-spin text-slate-300" /></div>
          ) : options.length === 0 ? (
            <p className="text-[11px] text-slate-300 italic text-center py-4">No matches</p>
          ) : (
            options.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => selectOption(opt)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full text-left px-4 py-2 text-[12px] font-medium text-slate-700 transition-colors ${
                  i === highlightedIndex ? 'bg-indigo-50' : 'hover:bg-indigo-50'
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
          {createButton}
        </div>
      )}

      {createModal}
    </div>
  );
}
