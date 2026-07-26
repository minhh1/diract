// components/CustomTableMasterPage.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Settings2, LayoutGrid, X, Plus, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, Loader2, Trash2, Download } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useCustomTable } from "@/lib/hooks/useCustomTable";
import { createRecord, deleteRecord } from "@/lib/services/customTableService";
import { useCompany } from "@/components/CompanyContext";
import { createArchiveRequest, usePendingArchiveRequests } from "@/lib/archiveRequests";
import SpreadsheetEditor from "@/components/SpreadsheetEditor";
import type { CustomTable } from "@/lib/hooks/useCustomTables";
import type { CustomTableField, CustomTableRecord } from "@/lib/hooks/useCustomTable";
import RecordDashboard from "@/components/dashboard/RecordDashboard";
import NewRecordModal, { pickCreateFields } from "@/components/dashboard/NewRecordModal";
import { useProgressBar } from "@/components/TopProgressBar";
import { perfLogPageStart, perfLogPageReady } from "@/lib/perfLog";

interface Props {
  tableSlug: string;
}

const RELATION_FIELD_TYPES = ['table_relation', 'entity', 'project', 'property'];

// A column pulled from a relation field's target table/row rather than a
// field native to this table -- e.g. showing a Matter relation's "Client
// Email" alongside this table's own columns. Scoped to one hop only (the
// target's own fields, not fields related to THOSE) and, for a
// system-table target, only its custom fields (not full native-column
// parity) -- see loadRelationSubFields below.
interface RelatedColumnDef {
  id: string; // related:<relationFieldId>:<custom|system>:<targetFieldId>
  label: string;
  relationField: CustomTableField;
  targetKind: 'custom' | 'system';
  targetFieldId: string;
  targetFieldKey: string;
  targetFieldType: string;
}

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
// exposed here).
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

// ── Column config drawer — file-explorer-style drill-in for relation
// fields, mirroring ColumnConfigDrawer.tsx's pattern but with this page's
// simpler single-Set toggle model (no separate table/expand placement).
function CustomColumnDrawer({
  isOpen, onClose, fields, visibleFieldIds, onToggleNative,
  visibleRelated, onToggleRelated,
}: {
  isOpen: boolean;
  onClose: () => void;
  fields: CustomTableField[];
  visibleFieldIds: Set<string>;
  onToggleNative: (fieldId: string) => void;
  visibleRelated: RelatedColumnDef[];
  onToggleRelated: (def: RelatedColumnDef) => void;
}) {
  const [drillField, setDrillField] = useState<CustomTableField | null>(null);
  const [subFields, setSubFields] = useState<DrillField[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) setDrillField(null);
  }, [isOpen]);

  const handleDrillIn = async (field: CustomTableField) => {
    setDrillField(field);
    setDrillLoading(true);
    try {
      setSubFields(await loadRelationSubFields(field));
    } finally {
      setDrillLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-80 bg-white h-full shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="text-[13px] font-bold text-slate-800 uppercase tracking-wide">
            Column setup
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-300 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        {drillField && (
          <div className="px-6 pt-4 flex items-center gap-1.5">
            <button
              onClick={() => setDrillField(null)}
              className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700"
            >
              <ChevronLeft size={12} /> Back
            </button>
            <span className="text-[10px] text-slate-300">/</span>
            <span className="text-[10px] font-bold text-slate-500">{drillField.label}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {!drillField ? (
            <>
              {fields.map(field => {
                const visible = visibleFieldIds.has(field.id);
                const canDrillIn = RELATION_FIELD_TYPES.includes(field.field_type)
                  && !!(field.linked_table_id || field.linked_system_table);
                // allow_multiple means this record can link to MANY target
                // records -- a single table cell can't meaningfully show a
                // many-valued relation, so it can't be added as a column
                // itself (its own fields drilled into below still can be,
                // since those get joined across every linked record).
                const isMany = field.allow_multiple;
                return (
                  <div
                    key={field.id}
                    className={`w-full flex items-center gap-2 px-4 py-3 rounded-2xl border transition-all ${
                      visible ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <button
                      onClick={isMany ? undefined : () => onToggleNative(field.id)}
                      disabled={isMany}
                      title={isMany ? 'Multi-value relations can\'t be added as a table column' : undefined}
                      className={`flex items-center gap-3 flex-1 min-w-0 text-left ${isMany ? 'cursor-default opacity-60' : ''}`}
                    >
                      {!isMany && (
                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                          visible ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                        }`}>
                          {visible && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                      )}
                      <span className={`text-[12px] font-medium truncate ${visible ? 'text-indigo-700' : 'text-slate-600'}`}>
                        {field.label}
                      </span>
                      {isMany && (
                        <span className="text-[8px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full shrink-0">
                          Many
                        </span>
                      )}
                      <span className="ml-auto text-[9px] font-bold text-slate-300 uppercase shrink-0">
                        {field.field_type}
                      </span>
                    </button>
                    {canDrillIn && (
                      <button
                        onClick={() => handleDrillIn(field)}
                        title={`Explore ${field.label}'s fields`}
                        className="p-1 rounded-full text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all shrink-0"
                      >
                        <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
              {fields.length === 0 && (
                <p className="text-center text-[11px] text-slate-300 italic py-8">
                  No fields defined yet — add fields in Schema settings
                </p>
              )}
            </>
          ) : drillLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 size={18} className="animate-spin text-slate-300" />
            </div>
          ) : (
            <>
              {subFields.map(sf => {
                const visible = visibleRelated.some(d => d.id === sf.id);
                return (
                  <button
                    key={sf.id}
                    onClick={() => onToggleRelated({
                      id: sf.id,
                      label: `${drillField.label} · ${sf.label}`,
                      relationField: drillField,
                      targetKind: sf.targetKind!,
                      targetFieldId: sf.targetFieldId!,
                      targetFieldKey: sf.targetFieldKey!,
                      targetFieldType: sf.fieldType || 'text',
                    })}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all text-left ${
                      visible ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                      visible ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
                    }`}>
                      {visible && <div className="w-2 h-2 bg-white rounded-sm" />}
                    </div>
                    <span className={`text-[12px] font-medium truncate ${visible ? 'text-indigo-700' : 'text-slate-600'}`}>
                      {sf.label}
                    </span>
                    <span className="ml-auto text-[9px] font-bold text-slate-300 uppercase shrink-0">
                      {sf.fieldType}
                    </span>
                  </button>
                );
              })}
              {subFields.length === 0 && (
                <p className="text-center text-[11px] text-slate-300 italic py-8">
                  No fields on this table yet
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
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

// Same idea as formatValue, but for a RelatedColumnDef column -- the value
// lives on the relation's TARGET record, pre-resolved into `relatedValues`
// by the effect in the main component below (a single batched query per
// visible related column beats one per row/record).
function formatRelatedValue(
  record: CustomTableRecord,
  def: RelatedColumnDef,
  relatedValues: Map<string, Map<string, string>>
): string {
  const raw = record.values[def.relationField.field_key];
  const targetIds: string[] = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  if (targetIds.length === 0) return '—';
  const byTarget = relatedValues.get(def.id);
  const labels = targetIds.map(id => byTarget?.get(id)).filter((l): l is string => !!l);
  return labels.length ? labels.join(', ') : '—';
}

type TableColumn =
  | { kind: 'native'; id: string; label: string; field: CustomTableField }
  | { kind: 'related'; id: string; label: string; def: RelatedColumnDef };

// ── Main component ─────────────────────────────────────────────────
function CustomTableMasterPageInner({ tableSlug }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get('id');

  const { tableDef, fields, records, loading, refetch } = useCustomTable(tableSlug);
  const { isAdmin } = useCompany();

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

  // Which fields are visible as table columns
  const [visibleFieldIds, setVisibleFieldIds] = useState<Set<string> | null>(null);
  // Columns pulled from a relation field's target table (see
  // RelatedColumnDef) -- none by default, added via the drill-in picker.
  const [visibleRelated, setVisibleRelated] = useState<RelatedColumnDef[]>([]);

  // Default: first 6 show_in_table fields, or first 6 fields -- excluding
  // allow_multiple relations, which can't be shown as a table column at all
  // (see CustomColumnDrawer's isMany).
  const defaultVisibleIds = useMemo(() => {
    const eligible = fields.filter(f => !f.allow_multiple);
    const preferred = eligible.filter(f => f.show_in_table).slice(0, 6);
    const fallback = eligible.slice(0, 6);
    return new Set((preferred.length > 0 ? preferred : fallback).map(f => f.id));
  }, [fields]);

  const effectiveVisibleIds = visibleFieldIds || defaultVisibleIds;

  const tableColumns: TableColumn[] = useMemo(() => [
    ...fields.filter(f => effectiveVisibleIds.has(f.id)).map(f => ({ kind: 'native' as const, id: f.id, label: f.label, field: f })),
    ...visibleRelated.map(def => ({ kind: 'related' as const, id: def.id, label: def.label, def })),
  ], [fields, effectiveVisibleIds, visibleRelated]);

  // Batch-resolves every visible related column's values in one query each
  // (not one per row) whenever the selected related columns or the record
  // set changes -- same batching approach as resolveRelationLabels in
  // useCustomTable.ts, just against the relation's TARGET field instead of
  // its display field.
  const [relatedValues, setRelatedValues] = useState<Map<string, Map<string, string>>>(new Map());
  useEffect(() => {
    if (visibleRelated.length === 0) { setRelatedValues(new Map()); return; }
    let active = true;
    (async () => {
      const next = new Map<string, Map<string, string>>();
      await Promise.all(visibleRelated.map(async def => {
        const targetIds = Array.from(new Set(
          records.flatMap(r => {
            const v = r.values[def.relationField.field_key];
            return Array.isArray(v) ? v : (v ? [v] : []);
          })
        ));
        if (targetIds.length === 0) { next.set(def.id, new Map()); return; }
        const table = def.targetKind === 'custom' ? 'company_table_values' : 'company_custom_field_values';
        const { data } = await supabase
          .from(table)
          .select('record_id, value_text, value_number, value_date, value_boolean')
          .eq('field_id', def.targetFieldId)
          .in('record_id', targetIds);
        const byTarget = new Map<string, string>();
        (data || []).forEach((v: any) => {
          const val = v.value_text ?? v.value_number ?? v.value_date ?? (v.value_boolean !== null ? String(v.value_boolean) : null);
          if (val !== null && val !== undefined) byTarget.set(v.record_id, String(val));
        });
        next.set(def.id, byTarget);
      }));
      if (active) setRelatedValues(next);
    })();
    return () => { active = false; };
  }, [visibleRelated, records]);

  // Primary display field
  const primaryField = useMemo(
    () => fields.find(f => f.field_key === tableDef?.primary_field_key) || fields[0],
    [fields, tableDef]
  );

  // Filtered + sorted records
  const filteredRecords = useMemo(() => {
    if (!search.trim()) return records;
    const q = search.toLowerCase();
    return records.filter(r => {
      const primary = String(r.values[primaryField?.field_key] || '');
      return primary.toLowerCase().includes(q) ||
        Object.values(r.values).some(v => String(v || '').toLowerCase().includes(q));
    });
  }, [records, search, primaryField]);

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
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tableSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleToggleField = (fieldId: string) => {
    setVisibleFieldIds(prev => {
      const current = prev || defaultVisibleIds;
      const next = new Set(current);
      if (next.has(fieldId)) {
        if (next.size <= 1) return current; // always keep at least 1 column
        next.delete(fieldId);
      } else {
        next.add(fieldId);
      }
      return next;
    });
  };

  const handleToggleRelated = (def: RelatedColumnDef) => {
    setVisibleRelated(prev => prev.some(d => d.id === def.id) ? prev.filter(d => d.id !== def.id) : [...prev, def]);
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
  if (loading || !tableDef) {
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

  return (
    <div className="flex flex-col h-screen bg-[#F9FAFB] font-sans antialiased text-slate-600 overflow-hidden">

      {/* ── Header ── */}
      <header className="bg-white border-b border-slate-100 shrink-0">
        <div className="p-8 pb-4">
          <div className="flex justify-between items-center mb-8">
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

            <div className="flex gap-2">
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

      {/* ── Column config drawer ── */}
      <CustomColumnDrawer
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        fields={fields}
        visibleFieldIds={effectiveVisibleIds}
        onToggleNative={handleToggleField}
        visibleRelated={visibleRelated}
        onToggleRelated={handleToggleRelated}
      />

      {/* ── Main table ── */}
      <main className="flex-1 overflow-auto p-8">
        {filteredRecords.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div
              className="h-16 w-16 rounded-3xl flex items-center justify-center"
              style={{ backgroundColor: `${tableDef.color}15` }}
            >
              <IconComp size={28} style={{ color: tableDef.color }} />
            </div>
            <p className="text-slate-400 text-[11px] uppercase font-bold tracking-widest">
              {search ? 'No records match your search' : 'No records yet'}
            </p>
            {!search && (
              <button
                onClick={handleCreate}
                className="text-indigo-600 text-[11px] font-bold uppercase tracking-widest hover:underline"
              >
                Create first record
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Table header */}
            <div className="flex bg-slate-50 border-b border-slate-100">
              {tableColumns.map(col => (
                <div
                  key={col.id}
                  className="flex-1 px-6 py-5 text-[10px] font-bold uppercase tracking-widest text-slate-400 min-w-0"
                >
                  {col.label}
                </div>
              ))}
              <div className="w-24 shrink-0" />
            </div>

            {/* Rows */}
            {filteredRecords.map(record => {
              const isExpanded = expandedId === record.id;
              const isDeleting = deletingId === record.id;
              const primaryValue = record.values[primaryField?.field_key] || 'Untitled';

              // Non-visible fields shown in expand panel
              const expandFields = fields.filter(f => !effectiveVisibleIds.has(f.id));

              return (
                <React.Fragment key={record.id}>
                  <div
                    className="flex items-center border-b border-slate-50 hover:bg-indigo-50/20 transition-all cursor-pointer group"
                    onClick={() => tableDef?.disable_record_dashboard
                      ? setExpandedId(isExpanded ? null : record.id)
                      : router.push(`/dashboard/${tableSlug}?id=${record.id}`)}
                  >
                    {tableColumns.map((col, idx) => {
                      const value = col.kind === 'native' ? formatValue(record, col.field) : formatRelatedValue(record, col.def, relatedValues);
                      // Expand toggle lives inside the first column, to the
                      // right of its value — where the old "open record"
                      // icon used to sit, since the whole row opens the
                      // record now instead.
                      const showExpandToggle = idx === 0 && expandFields.length > 0;
                      return (
                        <div
                          key={col.id}
                          className="flex-1 px-6 py-5 text-[13px] font-medium text-slate-700 truncate min-w-0"
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
                              // Primary column — styled as a link
                              <span className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors">
                                {value}
                              </span>
                            )
                          ) : value}
                        </div>
                      );
                    })}

                    {/* Actions */}
                    <div
                      className="w-24 shrink-0 flex items-center justify-end gap-1 px-4"
                      onClick={e => e.stopPropagation()}
                    >
                      {pendingArchiveIds.has(record.id) && (
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase bg-amber-50 text-amber-600 whitespace-nowrap">
                          Archive requested
                        </span>
                      )}
                      {isDeleting ? (
                        <LucideIcons.Loader2 size={14} className="animate-spin text-slate-300" />
                      ) : (
                        <button
                          onClick={e => handleDelete(record, e)}
                          className="p-1.5 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                          title="Archive"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded row — shows hidden fields */}
                  {isExpanded && expandFields.length > 0 && (
                    <div className="border-b border-slate-100 bg-slate-50/60 px-8 py-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                        {expandFields.map(col => (
                          <div key={col.id}>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                              {col.label}
                            </p>
                            <p className="text-[13px] font-medium text-slate-700 truncate">
                              {formatValue(record, col) || '—'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
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