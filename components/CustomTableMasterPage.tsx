// components/CustomTableMasterPage.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Settings2, LayoutGrid, X, Plus, ChevronDown, ChevronUp, ChevronsUpDown, GripVertical, Loader2, Trash2, Download } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import DataTable from "@/components/DataTable";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { useTableColumnConfig } from "@/lib/hooks/useTableColumnConfig";
import { createRecord, deleteRecord } from "@/lib/services/customTableService";
import { useCompany } from "@/components/CompanyContext";
import { createArchiveRequest, usePendingArchiveRequests } from "@/lib/archiveRequests";
import type { CustomTable } from "@/lib/hooks/useCustomTables";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import { pickCreateFields } from "@/components/dashboard/NewRecordModal";
import { useProgressBar } from "@/components/TopProgressBar";
import RecordDashboard from "@/components/dashboard/RecordDashboard";
import SpreadsheetEditor from "@/components/SpreadsheetEditor";
import ColumnConfigDrawer from "@/components/ColumnConfigDrawer";
// Only NewRecordModal stays deferred here -- it's not needed for this
// page's own initial list view and, unlike the three above, isn't also
// dynamic-imported from GenericMasterTable.tsx. RecordDashboard/
// SpreadsheetEditor/ColumnConfigDrawer are imported statically instead of
// via next/dynamic() specifically because GenericMasterTable.tsx now
// dynamic-imports those same three components too (see its own history) --
// two routes each lazily referencing the same chunk is exactly the pattern
// that trips Turbopack dev-mode chunk-loading races on a client-side
// transition between them (reported: navigating from a custom table to a
// system table hangs). Static here removes this route's side of that
// shared-chunk overlap; small components anyway (i.e. hardly hurt by not
// deferring), so not worth the risk to keep deferred.
const NewRecordModal = dynamic(() => import("@/components/dashboard/NewRecordModal"));
import { perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";
import type { ActiveFilter } from "@/lib/types/filters";

interface Props {
  tableSlug: string;
}

// Custom tables don't have a filters feature yet (see ColumnConfigDrawer's
// own Filters tab, unused here) -- passed as a stable module-level constant
// rather than omitted, since ColumnConfigDrawer's `filters` prop defaults to
// a fresh `[]` on every render when left undefined, and its own effect
// syncs draftFilters from that prop on every reference change. A new []
// each render never stops "changing", so its effect never stops firing --
// confirmed live as an infinite render loop ("Maximum update depth
// exceeded") that pins the tab, which is what was actually behind the
// reported "moving between table types freezes the site" bug.
const NO_FILTERS: ActiveFilter[] = [];

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

// ── Format a cell value for display ───────────────────────────────
// Relation-type fields store a target record id in `values` — the resolved
// label lives in `record.displayValues` (populated by useCustomTable), so
// those need the whole record, not just the raw value.
function formatValue(record: CustomTableRecord, field: CustomTableField): string {
  const value = record.values[field.field_key];
  if (value === null || value === undefined || value === '') return '—';
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

  const { tableDef, fields, records, loading, recordsLoading, refetch } = useCustomTable(tableSlug);
  const { isAdmin, companyId: ctxCompanyId } = useCompany();

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
  const [isSpreadsheetOpen, setIsSpreadsheetOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { pendingIds: pendingArchiveIds, refreshPendingArchiveRequests } = usePendingArchiveRequests("company_table_records", companyId);

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

  const [relatedValues, setRelatedValues] = useState<Map<string, Map<string, string>>>(new Map());
  const [relatedColMeta, setRelatedColMeta] = useState<Map<string, { headerLabel: string }>>(new Map());
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
        const targetIds = Array.from(new Set(
          records.flatMap(r => {
            const v = r.values[relationField.field_key];
            return Array.isArray(v) ? v : (v ? [v] : []);
          })
        ));
        const [{ data: targetField }, { data: values }] = await Promise.all([
          supabase.from(metaTable).select('label').eq('id', parsed.targetFieldId).maybeSingle(),
          targetIds.length
            ? supabase.from(valuesTable).select('record_id, value_text, value_number, value_date, value_boolean').eq('field_id', parsed.targetFieldId).in('record_id', targetIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);
        nextMeta.set(colId, { headerLabel: `${relationField.label} · ${targetField?.label ?? 'Field'}` });
        const byTarget = new Map<string, string>();
        (values || []).forEach((v: any) => {
          const val = v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean !== null ? String(v.value_boolean) : null);
          if (val !== null && val !== undefined) byTarget.set(v.record_id, String(val));
        });
        nextValues.set(colId, byTarget);
      }));
      if (active) { setRelatedValues(nextValues); setRelatedColMeta(nextMeta); }
    })();
    return () => { active = false; };
  }, [relatedColIds, records, fields]);

  const resolveValue = useCallback((record: CustomTableRecord, colId: string): string => {
    const parsed = parseRelatedColId(colId);
    if (parsed) {
      const relationField = fields.find(f => f.id === parsed.relationFieldId);
      if (!relationField) return '—';
      const raw = record.values[relationField.field_key];
      const targetIds: string[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
      if (targetIds.length === 0) return '—';
      const byTarget = relatedValues.get(colId);
      const labels = targetIds.map(id => byTarget?.get(id)).filter((l): l is string => !!l);
      return labels.length ? labels.join(', ') : '—';
    }
    const field = fields.find(f => f.id === colId);
    if (!field) return '—';
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

  // Filtered + sorted records
  const filteredRecords = useMemo(() => {
    let result = records;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r => {
        const primary = String(r.values[primaryField?.field_key] || '');
        return primary.toLowerCase().includes(q) ||
          Object.values(r.values).some(v => String(v || '').toLowerCase().includes(q));
      });
    }
    const sort = cc.sort;
    if (!sort) return result;
    return [...result].sort((a, b) => {
      const va = resolveValue(a, sort.colId);
      const vb = resolveValue(b, sort.colId);
      const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' });
      return sort.direction === 'asc' ? cmp : -cmp;
    });
  }, [records, search, primaryField, cc.sort, resolveValue]);

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
    const label = primaryField ? (record.displayValues[primaryField.field_key] ?? String(record.values[primaryField.field_key] ?? 'this record')) : 'this record';

    if (!isAdmin) {
      if (!window.confirm(`Request archiving "${label}"? A company admin will need to approve it.`)) return;
      if (!companyId) return;
      const result = await createArchiveRequest("company_table_records", record.id, String(label), companyId);
      if (!result.ok) { window.alert(result.error); return; }
      window.alert(result.alreadyPending ? "Already requested — waiting on admin review." : "Archive requested — a company admin will review it.");
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
        {/* Header skeleton */}
        <div className="bg-white border-b border-slate-100 shrink-0 p-8 pb-4 space-y-6">
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
        <div className="p-8 pb-4">
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
              <button
                onClick={() => setIsConfigOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100"
              >
                <Settings2 size={16} /> Setup
              </button>
              <button
                onClick={() => setIsSpreadsheetOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100"
              >
                <LayoutGrid size={16} /> Spreadsheet
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold transition-all hover:bg-slate-100"
              >
                <Download size={16} /> Export CSV
              </button>
              <button
                onClick={() => {
                  if (!createFields.length) {
                    window.alert('Add a field to this table first — records can\'t be created empty.');
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

      {/* ── Column config drawer -- same component + persisted shape as
          system tables (see GenericMasterTable.tsx) ── */}
      <ColumnConfigDrawer
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        sections={drawerSections}
        tableCols={cc.tableCols}
        expandCols={cc.expandCols}
        activePresetName={cc.activePreset}
        onToggle={cc.handleToggleColumn}
        filters={NO_FILTERS}
        isAdmin={isAdmin}
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
                        // right of its value — where the old "open record"
                        // icon used to sit, since the whole row opens the
                        // record now instead.
                        const showExpandToggle = idx === 0 && cc.expandCols.length > 0;
                        return (
                          <td
                            key={colId}
                            title={value !== '—' ? value : undefined}
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
                                    title={expandValue !== '—' ? expandValue : undefined}
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

      {/* ── Spreadsheet overlay ── */}
      {isSpreadsheetOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white font-sans">
          <div className="flex items-center justify-between p-6 border-b border-slate-100 shrink-0">
            <h2 className="text-xl font-light uppercase tracking-tight text-slate-900">
              Spreadsheet — {tableDef.name}
            </h2>
            <button
              onClick={() => { setIsSpreadsheetOpen(false); refetch(); }}
              className="p-2 text-slate-300 hover:text-black transition-colors"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 p-6 min-h-0 overflow-hidden">
            <SpreadsheetEditor
              tableName="properties" // SpreadsheetEditor uses system tables for now
              onClose={() => { setIsSpreadsheetOpen(false); refetch(); }}
            />
          </div>
        </div>
      )}
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
