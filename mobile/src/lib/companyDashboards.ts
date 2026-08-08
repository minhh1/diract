import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';
import { useRecordFields, useRecords, type SystemTableName } from './records';
import { useCustomTableData } from './customTableDashboardData';
import { useResolvedRelationLabels, withDisplayValues } from './dashboardWidgets/relationResolution';
import type { DashboardWidget } from './dashboardWidgets/types';
import type { CustomTableField, CustomTableRecord } from './dashboardWidgets/customTableTypes';

// A "board" (company_dashboards) can be sourced from a custom table, one of
// a fixed set of system tables, or nothing at all -- see
// lib/hooks/useSystemTableAsCustomTable.ts's SYSTEM_TABLE_NAMES on the web
// app, which notably does NOT include 'tasks' (the web builder's own table
// picker never offers it as a board source). System-table boards reuse
// src/lib/records.ts's existing field/record fetching untouched;
// custom-table boards use customTableDashboardData.ts's read-only port of
// lib/hooks/useCustomTable.ts. A 'none'-sourced board (no records to read
// at all) still falls back to an "open on web" card.
const SUPPORTED_SOURCE_TABLES: SystemTableName[] = ['projects', 'properties', 'entities'];

export type DashboardSummary = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  sourceTableType: string;
};

// A dashboard with restricted_to_team_id set (the "Irregularities"-style
// admin-team dashboard, see AdminTeamsTab.tsx on web) only belongs in the
// list for company_admin or that team's leader -- mirrors
// lib/hooks/useCustomDashboards.ts's isVisibleRestrictedDashboard exactly.
async function isVisibleRestrictedDashboard(userId: string | null, companyId: string, teamId: string): Promise<boolean> {
  if (!userId) return false;
  const { data: membership } = await supabase
    .from('company_memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (membership?.role === 'company_admin') return true;
  const { data: team } = await supabase.from('teams').select('leader_id').eq('id', teamId).maybeSingle();
  return team?.leader_id === userId;
}

// Mirrors lib/hooks/useCustomDashboards.ts's query and shared-or-mine
// filter exactly, including team-restricted dashboard visibility.
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
      const rows = data ?? [];
      const visibility = await Promise.all(
        rows.map((d) => (d.restricted_to_team_id && companyId ? isVisibleRestrictedDashboard(userId, companyId, d.restricted_to_team_id) : Promise.resolve(true))),
      );
      return rows
        .filter((_, i) => visibility[i])
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
  source_table_id: string | null;
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
        .select('id, name, slug, icon, color, source_table_type, source_table_id, widgets')
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
  const isSystemSourced = isSupportedSourceTable(sourceTableType);
  // A dashboard whose source_table_type is 'custom' reads real data too
  // (see customTableDashboardData.ts) and, since customTableWrite.ts, can
  // also write to it (quick_add_form, my_tasks_button) -- gated per-table by
  // isSupportedForWrite (ledger tables, sum_related/max_related rollups
  // still fall back to "open on web"). grid/summary_tile/chart/heading/text
  // render natively regardless, since those widgets only ever touch
  // `fields`/`records`, never `tableName`/`customTableId`.
  const isCustomSourced = sourceTableType === 'custom' && !!dashboardQuery.data?.source_table_id;
  // A dashboard can also have no table at all ('none') -- e.g. one whose
  // only widget is public_client_update_page, which just embeds a Client
  // Update board by slug and never touches fields/records. Blocking the
  // whole screen behind "no table backing it" was wrong for these: no
  // widget on such a dashboard needs table data, so there's nothing to be
  // unsupported. Individual widgets that DO need data but land on a
  // 'none'-sourced dashboard anyway (shouldn't normally happen) still fall
  // back to DashboardWidgetRenderer's own per-widget OpenOnWebFallback.
  const isNoneSourced = sourceTableType === 'none';
  // useRecordFields/useRecords need a concrete SystemTableName even when
  // unused -- 'projects' is a harmless placeholder here since `enabled`
  // (gated on companyId below) keeps the query from ever actually running
  // when the source table isn't one of the 3 this screen supports.
  const tableName = isSystemSourced ? sourceTableType : 'projects';
  const effectiveCompanyId = isSystemSourced ? companyId : null;
  const fieldsQuery = useRecordFields(tableName, effectiveCompanyId);
  const recordsQuery = useRecords(tableName, effectiveCompanyId);

  const customTableData = useCustomTableData(isCustomSourced ? dashboardQuery.data!.source_table_id : null);

  // RecordField.relationTable is always a literal system-table name here
  // (never a custom table id) -- records.ts's useRecordFields only ever
  // populates it from SYSTEM_TABLE_RELATION_MAP or company_custom_fields.
  // linked_table, and neither has ever stored anything else. So a
  // system-table field's relation always resolves via relationSystemTable,
  // same code path relationResolution.ts already has for a custom-table
  // field pointing at a system table.
  const systemFields: CustomTableField[] = (fieldsQuery.data ?? []).map((f) => ({
    id: f.key,
    field_key: f.key,
    label: f.label,
    field_type: f.fieldType,
    relationSystemTable: f.relationTable,
    relationDisplayColumn: f.relationDisplayColumn,
  }));
  const systemFieldById = new Map(systemFields.map((f) => [f.id, f]));
  const systemHydratedRecords: CustomTableRecord[] = (recordsQuery.data ?? []).map((r) => ({ id: r.id, values: r.values }));
  const systemLabelsByField = useResolvedRelationLabels(systemFields, systemHydratedRecords);
  const systemRecords = withDisplayValues(systemHydratedRecords, systemLabelsByField);

  const fields = isCustomSourced ? customTableData.fields : systemFields;
  const fieldById = isCustomSourced ? customTableData.fieldById : systemFieldById;
  const records = isCustomSourced ? customTableData.records : systemRecords;
  const sourceSupported = isSystemSourced || isCustomSourced || isNoneSourced;

  return {
    dashboard: dashboardQuery.data,
    isLoading:
      dashboardQuery.isLoading ||
      (isSystemSourced && (fieldsQuery.isLoading || recordsQuery.isLoading)) ||
      (isCustomSourced && customTableData.isLoading),
    sourceSupported,
    // The raw RecordField[] (native/custom source tag intact) alongside the
    // derived CustomTableField[] above -- quick_add_form needs the former
    // (src/lib/recordsWrite.ts's createRecord splits on field.source),
    // compute.ts's aggregate math needs the latter. Same underlying fields,
    // two shapes for two different consumers. Always empty for a
    // custom-sourced dashboard, which writes through customTableId/
    // customTableWrite.ts instead.
    rawFields: isSystemSourced ? fieldsQuery.data ?? [] : [],
    tableName: isSystemSourced ? tableName : null,
    // Set only for a custom-sourced dashboard -- the company_tables id
    // customTableWrite.ts needs to create a record on. Every write-capable
    // widget still has to check isSupportedForWrite(customTableId, fields)
    // itself before offering to create anything (a ledger table, or one
    // with a sum_related/max_related field, isn't handled by this write
    // path -- see customTableWrite.ts's header comment).
    customTableId: isCustomSourced ? dashboardQuery.data!.source_table_id : null,
    companyId: isSystemSourced ? effectiveCompanyId : isCustomSourced ? companyId : null,
    fields,
    fieldById,
    records,
  };
}
