import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { useRecordFields, useRecords, type SystemTableName } from './records';
import type { DashboardWidget } from './dashboardWidgets/types';
import type { CustomTableField, CustomTableRecord } from './dashboardWidgets/customTableTypes';

// A "board" (company_dashboards) can be sourced from a custom table or one
// of a fixed set of system tables -- see lib/hooks/useSystemTableAsCustomTable.ts's
// SYSTEM_TABLE_NAMES on the web app, which notably does NOT include 'tasks'
// (the web builder's own table picker never offers it as a board source).
// v1 here only renders boards sourced from these 3, reusing
// src/lib/records.ts's existing field/record fetching untouched -- anything
// else (a custom table, or 'none') falls back to an "open on web" card
// rather than attempting the full custom-table schema resolution
// (lib/hooks/useCustomTable.ts) this doesn't yet have a mobile port of.
const SUPPORTED_SOURCE_TABLES: SystemTableName[] = ['projects', 'properties', 'entities'];

export type DashboardSummary = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  sourceTableType: string;
};

// Mirrors lib/hooks/useCustomDashboards.ts's query and shared-or-mine
// filter exactly. Unlike that hook, a team-restricted dashboard
// (restricted_to_team_id set) is dropped entirely here rather than resolved
// against team-leader membership -- an admin can still see/manage it on
// web; this just isn't wired up to reproduce that one narrow gate yet.
export function useCompanyDashboardsList(userId: string | null, companyId: string | null) {
  return useQuery({
    queryKey: ['company-dashboards', companyId, userId],
    enabled: !!companyId,
    queryFn: async (): Promise<DashboardSummary[]> => {
      let query = supabase
        .from('company_dashboards')
        .select('id, name, slug, icon, color, source_table_type, display_order, owner_user_id, restricted_to_team_id')
        .is('deleted_at', null);
      query = userId ? query.or(`owner_user_id.is.null,owner_user_id.eq.${userId}`) : query.is('owner_user_id', null);
      const { data, error } = await query.order('display_order');
      if (error) {
        console.error('[useCompanyDashboardsList]', error.message);
        return [];
      }
      return (data ?? [])
        .filter((d) => !d.restricted_to_team_id)
        .map((d) => ({ id: d.id, name: d.name, slug: d.slug, icon: d.icon, color: d.color, sourceTableType: d.source_table_type }));
    },
  });
}

type DashboardRow = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  source_table_type: string;
  widgets: DashboardWidget[] | null;
};

function isSupportedSourceTable(value: string | undefined): value is SystemTableName {
  return !!value && (SUPPORTED_SOURCE_TABLES as string[]).includes(value);
}

export function useCompanyDashboard(slug: string, companyId: string | null) {
  const dashboardQuery = useQuery({
    queryKey: ['company-dashboard', companyId, slug],
    enabled: !!companyId,
    queryFn: async (): Promise<DashboardRow | null> => {
      const { data, error } = await supabase
        .from('company_dashboards')
        .select('id, name, slug, icon, color, source_table_type, widgets')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle();
      if (error) {
        console.error('[useCompanyDashboard]', error.message);
        return null;
      }
      return data;
    },
  });

  const sourceTableType = dashboardQuery.data?.source_table_type;
  const supported = isSupportedSourceTable(sourceTableType);
  // useRecordFields/useRecords need a concrete SystemTableName even when
  // unused -- 'projects' is a harmless placeholder here since `enabled`
  // (gated on companyId below) keeps the query from ever actually running
  // when the source table isn't one of the 3 this screen supports.
  const tableName = supported ? sourceTableType : 'projects';
  const effectiveCompanyId = supported ? companyId : null;
  const fieldsQuery = useRecordFields(tableName, effectiveCompanyId);
  const recordsQuery = useRecords(tableName, effectiveCompanyId);

  const fields: CustomTableField[] = (fieldsQuery.data ?? []).map((f) => ({ id: f.key, field_key: f.key, label: f.label, field_type: f.fieldType }));
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const records: CustomTableRecord[] = (recordsQuery.data ?? []).map((r) => ({ id: r.id, values: r.values }));

  return {
    dashboard: dashboardQuery.data,
    isLoading: dashboardQuery.isLoading || (supported && (fieldsQuery.isLoading || recordsQuery.isLoading)),
    sourceSupported: supported,
    // The raw RecordField[] (native/custom source tag intact) alongside the
    // derived CustomTableField[] above -- quick_add_form needs the former
    // (src/lib/recordsWrite.ts's createRecord splits on field.source),
    // compute.ts's aggregate math needs the latter. Same underlying fields,
    // two shapes for two different consumers.
    rawFields: fieldsQuery.data ?? [],
    tableName: supported ? tableName : null,
    companyId: effectiveCompanyId,
    fields,
    fieldById,
    records,
  };
}
