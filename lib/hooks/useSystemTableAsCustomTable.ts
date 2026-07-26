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
import { getSchemaMetadata } from "@/lib/services/schemaService";
import { resolveRelationLabels, type CustomTableField, type CustomTableRecord } from "./useCustomTable";
import type { CustomTable } from "./useCustomTables";
import {
  SYSTEM_TABLE_HIDDEN_COLS, SYSTEM_TABLE_RELATION_MAP, SYSTEM_TABLE_PERSON_LINK_COLS,
  systemTablePrimaryDisplayColumn,
} from "@/lib/schema/systemTableRelations";

export type SystemTableName = 'projects' | 'properties' | 'entities';
export const SYSTEM_TABLE_NAMES: SystemTableName[] = ['projects', 'properties', 'entities'];

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
  // Always mirrors `loading` -- unlike useCustomTable.ts's own fields/
  // records split, this hook's schema-metadata fetch and its record fetch
  // aren't decoupled, so there's no separate "fields are ready, records
  // aren't yet" moment here to report. Exists so useDashboardData.ts can
  // read the same field name regardless of which of these two hooks is
  // actually backing a given dashboard's source table.
  recordsLoading: boolean;
  refetch: () => void;
} {
  const [fields, setFields] = useState<CustomTableField[]>([]);
  const [records, setRecords] = useState<CustomTableRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
          allow_multiple: false,
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
    setFields(fieldList);

    const { data: baseRows } = await supabase.from(tableName).select('*').is('deleted_at', null);

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
      for (const f of nativeFields) values[f.field_key] = row[f.field_key] ?? null;
      Object.assign(values, cfValuesByRecord.get(row.id) || {});
      // properties has no created_at column -- fall back so callers that sort/
      // display by it (e.g. useCustomTable's own record ordering convention)
      // never see undefined.
      return { id: row.id, table_id: tableName, created_at: row.created_at || row.updated_at || new Date().toISOString(), values, displayValues: {} };
    });

    await resolveRelationLabels(fieldList, hydratedRecords);
    setRecords(hydratedRecords);
  }, [tableName, companyId]);

  useEffect(() => {
    if (!tableName || !companyId) { setLoading(false); return; }
    let active = true;
    setLoading(true);
    load().finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
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
  } : null;

  return { tableDef, fields, records, loading, recordsLoading: loading, refetch: load };
}
