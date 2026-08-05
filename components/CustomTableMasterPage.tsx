// components/CustomTableMasterPage.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Settings2, X, Plus, ChevronDown, ChevronUp, ChevronsUpDown, GripVertical, Loader2, Trash2, Download, Upload } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { readCache, writeCache } from "@/lib/queryCache";
import DataTable from "@/components/DataTable";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { useTableColumnConfig } from "@/lib/hooks/useTableColumnConfig";
import { createRecord, deleteRecord } from "@/lib/services/customTableService";
import { useCompany } from "@/components/CompanyContext";
import ResourcePermissionsPanel from "@/components/ResourcePermissionsPanel";
import { createArchiveRequest, usePendingArchiveRequests } from "@/lib/archiveRequests";
import type { CustomTable } from "@/lib/hooks/useCustomTables";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { pickCreateFields } from "@/components/dashboard/NewRecordModal";
import { useProgressBar } from "@/components/TopProgressBar";
import RecordDashboard from "@/components/dashboard/RecordDashboard";
import ColumnConfigDrawer from "@/components/ColumnConfigDrawer";
// Only NewRecordModal stays deferred here -- it's not needed for this
// page's own initial list view and, unlike the two above, isn't also
// dynamic-imported from GenericMasterTable.tsx. RecordDashboard/
// ColumnConfigDrawer are imported statically instead of via next/dynamic()
// specifically because GenericMasterTable.tsx now dynamic-imports those
// same two components too (see its own history) -- two routes each lazily
// referencing the same chunk is exactly the pattern that trips Turbopack
// dev-mode chunk-loading races on a client-side transition between them
// (reported: navigating from a custom table to a system table hangs).
// Static here removes this route's side of that shared-chunk overlap;
// small components anyway (i.e. hardly hurt by not deferring), so not
// worth the risk to keep deferred.
const NewRecordModal = dynamic(() => import("@/components/dashboard/NewRecordModal"));
const DisbursementInvoiceImportModal = dynamic(() => import("@/components/dashboard/DisbursementInvoiceImportModal"));
import { perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";
import type { ActiveFilter } from "@/lib/types/filters";
import { matchesAllFilters } from "@/lib/filterMatch";
import { savedViewsService, readCachedDefaultFilters, writeCachedDefaultFilters } from "@/lib/services/savedViewsService";

interface Props {
  tableSlug: string;
}

const RELATION_FIELD_TYPES = ['table_relation', 'entity', 'project', 'property'];

interface DrillField {
  id: string;
  label: string;
  fieldType?: string;
  targetKind?: 'custom' | 'system';
  targetFieldId?: string;
  targetFieldKey?: string;
}

// Fetches the fields available on a relation field's target -- another
// custom table (via company_table_fields) or a system table (via
// company_custom_fields, since a system table's native columns aren't
// exposed here). Feeds ColumnConfigDrawer's `loadSubFields` -- its own top
// comment already anticipated this exact case ("a lazy loader (custom
// tables, which have no such precomputed data)").
async function loadRelationSubFields(field: CustomTableField): Promise<DrillField[]> {
  if (field.field_type === 'table_relation' && field.linked_table_id) {
    const { data } = await supabase
      .from('company_table_fields')
      .select('id, field_key, label, field_type')
      .eq('table_id', field.linked_table_id)
      .is('deleted_at', null)
      .order('display_order');
    return (data || []).map(f => ({
      id: `related:${field.id}:custom:${f.id}`,
      label: f.label,
      fieldType: f.field_type,
      targetKind: 'custom' as const,
      targetFieldId: f.id,
      targetFieldKey: f.field_key,
    }));
  }
  if (field.linked_system_table) {
    const { data } = await supabase
      .from('company_custom_fields')
      .select('id, field_key, label, field_type')
      .eq('table_name', field.linked_system_table)
      .is('deleted_at', null)
      .order('display_order');
    return (data || []).map(f => ({
      id: `related:${field.id}:system:${f.id}`,
      label: f.label,
      fieldType: f.field_type,
      targetKind: 'system' as const,
      targetFieldId: f.id,
      targetFieldKey: f.field_key,
    }));
  }
  return [];
}

// A drilled-in column's id encodes everything needed to resolve its value
// later without re-fetching the drill-in list: related:<relationFieldId>:
// <custom|system>:<targetFieldId>.
function parseRelatedColId(colId: string): { relationFieldId: string; targetKind: 'custom' | 'system'; targetFieldId: string } | null {
  if (!colId.startsWith('related:')) return null;
  const parts = colId.split(':');
  if (parts.length !== 4) return null;
  const [, relationFieldId, targetKind, targetFieldId] = parts;
  if (targetKind !== 'custom' && targetKind !== 'system') return null;
  return { relationFieldId, targetKind, targetFieldId };
}

// Plain-object mirror of the relatedValues/relatedColMeta Maps below, for
// localStorage -- keyed by tableSlug (known immediately, unlike tableDef.id
// which only resolves once useCustomTable's own fetch lands) so a repeat
// visit can seed both from cache on the very first render instead of
// starting blank and only filling in once the network round trip below
// resolves, same "paint instantly, revalidate in background" shape as the
// rest of the app's shell caches.
interface CachedRelatedCols {
  meta: Record<string, { headerLabel: string }>;
  values: Record<string, Record<string, string>>;
}
const relatedColsCacheKey = (companyId: string, tableSlug: string) => `related_cols_${companyId}_${tableSlug}`;

// ── Format a cell value for display ───────────────────────────────
// Relation-type fields store a target record id in `values` -- the resolved
// label lives in `record.displayValues` (populated by useCustomTable), so
// those need the whole record, not just the raw value.
function formatValue(record: CustomTableRecord, field: CustomTableField): string {
  const value = record.values[field.field_key];
  if (value === null || value === undefined || value === '') return '-';
  if (RELATION_FIELD_TYPES.includes(field.field_type)) return record.displayValues[field.field_key] ?? 'Untitled';
  if (field.field_type === 'boolean') return value ? 'Yes' : 'No';
  if (field.field_type === 'currency') return `$${Number(value).toLocaleString()}`;
  if (field.field_type === 'date') {
    try { return new Date(value).toLocaleDateString('en-AU'); } catch { return String(value); }
  }
  return String(value);
}

// ── Main component ─────────────────────────────────────────────────
function CustomTableMasterPageInner({ tableSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id');
  const viewId = searchParams.get('view');
  // Sidebar's "All (no filter)" sets this to signal a real reset -- see
  // GenericMasterTable.tsx's matching comment.
  const clearFiltersSignal = searchParams.get('clearFilters');

  const { tableDef, fields, records, loading, recordsLoading, refetch } = useCustomTable(tableSlug);
  const { isAdmin, companyId: ctxCompanyId, userId: ctxUserId, myTeamIds: ctxMyTeamIds } = useCompany();

  // ── Top progress bar ───────────────────────────────────────────────────
  // Matches GenericMasterTable's own loading treatment (see that file) so
  // switching between a system table and a custom one doesn't visibly
  // change how "still loading" is communicated.
  const { start: startProgress, done: doneProgress } = useProgressBar();
  const wasLoadingRef = React.useRef(false);
  useEffect(() => {
    if (loading && !wasLoadingRef.current) {
      wasLoadingRef.current = true;
      startProgress();
    } else if (!loading && wasLoadingRef.current) {
      wasLoadingRef.current = false;
      doneProgress();
    }
  }, [loading, startProgress, doneProgress]);
  useEffect(() => () => { if (wasLoadingRef.current) doneProgress(); }, [doneProgress]);

  // Tracks this URL's own start->ready boundary for Admin > Performance --
  // keyed by tableSlug (not just mount) since navigating client-side between
  // tables reuses this same component instance rather than remounting it.
  const perfStartedForRef = React.useRef<string | null>(null);
  const perfReadyForRef = React.useRef<string | null>(null);
  useEffect(() => {
    if (perfStartedForRef.current !== tableSlug) {
      perfStartedForRef.current = tableSlug;
      perfLogPageStart("table", tableSlug);
    }
  }, [tableSlug]);
  useEffect(() => {
    if (!loading && tableDef && perfReadyForRef.current !== tableSlug) {
      perfReadyForRef.current = tableSlug;
      perfLogPageReady("table", tableSlug);
    }
  }, [loading, tableDef, tableSlug]);

  const [search, setSearch] = useState('');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isImportingInvoice, setIsImportingInvoice] = useState(false);
  const { pendingIds: pendingArchiveIds, refreshPendingArchiveRequests } = usePendingArchiveRequests("company_table_records", companyId);

  // ── Filters ──────────────────────────────────────────────────────────
  // Same savedViewsService-backed persistence GenericMasterTable.tsx uses
  // for system tables -- either the selected named view (?view=<id>) or,
  // with no view selected, an implicit per-user/per-table default slot.
  // Lazily seeded from cache for the no-?view= case, same reasoning as
  // GenericMasterTable.tsx's own lazy initializer.
  const [filters, setFilters] = useState<ActiveFilter[]>(() => {
    if (viewId || !ctxCompanyId || !ctxUserId) return [];
    return readCachedDefaultFilters(ctxCompanyId, ctxUserId, tableSlug)?.filters ?? [];
  });
  const [activeViewName, setActiveViewName] = useState<string | null>(null);
  const filtersReadyToSave = React.useRef(false);

  useEffect(() => {
    const loadFilters = async () => {
      if (clearFiltersSignal) {
        filtersReadyToSave.current = false;
        try {
          setActiveViewName(null);
          setFilters([]);
          if (ctxUserId && ctxCompanyId) {
            await savedViewsService.saveDefaultFilters(ctxUserId, ctxCompanyId, tableSlug, []);
            writeCachedDefaultFilters(ctxCompanyId, ctxUserId, tableSlug, []);
          }
          router.replace(`/dashboard/${tableSlug}`);
        } finally {
          setTimeout(() => { filtersReadyToSave.current = true; }, 100);
        }
        return;
      }

      if (!viewId) {
        setActiveViewName(null);
        if (!ctxUserId || !ctxCompanyId) {
          setFilters([]);
          return;
        }

        const cached = readCachedDefaultFilters(ctxCompanyId, ctxUserId, tableSlug);
        if (cached) {
          setFilters(cached.filters);
          setTimeout(() => { filtersReadyToSave.current = true; }, 100);
          savedViewsService.getDefaultFilters(ctxUserId, ctxCompanyId, tableSlug)
            .then(fresh => {
              writeCachedDefaultFilters(ctxCompanyId, ctxUserId, tableSlug, fresh);
              if (JSON.stringify(fresh) !== JSON.stringify(cached.filters)) setFilters(fresh);
            })
            .catch(() => {});
          return;
        }

        filtersReadyToSave.current = false;
        try {
          const defaultFilters = await savedViewsService.getDefaultFilters(ctxUserId, ctxCompanyId, tableSlug);
          writeCachedDefaultFilters(ctxCompanyId, ctxUserId, tableSlug, defaultFilters);
          setFilters(defaultFilters);
        } finally {
          setTimeout(() => { filtersReadyToSave.current = true; }, 100);
        }
        return;
      }

      // Named view (?view=<id>) -- not cached, same as GenericMasterTable.tsx.
      filtersReadyToSave.current = false;
      try {
        const view = await savedViewsService.get(viewId);
        setFilters(view?.filters || []);
        setActiveViewName(view?.view_name || null);
      } finally {
        setTimeout(() => { filtersReadyToSave.current = true; }, 100);
      }
    };
    loadFilters();
  }, [viewId, clearFiltersSignal, ctxUserId, ctxCompanyId, tableSlug, router]);

  useEffect(() => {
    if (!filtersReadyToSave.current) return;

    if (viewId) {
      savedViewsService.updateFilters(viewId, filters);
    } else if (ctxUserId && ctxCompanyId) {
      savedViewsService.saveDefaultFilters(ctxUserId, ctxCompanyId, tableSlug, filters);
      writeCachedDefaultFilters(ctxCompanyId, ctxUserId, tableSlug, filters);
    }
  }, [filters, viewId, ctxUserId, ctxCompanyId, tableSlug]);

  // Default column layout before any company_default_views row exists yet --
  // first 6 show_in_table fields (or first 6 fields), the rest start in the
  // expand panel. allow_multiple relations are excluded entirely (a single
  // table cell can't meaningfully show a many-valued relation) -- their
  // fields are still reachable via the drill-in folder in drawerSections.
  const { defaultCols, defaultExpandCols } = useMemo(() => {
    const eligible = fields.filter(f => !f.allow_multiple);
    const preferred = eligible.filter(f => f.show_in_table);
    const chosen = (preferred.length > 0 ? preferred : eligible).slice(0, 6);
    const chosenIds = new Set(chosen.map(f => f.id));
    const rest = eligible.filter(f => !chosenIds.has(f.id)).map(f => f.id);
    return { defaultCols: chosen.map(f => f.id), defaultExpandCols: rest };
  }, [fields]);

  // Column config (tableCols/expandCols/colWidths/sort), persisted to the
  // same company_default_views row + admin-only reorder/resize/three-state
  // toggle system tables use (see useTableColumnConfig.ts / usePresetTable.ts)
  // -- previously this page kept its own local-only visible/hidden Set that
  // reset on every reload and never reached other team members.
  const cc = useTableColumnConfig({
    tableSlug,
    defaultCols,
    defaultExpandCols,
    companyId: ctxCompanyId,
    userId: ctxUserId,
    myTeamIds: ctxMyTeamIds,
    isAdmin,
    schemaReady: !loading,
  });

  // ── Column setup drawer sections ────────────────────────────────────
  // One "Fields" section listing every native field, plus a drill-in
  // "folder" per relation field (mirrors GenericMasterTable's crossFolders/
  // relationFolders) -- a many-valued relation only gets the folder (its
  // own combined value can't be a column), a single-valued one gets both a
  // plain toggle row AND a folder into its target's fields.
  const drawerSections = useMemo(() => {
    const leaf = fields
      .filter(f => !f.allow_multiple)
      .map(f => ({ id: f.id, label: f.label, fieldType: f.field_type }));

    const folders = fields
      .filter(f => RELATION_FIELD_TYPES.includes(f.field_type) && (f.linked_table_id || f.linked_system_table))
      .map(f => ({
        id: `__related__:${f.id}`,
        label: f.label,
        navigateOnly: true as const,
        manyRelation: f.allow_multiple || undefined,
        loadSubFields: async () => {
          const subs = await loadRelationSubFields(f);
          return f.allow_multiple ? subs.map(s => ({ ...s, expandOnly: true })) : subs;
        },
      }));

    return [{ label: 'Fields', fields: [...leaf, ...folders] }];
  }, [fields]);

  // ── Drilled-in related column values ────────────────────────────────
  // Batch-resolves every visible related column's values (and target
  // field's own label, for the header) in one query pair per column, not
  // one per row -- same batching approach as resolveRelationLabels in
  // useCustomTable.ts.
  const relatedColIds = useMemo(
    () => Array.from(new Set([...cc.tableCols, ...cc.expandCols].filter(id => id.startsWith('related:')))),
    [cc.tableCols, cc.expandCols]
  );

  // records gets a brand-new array reference on every navigation to this
  // table (useCustomTable always live-fetches), which -- before this --
  // re-ran this effect's own network calls (a metaTable lookup for the
  // target field's label, practically never-changing, plus a values lookup)
  // on literally every single visit, even when the actual set of ids being
  // looked up (and their label/values) was identical to last time. Deriving
  // a flat, comparable key from just the ids this effect actually cares
  // about -- recomputed cheaply (no network) whenever records changes, but
  // only used to decide whether the expensive effect below needs to re-run
  // at all -- fixes that without losing correctness when a record's related
  // link genuinely changes.
  const relatedTargetIdsByCol = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const colId of relatedColIds) {
      const parsed = parseRelatedColId(colId);
      if (!parsed) continue;
      const relationField = fields.find(f => f.id === parsed.relationFieldId);
      if (!relationField) continue;
      const ids = Array.from(new Set(
        records.flatMap(r => {
          const v = r.values[relationField.field_key];
          return Array.isArray(v) ? v : (v ? [v] : []);
        })
      )).sort();
      map.set(colId, ids);
    }
    return map;
  }, [relatedColIds, records, fields]);
  const relatedTargetIdsKey = useMemo(
    () => Array.from(relatedTargetIdsByCol.entries()).map(([colId, ids]) => `${colId}=${ids.join(',')}`).join('|'),
    [relatedTargetIdsByCol]
  );

  const [relatedValues, setRelatedValues] = useState<Map<string, Map<string, string>>>(() => {
    const cached = ctxCompanyId ? readCache<CachedRelatedCols>(relatedColsCacheKey(ctxCompanyId, tableSlug)) : null;
    if (!cached) return new Map();
    return new Map(Object.entries(cached.values).map(([colId, byTarget]) => [colId, new Map(Object.entries(byTarget))]));
  });
  const [relatedColMeta, setRelatedColMeta] = useState<Map<string, { headerLabel: string }>>(() => {
    const cached = ctxCompanyId ? readCache<CachedRelatedCols>(relatedColsCacheKey(ctxCompanyId, tableSlug)) : null;
    if (!cached) return new Map();
    return new Map(Object.entries(cached.meta));
  });
  useEffect(() => {
    if (relatedColIds.length === 0) {
      setRelatedValues(new Map());
      setRelatedColMeta(new Map());
      return;
    }
    let active = true;
    (async () => {
      const nextValues = new Map<string, Map<string, string>>();
      const nextMeta = new Map<string, { headerLabel: string }>();
      await Promise.all(relatedColIds.map(async colId => {
        const parsed = parseRelatedColId(colId);
        if (!parsed) return;
        const relationField = fields.find(f => f.id === parsed.relationFieldId);
        if (!relationField) return;
        const valuesTable = parsed.targetKind === 'custom' ? 'company_table_values' : 'company_custom_field_values';
        const metaTable = parsed.targetKind === 'custom' ? 'company_table_fields' : 'company_custom_fields';
        const targetIds = relatedTargetIdsByCol.get(colId) || [];
        const [{ data: targetField }, { data: values }] = await Promise.all([
          supabase.from(metaTable).select('label').eq('id', parsed.targetFieldId).maybeSingle(),
          targetIds.length
            ? supabase.from(valuesTable).select('record_id, value_text, value_number, value_date, value_boolean').eq('field_id', parsed.targetFieldId).in('record_id', targetIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        // Just the target field's own label -- prefixing the relation
        // field's name too (e.g. "Matter · Matter Number") was redundant
        // for the common case of a table with only one relation field to
        // that target, which is the only case this ever runs against today.
        nextMeta.set(colId, { headerLabel: targetField?.label ?? 'Field' });
        const byTarget = new Map<string, string>();
        (values || []).forEach((v: any) => {
          const val = v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean !== null ? String(v.value_boolean) : null);
          if (val !== null && val !== undefined) byTarget.set(v.record_id, String(val));
        });
        nextValues.set(colId, byTarget);
      }));
      if (active) {
        const nextMetaObj = Object.fromEntries(nextMeta);
        const nextValuesObj = Object.fromEntries(Array.from(nextValues.entries()).map(([colId, byTarget]) => [colId, Object.fromEntries(byTarget)]));
        // Bail out to the same Map reference when this revalidate just
        // confirms the cache-seeded value was already correct -- otherwise
        // every mount/revisit forces a re-render of every drilled-in
        // "related" column even when nothing changed, which is what showed
        // up as a column header/value flashing to its "Related field"/blank
        // fallback and back on every click-away-click-back, not just first
        // load (confirmed: this effect ran unconditionally regardless of
        // the lazy useState initializers above already having seeded real
        // data from cache).
        setRelatedColMeta(prev => JSON.stringify(Object.fromEntries(prev)) === JSON.stringify(nextMetaObj) ? prev : nextMeta);
        setRelatedValues(prev => {
          const prevObj = Object.fromEntries(Array.from(prev.entries()).map(([colId, byTarget]) => [colId, Object.fromEntries(byTarget)]));
          return JSON.stringify(prevObj) === JSON.stringify(nextValuesObj) ? prev : nextValues;
        });
        if (ctxCompanyId) {
          writeCache(relatedColsCacheKey(ctxCompanyId, tableSlug), { meta: nextMetaObj, values: nextValuesObj });
        }
      }
    })();
    return () => { active = false; };
    // relatedTargetIdsKey stands in for records -- see relatedTargetIdsByCol's
    // doc comment above for why depending on records directly re-ran this on
    // every navigation regardless of whether anything it reads had changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relatedColIds, relatedTargetIdsKey, fields]);

  const resolveValue = useCallback((record: CustomTableRecord, colId: string): string => {
    const parsed = parseRelatedColId(colId);
    if (parsed) {
      const relationField = fields.find(f => f.id === parsed.relationFieldId);
      if (!relationField) return '-';
      const raw = record.values[relationField.field_key];
      const targetIds: string[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      if (targetIds.length === 0) return '-';
      const byTarget = relatedValues.get(colId);
      const labels = targetIds.map(id => byTarget?.get(id)).filter((l): l is string => !!l);
      return labels.length ? labels.join(', ') : '-';
    }
    const field = fields.find(f => f.id === colId);
    if (!field) return '-';
    return formatValue(record, field);
  }, [fields, relatedValues]);

  const resolveColLabel = useCallback((colId: string): string => {
    const parsed = parseRelatedColId(colId);
    if (parsed) return relatedColMeta.get(colId)?.headerLabel ?? 'Related field';
    const field = fields.find(f => f.id === colId);
    return field?.label ?? 'Deleted field';
  }, [fields, relatedColMeta]);

  // Primary display field
  const primaryField = useMemo(
    () => fields.find(f => f.field_key === tableDef?.primary_field_key) || fields[0],
    [fields, tableDef]
  );

  // Relation-type fields excluded -- their raw stored value is a linked
  // record's id, not meaningful text to compare a filter's value against
  // (matches GenericMasterTable.tsx's own filterableFields, which excludes
  // its 'relation' category columns for the same reason).
  const filterableFields = useMemo(
    () => fields
      .filter(f => !RELATION_FIELD_TYPES.includes(f.field_type) && !f.allow_multiple)
      .map(f => ({ id: f.id, label: f.label, fieldType: f.field_type, options: f.select_options || undefined })),
    [fields]
  );

  // Filtered + sorted records
  const filteredRecords = useMemo(() => {
    let result = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      // Every column currently shown (table + expand panel), not just the
      // primary field -- via resolveValue so relation fields are matched
      // on their linked record's display name, not the raw id that a plain
      // r.values scan would've searched instead.
      const searchCols = [...new Set([
        ...(primaryField ? [primaryField.id] : []),
        ...cc.tableCols, ...cc.expandCols,
      ])];
      result = result.filter(r =>
        searchCols.some(colId => resolveValue(r, colId).toLowerCase().includes(q))
      );
    }
    if (filters.length > 0) {
      result = result.filter(r => matchesAllFilters(filters, fieldId => {
        const field = fields.find(f => f.id === fieldId);
        return field ? r.values[field.field_key] : undefined;
      }));
    }
    const sort = cc.sort;
    if (!sort) return result;
    return [...result].sort((a, b) => {
      const va = resolveValue(a, sort.colId);
      const vb = resolveValue(b, sort.colId);
      const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [records, search, primaryField, cc.tableCols, cc.expandCols, cc.sort, resolveValue, filters, fields]);

  // Fields the NewRecordModal prompts for -- the primary field plus every
  // other required field, so creating a record here never starts from an
  // empty row or leaves a required field unset.
  const createFields = useMemo(
    () => pickCreateFields(fields, tableDef?.primary_field_key),
    [fields, tableDef]
  );

  const handleCreate = async (newValues: Record<string, any>): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from('profiles').select('active_company_id').eq('id', user?.id).single();
    const cid = prof?.active_company_id;
    setCompanyId(cid || null);
    if (!cid || !user || !tableDef) return 'Not signed in.';

    const rec = await createRecord(tableDef.id, cid, user.id, newValues, fields);
    if (rec && 'error' in rec) return rec.error;
    if (rec) {
      refetch();
      // Pure line-item tables (Time & Fee Entries etc.) have nowhere
      // meaningful to navigate to -- see disable_record_dashboard's doc
      // comment in lib/hooks/useCustomTables.ts. Staying on the list (which
      // refetch() above already brings up to date) is the correct landing
      // spot, same as every other table would show once you closed the
      // record dashboard anyway.
      if (!tableDef.disable_record_dashboard) router.push(`/dashboard/${tableSlug}?id=${rec.id}`);
      return null;
    }
    return 'Could not create the record.';
  };

  const handleDelete = async (record: CustomTableRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    // Relation-type primary fields must resolve through displayValues -- the
    // raw stored value is a linked-record id (or array of ids), never safe
    // to show as-is if the label lookup hasn't resolved (or the linked
    // record was deleted).
    const label = primaryField
      ? RELATION_FIELD_TYPES.includes(primaryField.field_type)
        ? (record.displayValues[primaryField.field_key] ?? 'this record')
        : String(record.values[primaryField.field_key] ?? 'this record')
      : 'this record';

    if (!isAdmin) {
      if (!window.confirm(`Request archiving "${label}"? A company admin will need to approve it.`)) return;
      if (!companyId) return;
      const result = await createArchiveRequest("company_table_records", record.id, String(label), companyId);
      if (!result.ok) { window.alert(result.error); return; }
      window.alert(result.alreadyPending ? "Already requested. Waiting on admin review." : "Archive requested. A company admin will review it.");
      refreshPendingArchiveRequests();
      return;
    }

    if (!window.confirm('Archive this record?')) return;
    setDeletingId(record.id);
    const result = await deleteRecord(record.id);
    if (result && 'error' in result) window.alert(result.error);
    setDeletingId(null);
    refetch();
  };

  // Exports ALL fields (not just visible columns) for the records currently
  // shown (so an active search narrows the export). Relation fields export
  // their resolved display label, not the raw record id; currency/date/number
  // export raw stored values so the spreadsheet can compute over them.
  const handleExportCsv = () => {
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const csvValue = (record: CustomTableRecord, field: CustomTableField): string => {
      const value = record.values[field.field_key];
      if (value === null || value === undefined || value === '') return '';
      if (RELATION_FIELD_TYPES.includes(field.field_type)) return record.displayValues[field.field_key] ?? '';
      if (field.field_type === 'boolean') return value ? 'Yes' : 'No';
      return String(value);
    };
    const rows = [
      fields.map(f => esc(f.label)).join(','),
      ...filteredRecords.map(r => fields.map(f => esc(csvValue(r, f))).join(',')),
    ];
    // BOM so Excel/Sheets detect UTF-8
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSort = (colId: string, direction: 'asc' | 'desc') => {
    cc.handleSort(colId, direction);
  };

  // ── Dashboard view ─────────────────────────────────────────────
  if (selectedId && tableDef) {
    return (
      <RecordDashboard
        tableId={tableDef.id}
        tableSlug={tableSlug}
        tableName={tableDef.name}
        recordId={selectedId}
        onBack={() => {
          refetch();
          router.push(`/dashboard/${tableSlug}`);
        }}
      />
    );
  }
  if (loading || !tableDef || !cc.loaded) {
    // Mirrors GenericMasterTable's own loading skeleton so a custom table
    // and a system table (Properties/Entities/Projects/Tasks) look the same
    // while loading, not just once loaded -- the top progress bar above
    // covers the rest of the "something is happening" signal.
    return (
      <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased overflow-hidden">
        {/* Header skeleton -- pt-16/md:pt-8 matches the real header below
            (see its own comment) so there's no layout jump once it loads. */}
        <div className="bg-white border-b border-slate-100 shrink-0 pt-16 md:pt-8 px-8 pb-4 space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 bg-slate-100 animate-pulse rounded-2xl shrink-0" />
              <div className="h-8 w-40 bg-slate-100 animate-pulse rounded-full" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-20 bg-slate-100 animate-pulse rounded-full" />
              <div className="h-9 w-28 bg-slate-100 animate-pulse rounded-full" />
              <div className="h-9 w-24 bg-slate-100 animate-pulse rounded-full" />
              <div className="h-9 w-28 bg-slate-100 animate-pulse rounded-full" />
            </div>
          </div>
          {/* Search bar skeleton */}
          <div className="h-12 w-full bg-slate-100 animate-pulse rounded-2xl" />
        </div>
        {/* Table skeleton */}
        <div className="flex-1 overflow-hidden p-8">
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {/* Column headers */}
            <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 bg-slate-50">
              {[120, 200, 160, 140, 180].map((w, i) => (
                <div key={i} className="h-3 bg-slate-200 animate-pulse rounded-full shrink-0" style={{ width: w }} />
              ))}
            </div>
            {/* Rows */}
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5 border-b border-slate-50 last:border-0">
                {[120, 200, 160, 140, 180].map((w, j) => {
                  const factor = [0.9, 0.7, 1, 0.6, 0.8, 0.95, 0.75, 0.85, 0.65, 0.9, 0.7, 1][(i + j) % 12];
                  return <div key={j} className="h-3 bg-slate-100 animate-pulse rounded-full shrink-0" style={{ width: Math.round(w * factor) }} />;
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const IconComp = (LucideIcons as any)[tableDef.icon] || LucideIcons.Table2;
  const tableContentWidth = cc.tableCols.reduce((sum, colId) => sum + (cc.colWidths[colId] || 250), 0) + 96;

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 shrink-0">
        {/* pt-16 on mobile -- Sidebar.tsx's hamburger toggle is a fixed
            top-3 left-3 button (md:hidden), floating outside this header's
            own layout; without the extra clearance it visually overlaps
            the title below instead of sitting above it. */}
        <div className="pt-16 md:pt-8 px-8 pb-4">
          {/* Wrap instead of overflowing on narrow (mobile) widths -- the
              page shell clips overflow, so a non-wrapping row here just
              pushes buttons off-screen rather than squeezing them. */}
          <div className="flex flex-wrap justify-between items-center gap-3 mb-8">
            <div className="flex items-center gap-4">
              <div
                className="h-10 w-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${tableDef.color}20` }}
              >
                <IconComp size={20} style={{ color: tableDef.color }} />
              </div>
              <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">
                {tableDef.name}
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              {tableDef && ctxCompanyId && (
                <ResourcePermissionsPanel
                  resourceType="table"
                  resourceId={tableDef.id}
                  resourceName={tableDef.name}
                  companyId={ctxCompanyId}
                />
              )}
              <button
                onClick={() => setIsConfigOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100"
              >
                <Settings2 size={16} /> Setup
                {filters.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded-full text-[9px] font-bold">
                    {filters.length}
                  </span>
                )}
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100"
              >
                <Download size={16} /> Export CSV
              </button>
              {tableDef.slug === "disbursements" && (
                <button
                  onClick={() => setIsImportingInvoice(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100"
                >
                  <Upload size={16} /> Import from PDF
                </button>
              )}
              <button
                onClick={() => {
                  if (!createFields.length) {
                    window.alert('Add a field to this table first. Records can\'t be created empty.');
                    return;
                  }
                  setIsCreating(true);
                }}
                className="bg-slate-900 text-white px-6 py-2 rounded-full text-[11px] font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
              >
                <Plus size={14} />
                New record
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300"
              size={20}
            />
            <input
              placeholder={`Search ${tableDef.name.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-14 pr-8 text-sm font-medium outline-none focus:ring-8 focus:ring-black/5 transition-all"
            />
          </div>

          {/* Active filter chips -- same treatment as GenericMasterTable.tsx */}
          {filters.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mt-4">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">
                Filters:
              </span>
              {filters.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full"
                >
                  <span className="text-[11px] font-bold text-indigo-700">{f.label}</span>
                  <span className="text-[10px] text-indigo-400">{f.operator.replace(/_/g, ' ')}</span>
                  {f.value && (
                    <span className="text-[11px] font-bold text-indigo-700">{f.value}</span>
                  )}
                  <button
                    onClick={() => setFilters(prev => prev.filter((_, fi) => fi !== i))}
                    className="text-indigo-300 hover:text-indigo-700 transition-colors ml-0.5"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setFilters([])}
                className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── New record prompt ── */}
      {isCreating && createFields.length > 0 && (
        <NewRecordModal
          tableName={tableDef.name}
          fields={createFields}
          onCreate={handleCreate}
          onClose={() => setIsCreating(false)}
        />
      )}

      {isImportingInvoice && (
        <DisbursementInvoiceImportModal
          onClose={() => setIsImportingInvoice(false)}
          onImported={() => refetch()}
        />
      )}

      {/* ── Column config drawer -- same component + persisted shape as
          system tables (see GenericMasterTable.tsx) ── */}
      <ColumnConfigDrawer
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        sections={drawerSections}
        tableCols={cc.tableCols}
        expandCols={cc.expandCols}
        activePresetName={activeViewName ?? cc.activePreset}
        onToggle={cc.handleToggleColumn}
        filters={filters}
        filterableFields={filterableFields}
        onFiltersChange={setFilters}
        isAdmin={isAdmin}
        resolveColLabel={resolveColLabel}
        onReorderTableCols={cc.handleReorder}
      />

      {/* ── Main table ── */}
      <main className="flex-1 flex flex-col min-h-0 overflow-x-auto bg-[#F9FAFB] p-8">
        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div
              className="h-16 w-16 rounded-3xl flex items-center justify-center"
              style={{ backgroundColor: `${tableDef.color}15` }}
            >
              <IconComp size={28} style={{ color: tableDef.color }} />
            </div>
            <p className="text-slate-400 text-[11px] uppercase font-bold tracking-widest">
              {recordsLoading ? 'Loading…' : search ? 'No records match your search' : 'No records yet'}
            </p>
            {!search && !recordsLoading && (
              <button
                onClick={handleCreate}
                className="text-indigo-600 text-[11px] font-bold uppercase tracking-widest hover:underline"
              >
                Create first record
              </button>
            )}
          </div>
        ) : (
          <DataTable minWidth={Math.max(600, tableContentWidth)}>
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-400">
              <tr>
                {cc.tableCols.map((colId, idx) => {
                  const isActiveSortCol = cc.sort?.colId === colId;
                  return (
                    <th key={colId} style={{ width: cc.colWidths[colId] || 250 }} className="relative group/header select-none p-0">
                      <div className="relative flex items-center h-full">
                        {isAdmin && (
                          <div
                            draggable
                            onDragStart={() => cc.setDraggedIdx(idx)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => {
                              if (cc.draggedIdx === null) return;
                              const next = [...cc.tableCols];
                              const [moved] = next.splice(cc.draggedIdx, 1);
                              next.splice(idx, 0, moved);
                              cc.handleReorder(next);
                              cc.setDraggedIdx(null);
                            }}
                            className="absolute left-1.5 top-1/2 -translate-y-1/2 p-1 rounded cursor-move opacity-40 group-hover/header:opacity-100 hover:bg-slate-200 transition-opacity z-10"
                            title="Reorder column (admin only)"
                          >
                            <GripVertical size={13} />
                          </div>
                        )}

                        <button
                          onClick={() => {
                            if (!isActiveSortCol) handleSort(colId, 'asc');
                            else if (cc.sort?.direction === 'asc') handleSort(colId, 'desc');
                            else handleSort(colId, 'asc');
                          }}
                          title={resolveColLabel(colId)}
                          className={`flex-1 flex items-center gap-1.5 py-5 pl-6 pr-2 uppercase text-[10px] font-bold tracking-widest truncate text-left ${isActiveSortCol ? 'text-indigo-600' : ''}`}
                        >
                          <span className="truncate">{resolveColLabel(colId)}</span>
                          {isActiveSortCol
                            ? (cc.sort?.direction === 'asc' ? <ChevronUp size={12} className="shrink-0" /> : <ChevronDown size={12} className="shrink-0" />)
                            : <ChevronsUpDown size={12} className="text-slate-300 shrink-0" />
                          }
                        </button>

                        {isAdmin && (
                          <div
                            onMouseDown={(e) => cc.startResizing(colId, e)}
                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 z-10"
                            title="Resize column (admin only)"
                          />
                        )}
                      </div>
                    </th>
                  );
                })}
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map(record => {
                const isExpanded = expandedId === record.id;
                const isDeleting = deletingId === record.id;

                return (
                  <React.Fragment key={record.id}>
                    <tr
                      className="border-b border-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer group"
                      onClick={() => tableDef?.disable_record_dashboard
                        ? setExpandedId(isExpanded ? null : record.id)
                        : router.push(`/dashboard/${tableSlug}?id=${record.id}`)}
                    >
                      {cc.tableCols.map((colId, idx) => {
                        const value = resolveValue(record, colId);
                        // Expand toggle lives inside the first column, to the
                        // right of its value -- where the old "open record"
                        // icon used to sit, since the whole row opens the
                        // record now instead.
                        const showExpandToggle = idx === 0 && cc.expandCols.length > 0;
                        return (
                          <td
                            key={colId}
                            title={value !== '-' ? value : undefined}
                            className="p-6 truncate font-medium text-slate-700"
                          >
                            {idx === 0 ? (
                              showExpandToggle ? (
                                <span className="flex items-center justify-between gap-2 group/expand">
                                  <span className="min-w-0 truncate flex-1 font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                    {value}
                                  </span>
                                  <button
                                    onClick={e => { e.stopPropagation(); setExpandedId(isExpanded ? null : record.id); }}
                                    className="p-1 -m-1 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 shrink-0 transition-all"
                                    title={isExpanded ? 'Collapse' : 'Expand'}
                                  >
                                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  </button>
                                </span>
                              ) : (
                                <span className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                  {value}
                                </span>
                              )
                            ) : value}
                          </td>
                        );
                      })}
                      <td className="p-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {pendingArchiveIds.has(record.id) && (
                            <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase bg-amber-50 text-amber-600 whitespace-nowrap">
                              Archive requested
                            </span>
                          )}
                          {isDeleting ? (
                            <Loader2 size={14} className="animate-spin text-slate-300" />
                          ) : (
                            <button
                              onClick={e => handleDelete(record, e)}
                              className="p-1.5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                              title="Archive"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {isExpanded && cc.expandCols.length > 0 && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={cc.tableCols.length + 1} className="p-8">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {cc.expandCols.map(colId => {
                              const expandValue = resolveValue(record, colId);
                              return (
                                <div key={colId}>
                                  <p
                                    title={resolveColLabel(colId)}
                                    className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 truncate"
                                  >
                                    {resolveColLabel(colId)}
                                  </p>
                                  <p
                                    title={expandValue !== '-' ? expandValue : undefined}
                                    className="text-[13px] font-medium text-slate-800 truncate"
                                  >
                                    {expandValue}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </DataTable>
        )}
      </main>

    </div>
  );
}

export default function CustomTableMasterPage({ tableSlug }: Props) {
  return (
    <Suspense fallback={null}>
      <CustomTableMasterPageInner tableSlug={tableSlug} />
    </Suspense>
  );
}
