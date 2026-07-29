"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { useCompany } from "@/components/CompanyContext";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useCustomTable } from "./useCustomTable";
import type { CustomTable } from "./useCustomTables";
import { useSystemTableAsCustomTable, SYSTEM_TABLE_NAMES, type SystemTableName } from "./useSystemTableAsCustomTable";
import { ensureDashboardWidgetsMigrated } from "@/lib/dashboardWidgets/ensureMigrated";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";
import { toRelativeDateToken, relativeDateFromToken, matchesRelativeDate } from "@/lib/dashboardWidgets/relativeDates";

// 'none' is a dashboard with no source table at all -- only ever meaningful
// for table-independent widgets like public_task_page/public_document_page
// (see components/dashboard/DashboardBuilderPage.tsx's "No table" option
// and AddWidgetMenu's filtering for it). fields/records for it are always
// empty, same shape as any other source kind whose table lookup found
// nothing.
export type DashboardSourceKind = 'custom' | SystemTableName | 'none';

export interface SummaryTileConfig {
  label: string;
  fieldId: string | null;
  aggregate: 'sum' | 'count';
  filterFieldId?: string | null;
  filterValue?: any;
}

export interface ChartConfig {
  dateFieldId: string;
  valueFieldId: string | null;
  aggregate: 'sum' | 'count';
}

export interface CompanyDashboard {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  source_table_id: string | null;
  source_table_type: DashboardSourceKind;
  quick_add_field_ids: string[];
  grid_field_ids: string[];
  filter_field_ids: string[];
  summary_tiles: SummaryTileConfig[];
  chart_config: ChartConfig | null;
  widgets: DashboardWidget[];
  code_source: string | null;
  builder_mode: 'canvas' | 'code';
  // Non-null = only company_admin + this team's leader can view (see
  // app/dashboard/boards/[slug]/page.tsx's gate and
  // lib/hooks/useCustomDashboards.ts's matching sidebar-list filter). Null
  // (the default) means every company member can see it, same as before
  // this column existed.
  restricted_to_team_id: string | null;
}

interface CachedDashboardShell {
  dashboard: CompanyDashboard;
  sourceTableDef: CustomTable | null;
}
// Scoped by companyId -- see lib/hooks/prefetchShells.ts's tableShellKey
// doc comment for why (a bare slug-only key served a previous company's
// stale shell after switching active company).
const dashboardShellKey = (companyId: string, slug: string) => `dashboard:${companyId}:${slug}`;

// Loads a dashboard's config, resolves its source custom table via
// useCustomTable, and computes filtered records + summary tile values +
// daily chart series client-side over that table's full (unpaginated)
// record set -- same scale assumption useCustomTable already makes
// elsewhere in the app.
export function useDashboardData(dashboardSlug: string) {
  const { companyId } = useCompany();
  const [dashboard, setDashboard] = useState<CompanyDashboard | null>(null);
  // Full row, not just the slug -- fetched once source_table_id is known,
  // handed straight to useCustomTable below as its preloadedTable so that
  // hook can skip its own redundant table-by-slug fetch (see
  // useCustomTable.ts's doc comment on that param). sourceTableSlug is
  // derived from this, not a second piece of state.
  const [sourceTableDef, setSourceTableDef] = useState<CustomTable | null>(null);
  const sourceTableSlug = sourceTableDef?.slug ?? null;
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, any>>({});
  // A field_key -> value map waiting to be picked up by this dashboard's
  // OWN quick_add_form widget -- the one channel a my_tasks_button widget
  // (or anything else that wants to hand off a draft record) has to reach
  // a DIFFERENT widget instance on the same page. Set once by whichever
  // widget produced it, cleared by DashboardQuickAddForm itself the moment
  // it applies the values (see its onPrefillApplied callback) so it never
  // re-applies on a later unrelated re-render. Null (not just absent) is
  // the "nothing pending" state, matching filters' own convention of a
  // real value in the map meaning "active".
  const [quickAddPrefill, setQuickAddPrefill] = useState<Record<string, any> | null>(null);

  // Layout effect -- see useCustomTable.ts's matching doc comment. Clicking
  // between two dashboards reuses this same hook instance (dashboardSlug is
  // just a changed argument, not a remount), so the cache correction below
  // has to land before the browser paints the new slug's first frame, or
  // it briefly paints the OLD dashboard's widgets against data resolved for
  // the NEW one.
  useIsomorphicLayoutEffect(() => {
    let active = true;
    const cached = companyId ? readShellCache<CachedDashboardShell>(dashboardShellKey(companyId, dashboardSlug)) : null;
    if (cached) {
      setDashboard(cached.dashboard);
      setSourceTableDef(cached.sourceTableDef);
      setDashboardLoading(false);
    } else {
      setDashboardLoading(true);
    }
    (async () => {
      // .eq('company_id', ...) -- company_dashboards.slug has no unique
      // constraint (two companies can each legitimately have a dashboard
      // slugged the same way), so a slug-only lookup relied entirely on
      // RLS to avoid resolving the wrong tenant's row. Skips the fetch
      // outright rather than querying with an undefined company_id while
      // CompanyContext is still resolving -- the effect already re-runs
      // once companyId is set (see the dependency array below).
      if (!companyId) { setDashboardLoading(false); return; }
      const { data: dash } = await supabase
        .from('company_dashboards').select('*').eq('slug', dashboardSlug).eq('company_id', companyId).is('deleted_at', null).maybeSingle();
      if (!active) return;
      if (dash && !dash.widgets_migrated_at) {
        dash.widgets = await ensureDashboardWidgetsMigrated(dash);
      }
      if (!active) return;
      setDashboard(dash);
      let tbl: CustomTable | null = null;
      if (dash?.source_table_type === 'custom' && dash?.source_table_id) {
        const { data } = await supabase.from('company_tables').select('*').eq('id', dash.source_table_id).maybeSingle();
        tbl = data ?? null;
        if (active) setSourceTableDef(tbl);
      } else if (active) {
        setSourceTableDef(null);
      }
      setDashboardLoading(false);
      if (dash && companyId) writeShellCache(dashboardShellKey(companyId, dashboardSlug), { dashboard: dash, sourceTableDef: tbl });
    })();
    return () => { active = false; };
  }, [dashboardSlug, companyId]);

  const sourceKind: DashboardSourceKind = dashboard?.source_table_type ?? 'custom';
  const systemTableName = (sourceKind !== 'custom' && sourceKind !== 'none') ? sourceKind : null;

  // Both hooks are always called (Rules of Hooks) -- each tolerates a null
  // table identifier by no-op'ing, and only the one matching this
  // dashboard's actual source_table_type ever has real data in it.
  const customTableResult = useCustomTable(sourceKind === 'custom' ? sourceTableSlug : null, sourceTableDef);
  const systemTableResult = useSystemTableAsCustomTable(systemTableName, dashboard?.company_id ?? null);
  const { tableDef, fields, records, loading: tableLoading, recordsLoading, refetch: refetchTable, addRecordOptimistic } =
    sourceKind === 'custom' ? customTableResult : systemTableResult;

  const fieldById = useMemo(() => new Map(fields.map(f => [f.id, f])), [fields]);

  const setFilter = useCallback((fieldId: string, value: any) => {
    setFilters(prev => ({ ...prev, [fieldId]: value }));
  }, []);

  // Any date-type field in the filter bar defaults to today the first time
  // the dashboard's config + fields are both available -- e.g. a Time Entry
  // dashboard should open already scoped to today's entries (grid, summary
  // tiles) rather than showing everything. Seeded as the "$today" relative
  // token (see relativeDates.ts), not a literal ISO date -- it's the exact
  // same value the filter bar's own "Today" preset produces, so "today"
  // stays fresh if the tab is left open across midnight instead of being
  // frozen at whatever date the page happened to load on. Seeded once
  // (defaultsSeededRef), not on every fields/dashboard change, so it never
  // overwrites a filter the user has since cleared or changed.
  const defaultsSeededRef = useRef(false);
  useEffect(() => {
    if (defaultsSeededRef.current || !dashboard || fields.length === 0) return;
    defaultsSeededRef.current = true;
    const filterBarWidget = dashboard.widgets.find(w => w.type === 'filter_bar');
    if (!filterBarWidget || filterBarWidget.type !== 'filter_bar') return;
    const todayToken = toRelativeDateToken('today');
    const dateFieldIds = filterBarWidget.config.fieldIds.filter(id => fields.find(f => f.id === id)?.field_type === 'date');
    if (dateFieldIds.length) {
      setFilters(prev => {
        const next = { ...prev };
        for (const id of dateFieldIds) if (next[id] === undefined) next[id] = todayToken;
        return next;
      });
    }
  }, [dashboard, fields]);

  // Persists a single widget's config change (column reorder/resize from
  // DashboardGrid today) back into company_dashboards.widgets. Updates
  // local state optimistically -- the drag interaction that triggers this
  // already gives its own instant visual feedback (DashboardGrid's
  // liveWidths), so this just needs to not visibly "snap back" once the
  // network round-trip lands -- then persists and logs it through the same
  // schema-history mechanism the builder page's own saves use, so this is
  // revertible like any other dashboard edit.
  const updateWidget = useCallback(async (updated: DashboardWidget) => {
    if (!dashboard) return;
    const before = dashboard;
    const nextWidgets = dashboard.widgets.map(w => w.id === updated.id ? updated : w);
    setDashboard({ ...dashboard, widgets: nextWidgets });

    const { data: { user } } = await supabase.auth.getUser();
    const { data: after } = await supabase
      .from('company_dashboards').update({ widgets: nextWidgets }).eq('id', dashboard.id).select().single();
    if (after) {
      logSchemaChange({
        companyId: dashboard.company_id, actorId: user?.id ?? null, entityType: 'company_dashboard',
        entityId: dashboard.id, entityLabel: dashboard.name, action: 'update', before, after,
      });
    }
  }, [dashboard]);

  const activeFilters = useMemo(
    () => Object.entries(filters).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    [filters]
  );

  // A date field's filter value can be a literal 'YYYY-MM-DD' (exact-match,
  // the original behavior) OR a relative-range token like "$this_week" (see
  // relativeDates.ts) -- matched by range instead of equality. Shared by
  // filteredRecords and chartRecords' nonDateFilters loop below.
  const matchesFilterValue = (fieldType: string, rawValue: any, filterValue: any): boolean => {
    const range = fieldType === 'date' ? relativeDateFromToken(filterValue) : null;
    if (range) return matchesRelativeDate(rawValue, range);
    return String(rawValue ?? '') === String(filterValue);
  };

  const filteredRecords = useMemo(() => {
    if (activeFilters.length === 0) return records;
    return records.filter(r => activeFilters.every(([fieldId, val]) => {
      const field = fieldById.get(fieldId);
      if (!field) return true;
      return matchesFilterValue(field.field_type, r.values[field.field_key], val);
    }));
  }, [records, activeFilters, fieldById]);

  // A chart plotting activity over time is meaningless once narrowed to the
  // filter bar's date (its default is TODAY -- see the defaults-seeding
  // effect below -- so an unfiltered-by-date chart would otherwise render
  // one lone bar every day instead of the trend it's for). Every OTHER
  // active filter (e.g. Staff) still narrows it, same as the grid/tiles.
  const chartRecords = useMemo(() => {
    const nonDateFilters = activeFilters.filter(([fieldId]) => fieldById.get(fieldId)?.field_type !== 'date');
    if (nonDateFilters.length === 0) return records;
    return records.filter(r => nonDateFilters.every(([fieldId, val]) => {
      const field = fieldById.get(fieldId);
      if (!field) return true;
      return matchesFilterValue(field.field_type, r.values[field.field_key], val);
    }));
  }, [records, activeFilters, fieldById]);

  const summaryTiles = useMemo(() => {
    return (dashboard?.summary_tiles || []).map(tile => {
      const field = tile.fieldId ? fieldById.get(tile.fieldId) : undefined;
      let rows = filteredRecords;
      if (tile.filterFieldId) {
        const filterField = fieldById.get(tile.filterFieldId);
        if (filterField) {
          rows = rows.filter(r => String(r.values[filterField.field_key] ?? '') === String(tile.filterValue));
        }
      }
      const value = tile.aggregate === 'count'
        ? rows.length
        : rows.reduce((sum, r) => sum + (field ? Number(r.values[field.field_key]) || 0 : 0), 0);
      return { label: tile.label, value, fieldType: field?.field_type || 'number' };
    });
  }, [dashboard, filteredRecords, fieldById]);

  const chartData = useMemo(() => {
    const config = dashboard?.chart_config;
    const dateField = config ? fieldById.get(config.dateFieldId) : undefined;
    if (!config || !dateField) return [];
    const valueField = config.valueFieldId ? fieldById.get(config.valueFieldId) : undefined;

    const byDay = new Map<string, number>();
    for (const r of filteredRecords) {
      const dateVal = r.values[dateField.field_key];
      if (!dateVal) continue;
      const day = String(dateVal).slice(0, 10);
      const amount = config.aggregate === 'count' ? 1 : (valueField ? Number(r.values[valueField.field_key]) || 0 : 0);
      byDay.set(day, (byDay.get(day) || 0) + amount);
    }
    return Array.from(byDay.entries())
      .map(([date, value]) => ({ date, value }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [dashboard, filteredRecords, fieldById]);

  return {
    dashboard,
    sourceKind,
    tableDef,
    fields,
    fieldById,
    records: filteredRecords,
    chartRecords,
    allRecords: records,
    loading: dashboardLoading || tableLoading,
    // Separate from `loading` -- see useCustomTable.ts's own doc comment.
    // dashboardLoading is folded in here too: the dashboard's own config
    // row (which widgets exist, in what order) has to be known before
    // "are there records yet" is a meaningful question for anything that
    // reads this.
    recordsLoading: dashboardLoading || recordsLoading,
    filters,
    setFilter,
    quickAddPrefill,
    setQuickAddPrefill,
    summaryTiles,
    chartData,
    // Record-level mutations (add/edit/delete) only ever need the source
    // table's data reloaded, not the dashboard's own config row -- refetchTable
    // swaps records in without flipping a loading flag, so the page never
    // unmounts into a spinner just because one entry was added.
    refetch: refetchTable,
    addRecordOptimistic,
    updateWidget,
  };
}
