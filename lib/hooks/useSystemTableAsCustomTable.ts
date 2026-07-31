"use client";

// Read-path adapter that makes a system table (projects/properties/entities)
// look exactly like a custom table to the dashboard-widget engine -- same
// return shape as useCustomTable, so DashboardWidgetRenderer/WidgetConfigPanel/
// CanvasEditor/CodeEditor/compute.ts/dsl.ts need zero changes to render a
// dashboard bound to a system table instead of a company_tables row. See
// lib/services/systemTableRecordService.ts for the matching write-path adapter.
//
// Field-id convention (mirrors components/dashboard/RecordDashboard.tsx's
// FieldLayout mapping exactly, so the two stay compatible):
// - native column -> id = field_key = the column name (e.g. "status")
// - company_custom_fields row -> id = field_key = that row's own uuid
// These two id spaces can never collide (column names aren't uuid-shaped).

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { readCache, writeCache } from "@/lib/queryCache";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { getSchemaMetadata } from "@/lib/services/schemaService";
import { resolveRelationLabels, type CustomTableField, type CustomTableRecord } from "./useCustomTable";
import type { CustomTable } from "./useCustomTables";
import {
  SYSTEM_TABLE_HIDDEN_COLS, SYSTEM_TABLE_RELATION_MAP, SYSTEM_TABLE_PERSON_LINK_COLS,
  systemTablePrimaryDisplayColumn,
} from "@/lib/schema/systemTableRelations";

export type SystemTableName = 'projects' | 'properties' | 'entities';
export const SYSTEM_TABLE_NAMES: SystemTableName[] = ['projects', 'properties', 'entities'];

export const systemTableShellKey = (tableName: string, companyId: string) => `system-table:${companyId}:${tableName}`;
// Deliberately its own key, distinct from usePresetTable.ts/prefetchShells.ts's
// `rows_${companyId}_${tableName}` -- that cache holds flat row objects
// (item[colId]), this hook's `records` are CustomTableRecord-shaped
// ({ values: { [field_key]: val } }) to match the dashboard-widget engine's
// expected shape (see this file's own top comment). Same underlying table,
// incompatible cached shapes. Exported so lib/hooks/prefetchShells.ts's
// bootstrap warmer can seed this exact slot for every dashboard sourced
// from one of these 3 system tables.
export const dashboardSourceRowsKey = (tableName: string, companyId: string) => `dashsrc_rows_${companyId}_${tableName}`;

const SYSTEM_TABLE_ICON: Record<SystemTableName, string> = {
  properties: 'MapPin', entities: 'Building2', projects: 'LayoutGrid',
};
const SYSTEM_TABLE_COLOR: Record<SystemTableName, string> = {
  properties: '#6366f1', entities: '#8b5cf6', projects: '#ec4899',
};
// Only holding_entity_id/property_id/etc-style overrides that point at one of
// the three system tables become a relation field here -- e.g. entities'
// type_id -> entity_types isn't a system table, so it falls back to plain text.
const RELATION_FIELD_TYPE_BY_TABLE: Record<string, 'project' | 'property' | 'entity'> = {
  projects: 'project', properties: 'property', entities: 'entity',
};

function deriveNativeFieldType(dataType: string): string {
  if (dataType === 'boolean') return 'boolean';
  if (dataType === 'date' || dataType?.includes('timestamp')) return 'date';
  if (['numeric', 'integer', 'bigint', 'smallint', 'real', 'double precision'].includes(dataType)) return 'number';
  return 'text';
}

export function useSystemTableAsCustomTable(
  tableName: SystemTableName | null,
  companyId: string | null,
  displayName?: string,
): {
  tableDef: CustomTable | null;
  fields: CustomTableField[];
  records: CustomTableRecord[];
  loading: boolean;
  // True until fields are known; mirrors useCustomTable.ts's own split so
  // useDashboardData.ts can read the same two field names regardless of
  // which of these two hooks is actually backing a given dashboard's
  // source table -- see load() below for how fields resolves first.
  recordsLoading: boolean;
  refetch: () => void;
  // See useCustomTable.ts's matching doc comment.
  addRecordOptimistic: (id: string, values: Record<string, any>) => void;
} {
  const [fields, setFields] = useState<CustomTableField[]>([]);
  // Lazily seeded from cache -- same reasoning as useCustomTable.ts's own
  // lazy row initializer.
  const [records, setRecords] = useState<CustomTableRecord[]>(
    () => (tableName && companyId ? readCache<CustomTableRecord[]>(dashboardSourceRowsKey(tableName, companyId)) : null) || []
  );
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(
    () => !(tableName && companyId && readCache<CustomTableRecord[]>(dashboardSourceRowsKey(tableName, companyId)))
  );

  const load = useCallback(async () => {
    if (!tableName || !companyId) return;

    const [cols, { data: customFields }] = await Promise.all([
      getSchemaMetadata(tableName, companyId),
      supabase.from('company_custom_fields').select('*').eq('table_name', tableName).is('deleted_at', null).order('display_order'),
    ]);

    let order = 0;
    const nativeFields: CustomTableField[] = (cols || [])
      .filter(c => ['data', 'relation'].includes(c.category) && !c.is_hidden && !SYSTEM_TABLE_HIDDEN_COLS.includes(c.column_name))
      .map(c => {
        // The RPC's own relation_table is accurate for every column that
        // actually points at one of the 3 system tables (verified directly
        // against get_schema_metadata's output) -- SYSTEM_TABLE_RELATION_MAP
        // only needs to WIN when both disagree (RecordDashboard.tsx's reason
        // for having it at all), so it's tried first and the RPC is the
        // fallback, not the other way around.
        const relTable = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.table || c.relation_table || undefined;
        const relDisplayCol = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.displayCol || c.relation_display_column || undefined;
        const relationFieldType = relTable ? RELATION_FIELD_TYPE_BY_TABLE[relTable] : undefined;
        const junction = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.junction;
        const isPersonLink = SYSTEM_TABLE_PERSON_LINK_COLS.includes(c.column_name);
        const field_type = relationFieldType || (isPersonLink ? 'text' : deriveNativeFieldType(c.data_type));
        const field: CustomTableField = {
          id: c.column_name,
          table_id: tableName,
          field_key: c.column_name,
          label: c.label || c.column_name.replace(/_/g, ' '),
          field_type,
          select_options: null,
          default_value: null,
          linked_table_id: null,
          linked_system_table: relationFieldType ? relTable! : null,
          linked_display_field: relationFieldType ? relDisplayCol! : null,
          linked_display_field_2: null,
          linked_search_field_keys: null,
          linked_filter_column: null,
          linked_filter_value: null,
          is_required: !c.is_nullable,
          is_unique: false,
          show_in_table: true,
          display_order: order++,
          section_name: null,
          help_text: null,
          formula_type: null,
          formula_field_a_id: null,
          formula_field_b_id: null,
          formula_percent: null,
          formula_relation_field_id: null,
          auto_number_prefix: null,
          allow_multiple: !!junction,
          field_source: 'native',
        };
        return field;
      });

    const cfFields: CustomTableField[] = (customFields || []).map((cf: any) => {
      const field: CustomTableField = {
        id: cf.id,
        table_id: tableName,
        field_key: cf.id,
        label: cf.label,
        field_type: cf.field_type,
        select_options: cf.select_options || null,
        default_value: cf.default_value ?? null,
        linked_table_id: null,
        linked_system_table: cf.linked_table || null,
        linked_display_field: cf.linked_display_column || null,
        linked_display_field_2: null,
        linked_search_field_keys: null,
        linked_filter_column: null,
        linked_filter_value: null,
        is_required: !!cf.is_required,
        is_unique: !!cf.is_unique,
        show_in_table: cf.show_in_table ?? true,
        display_order: order++,
        section_name: cf.section_name || null,
        help_text: cf.help_text || null,
        formula_type: null,
        formula_field_a_id: null,
        formula_field_b_id: null,
        formula_percent: null,
        formula_relation_field_id: null,
        auto_number_prefix: null,
        allow_multiple: false,
        field_source: 'custom',
      };
      return field;
    });

    const fieldList = [...nativeFields, ...cfFields];
    // Bail out to the same array reference when this call (which runs
    // unconditionally on every mount/visit, cache or not) just confirms the
    // cache was already correct -- see useCustomTable.ts's matching comment
    // (this is Projects/Entities/Properties/Tasks' own equivalent of that
    // same hook, hence the same gap: e.g. Projects with a sum_related
    // rollup field visibly "reloading" on every single open).
    setFields(prev => JSON.stringify(prev) === JSON.stringify(fieldList) ? prev : fieldList);
    setLoading(false);
    writeShellCache(systemTableShellKey(tableName, companyId), fieldList);

    const { data: baseRows } = await supabase.from(tableName).select('*').is('deleted_at', null);

    // Junction-backed native relations (e.g. property_id) hold their
    // links outside the row itself -- fetch each one's junction table once
    // for every record, same batching shape as cfValuesByRecord below.
    const multiFields = nativeFields.filter(f => f.allow_multiple);
    const multiValuesByRecord = new Map<string, Record<string, string[]>>();
    if (multiFields.length) {
      await Promise.all(multiFields.map(async f => {
        const junction = SYSTEM_TABLE_RELATION_MAP[f.field_key]?.junction;
        if (!junction) return;
        const { data: links } = await supabase.from(junction.table).select(`${junction.sourceCol}, ${junction.targetCol}`);
        (links || []).forEach((row: any) => {
          const recId = row[junction.sourceCol];
          if (!multiValuesByRecord.has(recId)) multiValuesByRecord.set(recId, {});
          const rec = multiValuesByRecord.get(recId)!;
          (rec[f.field_key] ||= []).push(row[junction.targetCol]);
        });
      }));
    }

    const cfIds = cfFields.map(f => f.id);
    const cfValuesByRecord = new Map<string, Record<string, any>>();
    if (cfIds.length) {
      const { data: cfValues } = await supabase
        .from('company_custom_field_values')
        .select('record_id, field_id, value_text, value_number, value_date, value_boolean')
        .in('field_id', cfIds);
      (cfValues || []).forEach(v => {
        if (!cfValuesByRecord.has(v.record_id)) cfValuesByRecord.set(v.record_id, {});
        cfValuesByRecord.get(v.record_id)![v.field_id] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
      });
    }

    const hydratedRecords: CustomTableRecord[] = (baseRows || []).map((row: any) => {
      const values: Record<string, any> = {};
      for (const f of nativeFields) {
        values[f.field_key] = f.allow_multiple
          ? (multiValuesByRecord.get(row.id)?.[f.field_key] || [])
          : (row[f.field_key] ?? null);
      }
      Object.assign(values, cfValuesByRecord.get(row.id) || {});
      // properties has no created_at column -- fall back so callers that sort/
      // display by it (e.g. useCustomTable's own record ordering convention)
      // never see undefined.
      return { id: row.id, table_id: tableName, created_at: row.created_at || row.updated_at || new Date().toISOString(), values, displayValues: {} };
    });

    await resolveRelationLabels(fieldList, hydratedRecords);
    setRecords(prev => JSON.stringify(prev) === JSON.stringify(hydratedRecords) ? prev : hydratedRecords);
    setRecordsLoading(false);
    if (companyId) writeCache(dashboardSourceRowsKey(tableName, companyId), hydratedRecords);
  }, [tableName, companyId]);

  // Layout effect -- see useCustomTable.ts's matching doc comment (same
  // reuse-across-slug-change reasoning applies here for tableName changes).
  useIsomorphicLayoutEffect(() => {
    if (!tableName || !companyId) { setLoading(false); setRecordsLoading(false); return; }
    const cached = readShellCache<CustomTableField[]>(systemTableShellKey(tableName, companyId));
    if (cached) {
      setFields(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }
    // Reconcile against the row cache too (not just the lazy initializer
    // above, which doesn't apply once this effect re-runs on a later
    // tableName/company change) -- only flip recordsLoading on when
    // there's truly no cache, same reasoning as useCustomTable.ts.
    const cachedRows = readCache<CustomTableRecord[]>(dashboardSourceRowsKey(tableName, companyId));
    if (cachedRows) {
      setRecords(cachedRows);
      setRecordsLoading(false);
    } else {
      setRecords([]);
      setRecordsLoading(true);
    }
    load();
  }, [tableName, companyId, load]);

  const tableDef: CustomTable | null = tableName ? {
    id: tableName,
    name: displayName || tableName.charAt(0).toUpperCase() + tableName.slice(1),
    slug: tableName,
    icon: SYSTEM_TABLE_ICON[tableName],
    color: SYSTEM_TABLE_COLOR[tableName],
    primary_field_key: systemTablePrimaryDisplayColumn(tableName),
    display_order: 0,
    is_ledger: false,
    disable_record_dashboard: false,
    // A system table is the original "always there, can't be removed" case
    // -- is_default true is the closest fit, and it's never privately owned.
    is_default: true,
    effectiveDefault: true,
    owner_user_id: null,
  } : null;

  const addRecordOptimistic = useCallback((id: string, values: Record<string, any>) => {
    setRecords(prev => {
      if (prev.some(r => r.id === id)) return prev;
      const newRecord: CustomTableRecord = {
        id, table_id: tableName || '', created_at: new Date().toISOString(), values, displayValues: {},
      };
      return [newRecord, ...prev];
    });
  }, [tableName]);

  return { tableDef, fields, records, loading, recordsLoading, refetch: load, addRecordOptimistic };
}
