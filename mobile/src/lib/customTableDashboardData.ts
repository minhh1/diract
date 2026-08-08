import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { useResolvedRelationLabels, withDisplayValues } from './dashboardWidgets/relationResolution';
import type { CustomTableField, CustomTableRecord } from './dashboardWidgets/customTableTypes';

const RELATION_FIELD_TYPES = new Set(['entity', 'project', 'property', 'table_relation']);

// Native read path for a genuine custom table (company_tables/
// company_table_fields/company_table_records/company_table_values), as
// opposed to companyDashboards.ts's system-table path (projects/properties/
// entities via lib/records.ts). Lets a dashboard sourced from a custom
// table render its grid/summary_tile/chart widgets natively instead of
// falling back to "open on web" for every custom-table board -- see
// lib/hooks/useCustomTable.ts on the web app for the full version this is
// a read-only subset of.
//
// Known v1 gaps, matching DashboardWidgetRenderer.tsx's own documented
// gaps for the system-table path: no allow_multiple field support
// (company_table_value_links), capped at 200 records like lib/records.ts's
// useRecords rather than porting useCustomTable.ts's full selectAllPages
// pagination. Writing to a custom table (quick_add_form) isn't supported
// yet either -- callers should keep passing tableName: null for a custom
// source so that widget still falls back to "open on web" on its own.
export function useCustomTableData(tableId: string | null) {
  const fieldsQuery = useQuery({
    queryKey: ['custom-table-fields', tableId],
    enabled: !!tableId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CustomTableField[]> => {
      const { data, error } = await supabase
        .from('company_table_fields')
        .select('id, field_key, label, field_type, linked_table_id, linked_system_table, linked_display_field, select_options, formula_type, formula_field_a_id, formula_field_b_id, formula_percent')
        .eq('table_id', tableId)
        .is('deleted_at', null)
        .order('display_order');
      if (error) throw error;
      return (data ?? []).map((f: any) => ({
        id: f.id,
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type,
        relationSystemTable: RELATION_FIELD_TYPES.has(f.field_type) ? f.linked_system_table ?? null : null,
        relationCustomTableId: f.field_type === 'table_relation' ? f.linked_table_id ?? null : null,
        relationDisplayColumn: f.linked_display_field ?? null,
        select_options: f.select_options ?? null,
        formula_type: f.formula_type ?? null,
        formula_field_a_id: f.formula_field_a_id ?? null,
        formula_field_b_id: f.formula_field_b_id ?? null,
        formula_percent: f.formula_percent ?? null,
      }));
    },
  });

  const rawRecordsQuery = useQuery({
    queryKey: ['custom-table-records', tableId],
    enabled: !!tableId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_table_records')
        .select('id, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)')
        .eq('table_id', tableId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const fields = fieldsQuery.data ?? [];
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields]);

  // Hydration (field_id -> field_key keyed values) happens here rather than
  // inside the records queryFn so it re-derives whenever either query's
  // cached data changes, without the two queries needing to await each
  // other over the network first.
  const hydratedRecords: CustomTableRecord[] = useMemo(() => {
    return (rawRecordsQuery.data ?? []).map((rec: any) => {
      const values: Record<string, unknown> = {};
      (rec.values ?? []).forEach((v: any) => {
        const field = fieldById.get(v.field_id);
        if (!field) return;
        values[field.field_key] = v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
      });
      return { id: rec.id, values };
    });
  }, [rawRecordsQuery.data, fieldById]);

  const labelsByField = useResolvedRelationLabels(fields, hydratedRecords);
  const records = useMemo(() => withDisplayValues(hydratedRecords, labelsByField), [hydratedRecords, labelsByField]);

  return {
    isLoading: fieldsQuery.isLoading || rawRecordsQuery.isLoading,
    fields,
    fieldById,
    records,
  };
}
