"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { readCache, writeCache } from "@/lib/queryCache";
import { useCompany } from "@/components/CompanyContext";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import type { CustomTable } from "./useCustomTables";

interface CachedTableShell {
  tableDef: CustomTable;
  fields: CustomTableField[];
}
// Scoped by companyId -- see lib/hooks/prefetchShells.ts's tableShellKey
// doc comment for why (a bare slug-only key served a previous company's
// stale shell after switching active company).
const tableShellKey = (companyId: string, slug: string) => `table:${companyId}:${slug}`;

// Same key format GenericMasterTable.tsx/prefetchShells.ts already use for
// the 4 system tables' row cache (queryCache.ts's readCache/writeCache
// prefixes this with nk_cache_ and wraps it with a TTL/version envelope) --
// reusing it here rather than inventing a custom-table-specific scheme
// means lib/hooks/prefetchShells.ts's bootstrap warmer can seed this same
// slot for every custom table with the exact key a real mount later reads.
const rowsCacheKey = (companyId: string, slug: string) => `rows_${companyId}_${slug}`;

export interface CustomTableField {
  id: string;
  table_id: string;
  field_key: string;
  label: string;
  field_type: string;
  select_options: string[] | null;
  linked_table_id: string | null;
  linked_system_table: string | null;
  linked_display_field: string | null;
  // Optional second field combined onto the search/display label as
  // "<linked_display_field> — <linked_display_field_2>" (see
  // supabase/company_table_fields_display_field_2.sql and
  // components/dashboard/RelationPicker.tsx's displayField2 prop).
  linked_display_field_2: string | null;
  // Extra config for relation fields linked to a system table (see
  // supabase/company_table_fields_relation_config.sql) -- lets the picker
  // search more than just the display field, and restrict results (e.g. a
  // Staff field only showing entities where entity_type = 'Staff').
  linked_search_field_keys: string[] | null;
  linked_filter_column: string | null;
  linked_filter_value: string | null;
  // Text-encoded default ('true'/'false' for booleans, raw text otherwise --
  // see supabase/company_table_fields_default_value.sql). Read by
  // DashboardQuickAddForm's getDefaultValues; null means the old hardcoded
  // per-type default (false for booleans, no prefill otherwise).
  default_value: string | null;
  is_required: boolean;
  is_unique: boolean;
  show_in_table: boolean;
  display_order: number;
  section_name: string | null;
  help_text: string | null;
  // Computed/formula fields (see supabase/company_table_fields_formula.sql
  // and _formula_extend.sql) -- formula_type null means an ordinary,
  // user-entered field. For sum_related, formula_field_a_id and
  // formula_relation_field_id are fields on the RELATED table.
  formula_type: 'multiply' | 'percentage_of' | 'add' | 'sum_related' | null;
  formula_field_a_id: string | null;
  formula_field_b_id: string | null;
  formula_percent: number | null;
  formula_relation_field_id: string | null;
  // Server-assigned consecutive numbering (see
  // supabase/company_table_field_sequences.sql), e.g. 'TR-' -> TR-000001.
  auto_number_prefix: string | null;
  // Multi-record relations (see
  // supabase/company_table_field_allow_multiple.sql) -- relation-type
  // fields only; false means the normal single-value behavior every other
  // field type also has. When true, `values[field_key]` on a
  // CustomTableRecord is a string[] of linked record ids instead of a
  // single id -- see this file's own load() below.
  allow_multiple: boolean;
  // Set only by lib/hooks/useSystemTableAsCustomTable.ts's adapter, which
  // synthesizes CustomTableField-shaped entries for a system table's native
  // columns ('native') and company_custom_fields rows ('custom') so
  // lib/services/systemTableRecordService.ts knows which table to write
  // each value to. Undefined for every real company_table_fields row --
  // never read by the custom-table write path (lib/services/customTableService.ts).
  field_source?: 'native' | 'custom';
}

export interface CustomTableRecord {
  id: string;
  table_id: string;
  created_at: string;
  values: Record<string, any>; // field_key → value (raw value_record_id for relation fields)
  // field_key → resolved label, populated only for relation-type fields
  // (table_relation/entity/project/property) -- see resolveRelationLabels
  // below. Display-only; editing still reads/writes the raw id in `values`.
  displayValues: Record<string, string>;
}

const RELATION_FIELD_TYPES = ['table_relation', 'entity', 'project', 'property'];

// Guards the `.in('id'/'record_id', targetIds)` lookups below against a
// value_text-only relation value that was never actually linked to a real
// record -- see components/GenericMasterTable.tsx's fetchCustomFields for
// the full story (a value_record_id-typed field can still end up with only
// a plain display-name string in value_text, and load() below's own
// value_text-vs-value_record_id merge needs to prefer value_record_id for
// the same reason). A single such value would otherwise 400 the WHOLE
// batched lookup, blanking every OTHER record's label for this column too.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Batch-resolves each relation field's target record ids to a human label,
// one query per relation field (not per row), and writes the results onto
// each record's `displayValues`. Mirrors the label lookups RelationPicker
// already does for the edit-side picker (components/dashboard/RelationPicker.tsx),
// just batched across all rows in the grid instead of one value at a time.
export async function resolveRelationLabels(fieldList: CustomTableField[], records: CustomTableRecord[]) {
  const relationFields = fieldList.filter(f => RELATION_FIELD_TYPES.includes(f.field_type));
  if (relationFields.length === 0) return;

  await Promise.all(relationFields.map(async field => {
    // allow_multiple fields hold a string[]; every other relation field
    // holds a single string -- flatten both into one flat id list to
    // resolve, same as if every field were scalar.
    const rawValues = records.map(r => r.values[field.field_key]);
    const targetIds = Array.from(new Set(
      rawValues.flatMap(v => Array.isArray(v) ? v : [v]).filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
    ));
    if (targetIds.length === 0) return;

    const labelById = new Map<string, string>();

    if (field.field_type === 'table_relation' && field.linked_table_id) {
      const { data: targetFields } = await supabase
        .from('company_table_fields').select('id, field_key')
        .eq('table_id', field.linked_table_id).is('deleted_at', null);
      let displayField = (targetFields || []).find(f => f.field_key === field.linked_display_field);
      if (!displayField) {
        const { data: targetTable } = await supabase
          .from('company_tables').select('primary_field_key').eq('id', field.linked_table_id).maybeSingle();
        displayField = (targetFields || []).find(f => f.field_key === targetTable?.primary_field_key) || (targetFields || [])[0];
      }
      if (displayField) {
        const { data: values } = await supabase
          .from('company_table_values')
          .select('record_id, value_text, value_number, value_date, value_boolean')
          .eq('field_id', displayField.id)
          .in('record_id', targetIds);
        (values || []).forEach(v => {
          const label = v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean !== null ? String(v.value_boolean) : null);
          if (label !== null && label !== undefined) labelById.set(v.record_id, String(label));
        });
      }
    } else if (field.linked_system_table) {
      const col = field.linked_display_field || 'name';
      const { data: rows } = await supabase.from(field.linked_system_table).select(`id, ${col}`).in('id', targetIds);
      (rows || []).forEach((r: any) => { if (r[col] != null) labelById.set(r.id, String(r[col])); });
    }

    records.forEach(rec => {
      const targetId = rec.values[field.field_key];
      if (Array.isArray(targetId)) {
        const labels = targetId.map(id => labelById.get(id)).filter((l): l is string => !!l);
        if (labels.length) rec.displayValues[field.field_key] = labels.join(', ');
        return;
      }
      const label = typeof targetId === 'string' ? labelById.get(targetId) : undefined;
      if (label !== undefined) rec.displayValues[field.field_key] = label;
    });
  }));
}

export function useCustomTable(
  tableSlug: string | null,
  // A caller that already has the full row (see useDashboardData.ts, which
  // fetches it anyway to resolve source_table_id -> slug) can hand it over
  // here to skip this hook's own table-by-slug lookup entirely -- a whole
  // redundant round trip otherwise sitting in front of the fields/records
  // fetch on every dashboard load. Ignored if its slug doesn't match
  // tableSlug (stale/mismatched props); every other existing caller (the
  // URL-slug-driven table pages) just omits this and behaves exactly as
  // before. Relies on ordinary useState reference stability -- the caller's
  // own state only changes identity when it actually re-fetches, not on
  // every render -- so this doesn't need memoizing at the call site.
  // NOTE: this hook keys its dependency on this off preloadedTable?.id, not
  // the object itself -- see preloadedTableRef below for why passing a
  // fresh-but-equivalent object on every render (e.g. useDashboardData.ts's
  // own always-on background revalidation) must NOT be treated as "the
  // table changed."
  preloadedTable?: CustomTable | null
): {
  tableDef: CustomTable | null;
  fields: CustomTableField[];
  records: CustomTableRecord[];
  loading: boolean;
  // True from the moment `loading` goes false until records actually land
  // -- lets a caller show its real shell (a quick-add form's labeled
  // inputs, a grid's own column headers) the instant fields are ready,
  // with just the row/data area of its own still indicating "loading"
  // rather than blocking that whole shell behind one combined flag. See
  // `load` below for why fields reliably lands first.
  recordsLoading: boolean;
  refetch: () => void;
  // Inserts a just-created record into local state directly, no network
  // round trip -- see DashboardQuickAddForm.tsx's handleAdd, which uses
  // this instead of refetch() so "Add" doesn't have to wait out a full
  // fields+ALL-records-plus-every-relation-label reload (confirmed live:
  // that's most of why Add felt slow, not the create write itself) just to
  // show the ONE row it already knows the contents of. `values` should
  // already be formula-resolved (the caller's own live preview state, e.g.
  // Amount = Rate x Duration) -- this does no computation of its own.
  // Relation-field cells resolve their own display label lazily on mount
  // (RelationPicker's normal behavior when no initialLabel is given), so
  // this doesn't need one either.
  addRecordOptimistic: (id: string, values: Record<string, any>) => void;
} {
  const { companyId } = useCompany();
  const [tableDef, setTableDef] = useState<CustomTable | null>(null);
  const [fields, setFields] = useState<CustomTableField[]>([]);
  // Lazily seeded from cache -- a custom table already visited this session
  // renders its last-known rows immediately instead of blanking to a
  // skeleton for a frame, same reasoning as usePresetTable.ts's own lazy
  // row initializer for the 4 system tables.
  const [records, setRecords] = useState<CustomTableRecord[]>(
    () => (companyId && tableSlug ? readCache<CustomTableRecord[]>(rowsCacheKey(companyId, tableSlug)) : null) || []
  );
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(
    () => !(companyId && tableSlug && readCache<CustomTableRecord[]>(rowsCacheKey(companyId, tableSlug)))
  );

  // useDashboardData.ts always re-fetches the dashboard's source table row
  // live in the background (correct -- stale-while-revalidate), even when
  // it just painted from cache, and hands the result over as
  // preloadedTable. That live re-fetch produces a brand-new object every
  // time it resolves, even when the row is byte-for-byte identical to what
  // was already shown -- if `load`/the effect below depended on
  // preloadedTable directly, that harmless reference change would retrigger
  // this hook's ENTIRE fields+records+relation-label fetch a second time on
  // every single dashboard open (confirmed: this was the actual cause of a
  // dashboard still not feeling instant even with a fully warm cache).
  // Reading the live value through a ref -- kept current via a layout
  // effect that runs after every render, registered before the one below
  // that calls load(), so it's always up to date by the time that reads it
  // -- while keying the effect/callback's dependency on just its id (a
  // table's id is stable across re-fetches of the same table) fixes that
  // without losing the "skip the network round trip when we already have
  // the row" behavior load() below relies on.
  const preloadedTableRef = useRef(preloadedTable);
  useIsomorphicLayoutEffect(() => {
    preloadedTableRef.current = preloadedTable;
  });
  const preloadedTableId = preloadedTable?.slug === tableSlug ? preloadedTable?.id : undefined;

  // Fetches table def + fields + records and swaps them in. Deliberately
  // does not touch `loading`/`recordsLoading` itself on entry -- the mount
  // effect below wraps the *first* call in both loading flags; a later
  // `refetch()` (after adding/editing/deleting a record) calls this
  // directly so the page keeps showing the current data instead of
  // unmounting into a spinner.
  const load = useCallback(async () => {
    if (!tableSlug) return;
    const currentPreload = preloadedTableRef.current;
    let tbl: CustomTable | null | undefined = currentPreload?.slug === tableSlug ? currentPreload : null;
    if (!tbl && companyId) {
      // .eq('company_id', ...) -- company_tables.slug has no unique
      // constraint (two companies can each legitimately have a table
      // slugged e.g. 'irregularities'), so a slug-only lookup relied
      // entirely on RLS to avoid resolving the wrong tenant's row.
      const { data } = await supabase
        .from('company_tables')
        .select('*')
        .eq('slug', tableSlug)
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .single();
      tbl = data;
    }

    if (!tbl) return;
    setTableDef(tbl);

    // Both fire in the same tick (no new round trip vs. before), but only
    // FIELDS is awaited up front -- records is wrapped in an immediately-
    // invoked async function so its own request starts right away too,
    // without forcing the caller to wait for it before painting anything.
    // Fields is a handful of rows and reliably resolves first; records is
    // a join across company_table_values for every row in the table, and
    // was the real reason the page's whole shell (quick-add form, grid's
    // own column headers -- neither of which needs a single row of data to
    // render) sat behind one combined skeleton for as long as the slower
    // of the two, even though a viewer spends a couple of seconds just
    // orienting on a fresh page before touching anything anyway.
    const recordsPromise = (async () => {
      const { data } = await supabase
        .from('company_table_records')
        .select('*, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)')
        .eq('table_id', tbl!.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      return data;
    })();

    const { data: flds } = await supabase
      .from('company_table_fields')
      .select('*')
      .eq('table_id', tbl.id)
      .is('deleted_at', null)
      .order('display_order');

    const fieldList = (flds || []) as CustomTableField[];
    setFields(fieldList);
    setLoading(false);
    if (companyId) writeShellCache(tableShellKey(companyId, tableSlug), { tableDef: tbl, fields: fieldList });

    // Build a field_id → field_key map for resolving values
    const fieldMap = new Map(fieldList.map(f => [f.id, f]));
    const recs = await recordsPromise;

    const hydratedRecords: CustomTableRecord[] = (recs || []).map(rec => {
      const values: Record<string, any> = {};
      (rec.values || []).forEach((v: any) => {
        const field = fieldMap.get(v.field_id);
        if (!field) return;
        // value_record_id checked FIRST -- see UUID_RE's comment above and
        // components/GenericMasterTable.tsx's matching fetchCustomFields for
        // why (it's the dedicated, authoritative link column; value_text can
        // hold a stale or never-linked plain display name instead).
        values[field.field_key] = v.value_record_id
          ?? v.value_text
          ?? v.value_number
          ?? v.value_date
          ?? v.value_boolean
          ?? null;
      });
      return { id: rec.id, table_id: rec.table_id, created_at: rec.created_at, values, displayValues: {} };
    });

    // Multi-record relations (allow_multiple) hold their links in a
    // separate junction table, not company_table_values -- overwrite those
    // fields' values with the real string[] once loaded. field_id already
    // scopes to this table (a field belongs to exactly one table), so no
    // need to also filter by this table's record ids.
    const multiFields = fieldList.filter(f => f.allow_multiple);
    if (multiFields.length) {
      const { data: links } = await supabase
        .from('company_table_value_links')
        .select('record_id, field_id, value_record_id')
        .in('field_id', multiFields.map(f => f.id));
      const byRecord = new Map<string, Record<string, string[]>>();
      (links || []).forEach(l => {
        const field = fieldMap.get(l.field_id);
        if (!field) return;
        if (!byRecord.has(l.record_id)) byRecord.set(l.record_id, {});
        const rec = byRecord.get(l.record_id)!;
        (rec[field.field_key] ||= []).push(l.value_record_id);
      });
      for (const rec of hydratedRecords) {
        for (const field of multiFields) {
          rec.values[field.field_key] = byRecord.get(rec.id)?.[field.field_key] || [];
        }
      }
    }

    await resolveRelationLabels(fieldList, hydratedRecords);
    setRecords(hydratedRecords);
    setRecordsLoading(false);
    if (companyId) writeCache(rowsCacheKey(companyId, tableSlug), hydratedRecords);
    // preloadedTableId isn't read in this body (the ref is, above) -- it's
    // listed deliberately so a genuine table change still gets a fresh
    // `load` identity, without a harmless preloadedTable object-reference
    // change (see preloadedTableRef's doc comment) doing the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSlug, preloadedTableId, companyId]);

  // Layout effect, not a plain effect -- when a caller reuses this hook's
  // component instance across a slug change (e.g. clicking between two
  // dashboards -- see DashboardViewPage.tsx's own doc comment on this),
  // this needs to correct tableDef/fields/loading BEFORE the browser
  // paints the new slug's first frame. A plain useEffect runs after that
  // paint, which both flashes the OLD table's fields for a frame and (since
  // `loading` would still read stale-false from the previous slug on that
  // painted frame, then flip true once this effect finally runs) fires a
  // second, spurious start/stop of the page's loading indicator.
  useIsomorphicLayoutEffect(() => {
    if (!tableSlug) return;
    // Fields are cached independently of preloadedTable -- a caller
    // handing over a known tableDef (useDashboardData.ts's own cache) only
    // means the table ROW lookup can be skipped inside load() below, not
    // that this table's FIELDS are known too. Consulting this cache
    // unconditionally is what lets a repeat visit paint the shell with zero
    // network wait even on the dashboard-driven path.
    const cached = companyId ? readShellCache<CachedTableShell>(tableShellKey(companyId, tableSlug)) : null;
    const preload = preloadedTableRef.current?.slug === tableSlug ? preloadedTableRef.current : null;
    if (preload) setTableDef(preload);
    else if (cached) setTableDef(cached.tableDef);
    if (cached) {
      setFields(cached.fields);
      setLoading(false);
    } else {
      setLoading(true);
    }
    // Reconcile against the row cache here too (not just the lazy
    // initializer above) -- this effect also re-runs on a slug/company
    // change after mount, when the lazy initializer no longer applies.
    // Only flip recordsLoading on when there's truly no cache, so a
    // cache-seeded "not loading" state isn't clobbered into a skeleton
    // flash while load() refreshes underneath it.
    const cachedRows = companyId ? readCache<CustomTableRecord[]>(rowsCacheKey(companyId, tableSlug)) : null;
    if (cachedRows) {
      setRecords(cachedRows);
      setRecordsLoading(false);
    } else {
      setRecords([]);
      setRecordsLoading(true);
    }
    load();
  }, [tableSlug, load, preloadedTableId, companyId]);

  const addRecordOptimistic = useCallback((id: string, values: Record<string, any>) => {
    setRecords(prev => {
      if (prev.some(r => r.id === id)) return prev; // a real refetch already landed it first
      const newRecord: CustomTableRecord = {
        id, table_id: tableDef?.id || '', created_at: new Date().toISOString(), values, displayValues: {},
      };
      return [newRecord, ...prev];
    });
  }, [tableDef]);

  return {
    tableDef,
    fields,
    records,
    loading,
    recordsLoading,
    refetch: load,
    addRecordOptimistic,
  };
}