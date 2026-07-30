"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { readCache, writeCache } from "@/lib/queryCache";
import { useCompany } from "@/components/CompanyContext";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useCustomTable } from "./useCustomTable";
import type { CustomTable } from "./useCustomTables";
import { useSystemTableAsCustomTable, SYSTEM_TABLE_NAMES, type SystemTableName } from "./useSystemTableAsCustomTable";
import { ensureDashboardWidgetsMigrated } from "@/lib/dashboardWidgets/ensureMigrated";
import { logSchemaChange } from "@/lib/services/schemaChangeLog";
import type { DashboardWidget } from "@/lib/dashboardWidgets/types";
import { toRelativeDateToken, relativeDateFromToken, matchesRelativeDate } from "@/lib/dashboardWidgets/relativeDates";
import { CURRENT_USER_SENTINEL, TEAM_SCOPE_SENTINEL } from "@/components/dashboard/RelationPicker";
import { canViewMultipleTimeEntries } from "@/lib/teamScope";
import { getFilterDefaults, setFilterDefault, clearFilterDefault } from "@/lib/services/dashboardFilterDefaults";

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
  // ms epoch this was written -- see DASHBOARD_CONFIG_TTL_MS below.
  cachedAt: number;
}
// Scoped by companyId -- see lib/hooks/prefetchShells.ts's tableShellKey
// doc comment for why (a bare slug-only key served a previous company's
// stale shell after switching active company).
// Exported so DashboardBuilderPage.tsx can clear this exact slot on save --
// see DASHBOARD_CONFIG_TTL_MS below for why that's now necessary (a cache
// hit can be up to 5 minutes stale otherwise, where before this hook always
// re-fetched live on every mount regardless of cache state).
export const dashboardShellKey = (companyId: string, slug: string) => `dashboard:${companyId}:${slug}`;

// A dashboard's own config (name/widgets/filters/source table) only ever
// changes when someone explicitly edits and saves it in the builder --
// nowhere near often enough to justify a live round trip on every single
// click between dashboards the way records genuinely do. A cache hit
// younger than this is trusted outright and skips the network fetch below
// entirely, same TTL convention as useCustomDashboards.ts's sidebar list.
// Longer than that one (60s) since a dashboard's own config changes even
// less often than which dashboards exist at all.
const DASHBOARD_CONFIG_TTL_MS = 5 * 60_000;

// Module-level in-flight dedup, keyed by companyId:slug -- React Strict
// Mode double-invokes every effect once in development (mount, cleanup,
// mount again), which without this fired the exact same company_dashboards
// (and, if source_table_type is 'custom', company_tables) query twice on a
// single real page load -- confirmed live: two identical requests back to
// back, and since each independently called setDashboard/setSourceTableDef,
// the second response landing (however marginally later) could visibly
// flip summary-tile numbers a moment after the first ones already painted.
// Same reasoning as useCustomTables.ts's own inFlight guard.
const dashboardFetchInFlight = new Map<string, Promise<{ dashboard: CompanyDashboard | null; sourceTableDef: CustomTable | null }>>();

function fetchDashboardAndSourceTable(companyId: string, dashboardSlug: string): Promise<{ dashboard: CompanyDashboard | null; sourceTableDef: CustomTable | null }> {
  const key = `${companyId}:${dashboardSlug}`;
  const existing = dashboardFetchInFlight.get(key);
  if (existing) return existing;
  const promise = (async () => {
    // .eq('company_id', ...) -- company_dashboards.slug has no unique
    // constraint (two companies can each legitimately have a dashboard
    // slugged the same way), so a slug-only lookup relied entirely on RLS
    // to avoid resolving the wrong tenant's row.
    const { data: dash } = await supabase
      .from('company_dashboards').select('*').eq('slug', dashboardSlug).eq('company_id', companyId).is('deleted_at', null).maybeSingle();
    if (dash && !dash.widgets_migrated_at) {
      dash.widgets = await ensureDashboardWidgetsMigrated(dash);
    }
    let tbl: CustomTable | null = null;
    if (dash?.source_table_type === 'custom' && dash?.source_table_id) {
      const { data } = await supabase.from('company_tables').select('*').eq('id', dash.source_table_id).maybeSingle();
      tbl = data ?? null;
    }
    return { dashboard: dash, sourceTableDef: tbl };
  })();
  dashboardFetchInFlight.set(key, promise);
  promise.finally(() => { dashboardFetchInFlight.delete(key); });
  return promise;
}

// Loads a dashboard's config, resolves its source custom table via
// useCustomTable, and computes filtered records + summary tile values +
// daily chart series client-side over that table's full (unpaginated)
// record set -- same scale assumption useCustomTable already makes
// elsewhere in the app.
export function useDashboardData(dashboardSlug: string) {
  const { companyId, userId } = useCompany();
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
    // A fresh-enough cache hit is trusted outright -- no live re-fetch at
    // all, not even in the background. See DASHBOARD_CONFIG_TTL_MS above.
    if (cached && Date.now() - cached.cachedAt < DASHBOARD_CONFIG_TTL_MS) {
      return () => { active = false; };
    }
    (async () => {
      // Skips the fetch outright rather than querying with an undefined
      // company_id while CompanyContext is still resolving -- the effect
      // already re-runs once companyId is set (see the dependency array
      // below).
      if (!companyId) { setDashboardLoading(false); return; }
      const { dashboard: dash, sourceTableDef: tbl } = await fetchDashboardAndSourceTable(companyId, dashboardSlug);
      if (!active) return;
      setDashboard(dash);
      setSourceTableDef(tbl);
      setDashboardLoading(false);
      if (dash && companyId) writeShellCache(dashboardShellKey(companyId, dashboardSlug), { dashboard: dash, sourceTableDef: tbl, cachedAt: Date.now() });
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

  // Whether the signed-in viewer is allowed to see more than just their own
  // rows on a $current_user/$team_scope filter field (e.g. Time Entry's
  // Staff filter) -- gates DashboardFilterBar's "set as default view"
  // control and, below, whether that field auto-narrows to "just me" on a
  // fresh visit with no saved preference. null while unknown/not applicable
  // (no such field on this dashboard, so never fetched).
  const [canSeeMultipleScope, setCanSeeMultipleScope] = useState<boolean | null>(null);
  // Field ids (company_table_fields.id) this user has an explicit saved
  // default for on THIS dashboard -- includes an explicit "All" (see
  // dashboardFilterDefaults.ts), not just a picked person, so
  // DashboardFilterBar knows to suppress RelationPicker's own auto-select-
  // self effect even when the saved default IS "All" (value null).
  const [viewDefaultFieldIds, setViewDefaultFieldIds] = useState<Set<string>>(new Set());

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

  // Scoped by user + dashboard -- this viewer's own saved default on THIS
  // dashboard's scoped field(s), distinct from any other user or dashboard.
  const viewScopeDefaultsCacheKey = (uid: string, dashboardId: string) => `view_scope_defaults_${uid}_${dashboardId}`;

  // Seeds any $current_user/$team_scope filter field with this viewer's
  // saved default (see lib/services/dashboardFilterDefaults.ts) -- e.g. a
  // team lead who's set their Time Entry Staff filter to default to "All"
  // gets that instead of RelationPicker's own always-narrow-to-self
  // behavior (see DashboardFilterBar.tsx, which reads canSeeMultipleScope/
  // viewDefaultFieldIds below to suppress that effect appropriately).
  // Separate ref from defaultsSeededRef above -- this one waits on two
  // network round trips (scope check + saved defaults), so it can legitimately
  // still be pending after the date-defaults effect has already finished.
  // canViewMultipleTimeEntries() alone is up to 5 sequential DB round trips
  // (see lib/teamScope.ts) with no caching of its own, previously paid in
  // full on every single visit to a Time Entry-style dashboard -- cached
  // here (paint from a previous visit instantly, revalidate in the
  // background, same bail-if-unchanged pattern used elsewhere in the app) so
  // only the very first visit ever pays for it.
  const viewDefaultsSeededRef = useRef(false);
  useEffect(() => {
    if (viewDefaultsSeededRef.current || !dashboard || fields.length === 0) return;
    const filterBarWidget = dashboard.widgets.find(w => w.type === 'filter_bar');
    if (!filterBarWidget || filterBarWidget.type !== 'filter_bar') { viewDefaultsSeededRef.current = true; return; }
    const scopedFieldIds = filterBarWidget.config.fieldIds.filter(id => {
      const f = fields.find(f => f.id === id);
      return f && (f.linked_filter_value === CURRENT_USER_SENTINEL || f.linked_filter_value === TEAM_SCOPE_SENTINEL);
    });
    if (!scopedFieldIds.length) { viewDefaultsSeededRef.current = true; return; }
    viewDefaultsSeededRef.current = true;

    const apply = (canSeeMultiple: boolean, defaults: Record<string, string | null>) => {
      setCanSeeMultipleScope(canSeeMultiple);
      const nextFieldIds = new Set(scopedFieldIds.filter(id => id in defaults));
      setViewDefaultFieldIds(prev =>
        prev.size === nextFieldIds.size && [...prev].every(id => nextFieldIds.has(id)) ? prev : nextFieldIds);
      const toSeed = scopedFieldIds.filter(id => id in defaults);
      if (toSeed.length) {
        setFilters(prev => {
          const next = { ...prev };
          let changed = false;
          for (const id of toSeed) if (next[id] === undefined) { next[id] = defaults[id]; changed = true; }
          return changed ? next : prev;
        });
      }
    };

    const cacheKey = userId ? viewScopeDefaultsCacheKey(userId, dashboard.id) : null;
    const cached = cacheKey ? readCache<{ canSeeMultiple: boolean; defaults: Record<string, string | null> }>(cacheKey) : null;
    if (cached) apply(cached.canSeeMultiple, cached.defaults);

    (async () => {
      const [canSeeMultiple, defaults] = await Promise.all([
        canViewMultipleTimeEntries(),
        getFilterDefaults(dashboard.id),
      ]);
      if (cacheKey) writeCache(cacheKey, { canSeeMultiple, defaults });
      apply(canSeeMultiple, defaults);
    })();
  }, [dashboard, fields, userId]);

  // Persists (or clears) this viewer's default for one $current_user/
  // $team_scope filter field -- "All" is `value: null`, still a real saved
  // preference (see dashboardFilterDefaults.ts). Optimistic on
  // viewDefaultFieldIds so the UI flips immediately; the writes themselves
  // are fire-and-forget best-effort, matching setFilter's own no-error-
  // handling convention for this purely-cosmetic preference.
  // Keeps the view-scope-defaults cache above in step with an explicit
  // change here -- without this, a save/clear here would look silently
  // reverted for up to this session's lifetime (the cache has no TTL) the
  // next time this dashboard mounts, since the cached-paint branch above
  // would still hand back whatever was cached before this change.
  const patchViewDefaultsCache = (fieldId: string, value: string | null | undefined) => {
    if (!dashboard || !userId) return;
    const cacheKey = viewScopeDefaultsCacheKey(userId, dashboard.id);
    const cached = readCache<{ canSeeMultiple: boolean; defaults: Record<string, string | null> }>(cacheKey);
    if (!cached) return;
    const defaults = { ...cached.defaults };
    if (value === undefined) delete defaults[fieldId]; else defaults[fieldId] = value;
    writeCache(cacheKey, { ...cached, defaults });
  };

  const setViewDefault = useCallback((fieldId: string, value: string | null) => {
    if (!dashboard) return;
    setViewDefaultFieldIds(prev => new Set(prev).add(fieldId));
    patchViewDefaultsCache(fieldId, value);
    setFilterDefault(dashboard.id, fieldId, value);
  }, [dashboard, userId]);

  const clearViewDefault = useCallback((fieldId: string) => {
    if (!dashboard) return;
    setViewDefaultFieldIds(prev => { const next = new Set(prev); next.delete(fieldId); return next; });
    patchViewDefaultsCache(fieldId, undefined);
    clearFilterDefault(dashboard.id, fieldId);
  }, [dashboard, userId]);

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
    const nextDashboard = { ...dashboard, widgets: nextWidgets };
    setDashboard(nextDashboard);
    // Keep the shell cache in step with this optimistic update -- a
    // fresh-enough cache hit now skips a live re-fetch entirely (see
    // DASHBOARD_CONFIG_TTL_MS above), so without this a resize/reorder here
    // would look silently undone for up to that long if the viewer
    // navigates away and back. The builder's own save path clears this same
    // slot instead (DashboardBuilderPage.tsx's handleSave) since it doesn't
    // have a live sourceTableDef to write alongside it the way this does.
    if (companyId) writeShellCache(dashboardShellKey(companyId, dashboardSlug), { dashboard: nextDashboard, sourceTableDef, cachedAt: Date.now() });

    const { data: { user } } = await supabase.auth.getUser();
    const { data: after } = await supabase
      .from('company_dashboards').update({ widgets: nextWidgets }).eq('id', dashboard.id).select().single();
    if (after) {
      logSchemaChange({
        companyId: dashboard.company_id, actorId: user?.id ?? null, entityType: 'company_dashboard',
        entityId: dashboard.id, entityLabel: dashboard.name, action: 'update', before, after,
      });
    }
  }, [dashboard, companyId, dashboardSlug, sourceTableDef]);

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
    canSeeMultipleScope,
    viewDefaultFieldIds,
    setViewDefault,
    clearViewDefault,
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
