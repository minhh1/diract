import { useQuery } from '@tanstack/react-query';

import { getSchemaMetadata } from './schemaMetadata';
import { supabase } from './supabase';
import {
  SYSTEM_TABLE_HIDDEN_COLS,
  SYSTEM_TABLE_PERSON_LINK_COLS,
  SYSTEM_TABLE_RELATION_MAP,
  systemTablePrimaryDisplayColumn,
} from './systemTableRelations';

// Reads the same 4 system tables (projects/properties/entities/tasks) the
// web app's schema-builder covers, via the same get_schema_metadata RPC +
// company_custom_fields/company_custom_field_values layer as
// lib/hooks/useSystemTableAsCustomTable.ts on the web app -- kept
// intentionally simpler here (no relation-label resolution, no shell cache;
// React Query's cache covers that role) since this only needs to drive a
// list + detail view, not the full dashboard-widget engine.

export type SystemTableName = 'projects' | 'properties' | 'entities' | 'tasks';

export const SYSTEM_TABLES: SystemTableName[] = ['projects', 'properties', 'entities', 'tasks'];

export const SYSTEM_TABLE_LABELS: Record<SystemTableName, string> = {
  projects: 'Matters',
  properties: 'Properties',
  entities: 'Leads & Contacts',
  tasks: 'Tasks',
};

const RELATION_FIELD_TYPE_BY_TABLE: Record<string, string> = {
  projects: 'project',
  properties: 'property',
  entities: 'entity',
};

function deriveNativeFieldType(dataType: string): string {
  if (dataType === 'boolean') return 'boolean';
  if (dataType === 'date' || dataType?.includes('timestamp')) return 'date';
  if (['numeric', 'integer', 'bigint', 'smallint', 'real', 'double precision'].includes(dataType)) return 'number';
  return 'text';
}

export type RecordField = {
  key: string; // native column name, or a company_custom_fields uuid
  label: string;
  fieldType: string;
  source: 'native' | 'custom';
  selectOptions: string[] | null;
  relationTable: string | null;
  relationDisplayColumn: string | null;
};

export function useRecordFields(tableName: SystemTableName, companyId: string | null) {
  return useQuery({
    queryKey: ['record-fields', tableName, companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<RecordField[]> => {
      const [cols, customFieldsRes] = await Promise.all([
        getSchemaMetadata(tableName, companyId),
        supabase.from('company_custom_fields').select('*').eq('table_name', tableName).is('deleted_at', null).order('display_order'),
      ]);

      const nativeFields: RecordField[] = cols
        .filter((c) => ['data', 'relation'].includes(c.category) && !c.is_hidden && !SYSTEM_TABLE_HIDDEN_COLS.includes(c.column_name))
        .map((c) => {
          const relTable = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.table ?? c.relation_table ?? null;
          const relDisplayCol = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.displayCol ?? c.relation_display_column ?? null;
          const isPersonLink = SYSTEM_TABLE_PERSON_LINK_COLS.includes(c.column_name);
          const fieldType = relTable
            ? RELATION_FIELD_TYPE_BY_TABLE[relTable] ?? 'text'
            : isPersonLink
            ? 'text'
            : deriveNativeFieldType(c.data_type);
          return {
            key: c.column_name,
            label: c.label || c.column_name.replace(/_/g, ' '),
            fieldType,
            source: 'native' as const,
            selectOptions: null,
            relationTable: relTable,
            relationDisplayColumn: relDisplayCol,
          };
        });

      const customFields: RecordField[] = (customFieldsRes.data ?? []).map((cf: Record<string, unknown>) => ({
        key: cf.id as string,
        label: cf.label as string,
        fieldType: cf.field_type as string,
        source: 'custom' as const,
        selectOptions: (cf.select_options as string[] | null) ?? null,
        relationTable: (cf.linked_table as string | null) ?? null,
        relationDisplayColumn: (cf.linked_display_column as string | null) ?? null,
      }));

      return [...nativeFields, ...customFields];
    },
  });
}

export type RecordRow = {
  id: string;
  createdAt: string | null;
  title: string;
  values: Record<string, unknown>;
};

export function useRecords(tableName: SystemTableName, companyId: string | null) {
  const fieldsQuery = useRecordFields(tableName, companyId);
  const fields = fieldsQuery.data ?? [];
  const titleColumn = systemTablePrimaryDisplayColumn(tableName);

  return useQuery({
    queryKey: ['records', tableName, companyId, fieldsQuery.isSuccess],
    enabled: !!companyId && fieldsQuery.isSuccess,
    queryFn: async (): Promise<RecordRow[]> => {
      const { data: baseRows, error } = await supabase
        .from(tableName)
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;

      const customFields = fields.filter((f) => f.source === 'custom');
      const valuesByRecord = new Map<string, Record<string, unknown>>();
      if (customFields.length) {
        const { data: cfValues } = await supabase
          .from('company_custom_field_values')
          .select('record_id, field_id, value_text, value_number, value_date, value_boolean')
          .in(
            'field_id',
            customFields.map((f) => f.key),
          );
        (cfValues ?? []).forEach((v) => {
          if (!valuesByRecord.has(v.record_id)) valuesByRecord.set(v.record_id, {});
          valuesByRecord.get(v.record_id)![v.field_id] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
        });
      }

      const nativeFields = fields.filter((f) => f.source === 'native');
      return (baseRows ?? []).map((row: Record<string, unknown>) => {
        const values: Record<string, unknown> = {};
        for (const f of nativeFields) values[f.key] = row[f.key] ?? null;
        Object.assign(values, valuesByRecord.get(row.id as string) ?? {});
        return {
          id: row.id as string,
          createdAt: (row.created_at as string) ?? null,
          title: (row[titleColumn] as string) || '(untitled)',
          values,
        };
      });
    },
  });
}

export function useRecord(tableName: SystemTableName, companyId: string | null, recordId: string | undefined) {
  const recordsQuery = useRecords(tableName, companyId);
  const record = recordsQuery.data?.find((r) => r.id === recordId);
  return { ...recordsQuery, data: record };
}
