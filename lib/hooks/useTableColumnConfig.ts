"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { fetchScopedDefaultView, type ScopedDefaultView } from "@/lib/hooks/scopedDefaultView";
import { readCachedScopedView, writeCachedScopedView } from "@/lib/hooks/usePresetTable";

const DEFAULT_PRESET_NAME = "Default view";

// Same estimate usePresetTable.ts uses for a column that's never been
// explicitly resized -- kept in sync manually since the two hooks
// deliberately don't share code (see this file's own top comment).
function estimateDefaultWidth(colId: string): number {
  const label = colId
    .replace(/^custom_field:/, '')
    .replace(/^related:.*:/, '')
    .replace(/\./g, ' ')
    .replace(/_id$/, '')
    .replace(/_/g, ' ');
  const base = Math.round(label.length * 7.5) + 72;
  return Math.min(320, Math.max(130, base));
}

export type SortDirection = 'asc' | 'desc';
export type SortMode = 'name' | 'number';

export interface SortState {
  colId: string;
  direction: SortDirection;
  mode?: SortMode;
}

interface UseTableColumnConfigOptions {
  tableSlug: string;
  defaultCols: string[];
  defaultExpandCols?: string[];
  companyId?: string | null;
  userId?: string | null;
  myTeamIds?: string[];
  isAdmin?: boolean;
  // false while defaultCols/defaultExpandCols are still resolving (e.g.
  // custom table fields not loaded yet) -- avoids briefly saving those
  // placeholder defaults as if they were the real company default.
  schemaReady?: boolean;
}

// The column-config half of usePresetTable.ts (tableCols/expandCols/
// colWidths/sort persisted to company_default_views, admin-only
// reorder/resize/toggle) pulled out into its own hook so a table that
// doesn't fetch its rows the same way system tables do (custom tables,
// via useCustomTable, not usePresetTable's own fetchItems/row-cache) can
// still share the exact same persisted shape, three-state table/expand/none
// semantics, and ColumnConfigDrawer UI. usePresetTable itself is left as-is
// (own inline copy of this logic) rather than refactored to call this --
// its column load is deliberately sequenced in the same tick as its row
// fetch to avoid a double round-trip (see its own comments), which a shared
// hook with its own independent effect can't preserve without risking a
// regression on the 4 live system tables that already depend on it.
export function useTableColumnConfig({
  tableSlug, defaultCols, defaultExpandCols = [], companyId, userId, myTeamIds, isAdmin = false, schemaReady = true,
}: UseTableColumnConfigOptions) {
  // Applies defaultCols/defaultExpandCols fallback to a raw scoped-view
  // answer (or its absence) -- same helper shape as usePresetTable.ts's own
  // resolveFromView, kept local here since the two hooks deliberately don't
  // share code (see this file's own top comment).
  const resolveFromView = useCallback((view: ScopedDefaultView | null) => ({
    tableCols: view?.columns?.length ? view.columns : defaultCols,
    expandCols: view?.expansion_columns || defaultExpandCols,
    colWidths: view?.column_widths || {},
    presetName: view?.preset_name || DEFAULT_PRESET_NAME,
    sort: (view?.sort as SortState | null) || null,
  }), [defaultCols, defaultExpandCols]);

  const cachedAtMount = useMemo(
    () => (companyId && tableSlug ? readCachedScopedView(companyId, tableSlug) : null),
    [], // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only read once, at mount
  );
  const resolvedAtMount = useMemo(
    () => (cachedAtMount ? resolveFromView(cachedAtMount.view) : null),
    [], // eslint-disable-line react-hooks/exhaustive-deps -- paired with cachedAtMount's own one-time read
  );

  const [tableCols, setTableCols] = useState<string[]>(() => resolvedAtMount?.tableCols ?? defaultCols);
  const [expandCols, setExpandCols] = useState<string[]>(() => resolvedAtMount?.expandCols ?? defaultExpandCols);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => resolvedAtMount?.colWidths ?? {});
  const [activePreset, setActivePreset] = useState(() => resolvedAtMount?.presetName ?? DEFAULT_PRESET_NAME);
  const [sort, setSort] = useState<SortState | null>(() => resolvedAtMount?.sort ?? null);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  // True once the company's saved row (or the absence of one) has been
  // resolved -- lets a caller avoid flashing defaultCols for a frame before
  // a real saved layout arrives.
  const [loaded, setLoaded] = useState(() => !!cachedAtMount);

  const effectiveColWidths = useMemo(() => {
    const merged: Record<string, number> = { ...colWidths };
    for (const colId of [...tableCols, ...expandCols]) {
      if (merged[colId] == null) merged[colId] = estimateDefaultWidth(colId);
    }
    return merged;
  }, [colWidths, tableCols, expandCols]);

  useEffect(() => {
    if (!companyId || !tableSlug || !schemaReady) return;
    let active = true;
    const cached = readCachedScopedView(companyId, tableSlug);
    if (cached) {
      // Already applied via the lazy initializer on first mount -- but this
      // effect can re-run later too (table/company identity change), so
      // reconcile here as well. No blocking wait -- that's the whole point
      // of the cache existing; refresh in the background instead, and only
      // touch state if the real answer actually changed.
      const resolved = resolveFromView(cached.view);
      setTableCols(resolved.tableCols);
      setExpandCols(resolved.expandCols);
      setColWidths(resolved.colWidths);
      setActivePreset(resolved.presetName);
      setSort(resolved.sort);
      setLoaded(true);
      fetchScopedDefaultView(companyId, tableSlug, userId, myTeamIds).then(fresh => {
        if (!active) return;
        if (JSON.stringify(fresh) === JSON.stringify(cached.view)) return;
        writeCachedScopedView(companyId, tableSlug, fresh);
        const freshResolved = resolveFromView(fresh);
        setTableCols(freshResolved.tableCols);
        setExpandCols(freshResolved.expandCols);
        setColWidths(freshResolved.colWidths);
        setActivePreset(freshResolved.presetName);
        setSort(freshResolved.sort);
      }).catch(() => {});
      return;
    }
    (async () => {
      const companyView = await fetchScopedDefaultView(companyId, tableSlug, userId, myTeamIds);
      if (!active) return;
      writeCachedScopedView(companyId, tableSlug, companyView);
      // No saved row yet (every table before its first admin visit to
      // Setup) -- still need to push tableCols/expandCols to the properly-
      // resolved defaults here, not leave them at whatever the initial
      // useState(defaultCols) call saw. That call ran on this hook's very
      // first mount, when the caller's own fields hadn't loaded yet (so
      // defaultCols was still `[]`) -- useState ignores that argument on
      // every render after the first, so without this the table would be
      // stuck showing zero columns forever, only ever fixed by an admin
      // happening to open Setup and change something. Confirmed live.
      const resolved = resolveFromView(companyView);
      setTableCols(resolved.tableCols);
      setExpandCols(resolved.expandCols);
      setColWidths(resolved.colWidths);
      setActivePreset(resolved.presetName);
      setSort(resolved.sort);
      setLoaded(true);
    })();
    return () => { active = false; };
    // defaultCols/defaultExpandCols/resolveFromView read via closure, not
    // deps -- only re-resolve when the table/company identity actually
    // changes, same reasoning as usePresetTable's own init() (resolveFromView
    // deliberately excluded: it's recreated whenever a caller passes new
    // defaultCols/defaultExpandCols array literals, which would otherwise
    // re-run this effect on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableSlug, companyId, schemaReady, userId, (myTeamIds || []).join(',')]);

  const saveCompanyColumns = async (
    t: string[] = tableCols, e: string[] = expandCols,
    w: Record<string, number> = colWidths, s: SortState | null = sort,
  ) => {
    if (!isAdmin || !companyId) return;
    const { data: { user } } = await supabase.auth.getUser();
    const saved = {
      company_id: companyId,
      table_slug: tableSlug,
      columns: t,
      expansion_columns: e,
      column_widths: w,
      sort: s,
      preset_name: activePreset,
      created_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from('company_default_views').upsert(saved, { onConflict: 'company_id,table_slug' });
    // Keep the cache in step with what was just saved -- otherwise the next
    // mount would show this admin's own edit, then briefly flash back to the
    // pre-edit layout once the cache's stale copy seeds state, before the
    // background refresh corrects it a moment later.
    writeCachedScopedView(companyId, tableSlug, saved as ScopedDefaultView);
  };

  const startResizing = (colId: string, e: React.MouseEvent) => {
    if (!isAdmin) return;
    const startX = e.pageX;
    const startWidth = effectiveColWidths[colId] || 250;
    let latestWidths = colWidths;
    const onMouseMove = (mE: MouseEvent) => {
      const newWidth = Math.max(150, startWidth + (mE.pageX - startX));
      setColWidths(prev => {
        latestWidths = { ...prev, [colId]: newWidth };
        return latestWidths;
      });
    };
    const onMouseUp = () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      saveCompanyColumns(tableCols, expandCols, latestWidths, sort);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  };

  const handleReorder = (next: string[]) => {
    if (!isAdmin) return;
    setTableCols(next);
    saveCompanyColumns(next, expandCols, colWidths);
  };

  const handleToggleColumn = (fieldId: string, target: 'table' | 'expand' | 'none') => {
    if (!isAdmin) return;
    const nt = tableCols.filter(c => c !== fieldId);
    const ne = expandCols.filter(c => c !== fieldId);
    if (target === 'table') nt.push(fieldId);
    if (target === 'expand') ne.push(fieldId);
    setTableCols(nt);
    setExpandCols(ne);
    saveCompanyColumns(nt, ne, colWidths);
  };

  const handleSort = (colId: string, direction: SortDirection, mode?: SortMode) => {
    const next: SortState | null =
      (sort?.colId === colId && sort?.direction === direction && sort?.mode === mode)
        ? null
        : { colId, direction, mode };
    setSort(next);
    if (isAdmin) saveCompanyColumns(tableCols, expandCols, colWidths, next);
  };

  return {
    tableCols, expandCols, colWidths: effectiveColWidths,
    activePreset, sort, loaded,
    draggedIdx, setDraggedIdx,
    handleToggleColumn, handleReorder, startResizing, handleSort,
  };
}
