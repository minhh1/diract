// lib/hooks/usePresetTable.ts
"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";
import { fetchScopedDefaultView, type ScopedDefaultView } from "@/lib/hooks/scopedDefaultView";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

const DEFAULT_PRESET_NAME = "Default view";

// Crude but effective stand-in for the real column label -- this hook has no
// access to schema/relation metadata, so it estimates from the column id
// itself (roughly tracks label length: underscores/dots become spaces).
// Used only until an admin explicitly resizes a column, at which point the
// real width is persisted and this estimate is never consulted again.
function estimateDefaultWidth(colId: string): number {
  const label = colId
    .replace(/^custom_field:/, '')
    .replace(/\./g, ' ')
    .replace(/_id$/, '')
    .replace(/_/g, ' ');
  const base = Math.round(label.length * 7.5) + 72; // ~char width + icon/padding allowance
  return Math.min(320, Math.max(130, base));
}

export type SortDirection = 'asc' | 'desc';
export type SortMode = 'name' | 'number';

export interface SortState {
  colId: string;
  direction: SortDirection;
  mode?: SortMode;
}

interface ResolvedColumnConfig {
  tableCols: string[];
  expandCols: string[];
  colWidths: Record<string, number>;
  presetName: string;
  sort: SortState | null;
}

function rowsCacheKey(companyId: string, tableSlug: string): string {
  return `nk_cache_rows_${companyId}_${tableSlug}`;
}

// Caches fetchScopedDefaultView's RAW answer (including the "genuinely no
// customization, null" case -- wrapped so that's distinguishable from "never
// checked") rather than a resolved-with-fallbacks config. Deliberately
// decoupled from defaultCols/defaultExpandCols (which only this hook's
// caller knows, per table) -- that split is what lets
// lib/hooks/prefetchShells.ts's bootstrap-time warming populate this cache
// for all 4 system tables without needing to duplicate each one's specific
// defaults; applying the fallback (resolveFromView below) stays exactly
// where it already was, whether the raw view came from this cache or a
// fresh fetch.
interface CachedScopedView { view: ScopedDefaultView | null }

function scopedViewCacheKey(companyId: string, tableSlug: string): string {
  return `nk_cache_scopedview_${companyId}_${tableSlug}`;
}

export function readCachedScopedView(companyId: string, tableSlug: string): CachedScopedView | null {
  try {
    const raw = localStorage.getItem(scopedViewCacheKey(companyId, tableSlug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeCachedScopedView(companyId: string, tableSlug: string, view: ScopedDefaultView | null): void {
  try {
    localStorage.setItem(scopedViewCacheKey(companyId, tableSlug), JSON.stringify({ view } as CachedScopedView));
  } catch {}
}

// Synchronous reads for useState lazy initializers -- see the matching
// comment in useTableSchema.ts for why this matters (avoids a one-frame
// "loading" flash when remounting on an already-visited table/company).
function readCachedRows(companyId: string | null | undefined, tableSlug: string): any[] | null {
  if (!companyId) return null;
  try {
    const raw = localStorage.getItem(rowsCacheKey(companyId, tableSlug));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return entry?.data?.length ? entry.data : null;
  } catch {
    return null;
  }
}

interface UsePresetTableOptions {
  tableSlug: string;
  defaultCols: string[];
  defaultExpandCols?: string[];
  defaultExpandRelations?: string[];
  userId?: string | null; // pass from context to skip auth call
  companyId?: string | null; // pass from context -- columns are company-wide, not personal
  myTeamIds?: string[]; // pass from context -- resolves a team-scoped default view ahead of the company-wide one
  isAdmin?: boolean; // only admins may change the company's column layout
  schemaReady?: boolean; // false while defaultCols/defaultExpandCols are still resolving
  fetchItems: (visibleColumns: string[]) => Promise<any[]>;
}

export function usePresetTable({
  tableSlug,
  defaultCols,
  defaultExpandCols = [],
  defaultExpandRelations = [],
  userId: providedUserId,
  companyId,
  myTeamIds,
  isAdmin = false,
  schemaReady = true,
  fetchItems,
}: UsePresetTableOptions) {
  // Lazy initializers run synchronously on first render -- a table already
  // visited this session (e.g. switching Properties → Entities → back)
  // renders with its last-known rows/columns immediately instead of
  // blanking to a skeleton for a frame while init() re-fetches in the
  // background. See the matching comment in useTableSchema.ts.
  const [items, setItems] = useState<any[]>(() => readCachedRows(companyId, tableSlug) ?? []);
  const [loading, setLoading] = useState(() => readCachedRows(companyId, tableSlug) === null);

  // Applies defaultCols/defaultExpandCols fallback to a raw scoped-view
  // answer (or its absence) -- the one place that logic lives, whether the
  // view came from cache or a fresh fetch. Stable across renders (doesn't
  // close over any state), so it's safe to call from the lazy initializers
  // below and from init() without needing to be a dependency of either.
  const resolveFromView = useCallback((view: ScopedDefaultView | null): ResolvedColumnConfig => ({
    tableCols: view?.columns?.length ? view.columns : defaultCols,
    expandCols: view?.expansion_columns || defaultExpandCols,
    colWidths: view?.column_widths || {},
    presetName: view?.preset_name || DEFAULT_PRESET_NAME,
    sort: view?.sort || null,
  }), [defaultCols, defaultExpandCols]);

  const cachedScopedViewAtMount = useMemo(() => (companyId ? readCachedScopedView(companyId, tableSlug) : null), []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only read once, at mount
  const resolvedAtMount = useMemo(
    () => cachedScopedViewAtMount ? resolveFromView(cachedScopedViewAtMount.view) : null,
    [], // eslint-disable-line react-hooks/exhaustive-deps -- paired with cachedScopedViewAtMount's own one-time read
  );
  const [tableCols, setTableCols] = useState<string[]>(() => resolvedAtMount?.tableCols ?? defaultCols);
  const [expandCols, setExpandCols] = useState<string[]>(() => resolvedAtMount?.expandCols ?? defaultExpandCols);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => resolvedAtMount?.colWidths ?? {});
  const [expandRelations, setExpandRelations] = useState<string[]>(defaultExpandRelations);
  const [activePreset, setActivePreset] = useState(() => resolvedAtMount?.presetName ?? DEFAULT_PRESET_NAME);
  const [sort, setSort] = useState<SortState | null>(() => resolvedAtMount?.sort ?? null);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // colWidths only stores columns an admin has explicitly resized -- everything
  // else falls back to a size estimate here rather than one flat default, so
  // newly-added or never-resized columns don't all render at the same width.
  const effectiveColWidths = useMemo(() => {
    const merged: Record<string, number> = { ...colWidths };
    for (const colId of [...tableCols, ...expandCols]) {
      if (merged[colId] == null) merged[colId] = estimateDefaultWidth(colId);
    }
    return merged;
  }, [colWidths, tableCols, expandCols]);

  const fetchItemsRef = useRef(fetchItems);
  fetchItemsRef.current = fetchItems; // always latest without being a dep

  // Most callers already have the user id via context (providedUserId) -
  // only hit auth.getUser() when that isn't available.
  const resolveUserId = useCallback(async (): Promise<string | null> => {
    if (providedUserId) return providedUserId;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }, [providedUserId]);

  // Columns/widths are company-wide (set by admins, shared by every member) -
  // wait for companyId from context rather than re-resolving it here, so we
  // don't duplicate the identity fetch GenericMasterTable already does.
  const init = useCallback(async () => {
    if (!companyId || !schemaReady) return;
    perfLog(`usePresetTable(${tableSlug}): init start`);

    // ── Step 1: show cached rows immediately ─────────────────────
    // (Already seeded synchronously via the lazy initializer above when
    // possible -- this re-check just decides whether we can skip blocking
    // the UI on this run. Only flip loading on when there's truly no
    // cache, so a lazily-seeded "not loading" state isn't clobbered.)
    const cachedRows = readCachedRows(companyId, tableSlug);
    const hasCachedData = !!cachedRows;
    if (hasCachedData) {
      setItems(cachedRows);
      // companyId often resolves a tick after mount, so the lazy initializer
      // above may have seeded loading=true (it read with companyId still
      // null, before any cache was visible). Reconcile it here now that we
      // actually know there's cached data to show -- otherwise this branch
      // never touches setLoading again (it only refreshes in the background)
      // and the skeleton stays up forever.
      setLoading(false);
    } else {
      setLoading(true);
    }

    // ── Step 2: load the company's column layout (single source of truth) ──
    // A cached raw view lets Step 3 fire immediately with the RIGHT column
    // list instead of defaultCols -- the whole point of this cache existing -
    // while the real answer is still refreshed in the background in case an
    // admin changed the layout since it was cached.
    const cachedScopedView = readCachedScopedView(companyId, tableSlug);
    let resolved: ResolvedColumnConfig;

    if (cachedScopedView) {
      resolved = resolveFromView(cachedScopedView.view);
      setTableCols(resolved.tableCols);
      setExpandCols(resolved.expandCols);
      setColWidths(resolved.colWidths);
      setActivePreset(resolved.presetName);
      setSort(resolved.sort);

      fetchScopedDefaultView(companyId, tableSlug, await resolveUserId(), myTeamIds)
        .then(fresh => {
          perfLog(`usePresetTable(${tableSlug}): company_default_views refreshed in background`);
          if (JSON.stringify(fresh) === JSON.stringify(cachedScopedView.view)) return;
          writeCachedScopedView(companyId, tableSlug, fresh);
          const freshResolved = resolveFromView(fresh);
          setTableCols(freshResolved.tableCols);
          setExpandCols(freshResolved.expandCols);
          setColWidths(freshResolved.colWidths);
          setActivePreset(freshResolved.presetName);
          setSort(freshResolved.sort);
        })
        .catch(() => {});
    } else {
      const companyView = await fetchScopedDefaultView(companyId, tableSlug, await resolveUserId(), myTeamIds);
      perfLog(`usePresetTable(${tableSlug}): company_default_views resolved`);
      writeCachedScopedView(companyId, tableSlug, companyView);
      resolved = resolveFromView(companyView);
      setTableCols(resolved.tableCols);
      setExpandCols(resolved.expandCols);
      setColWidths(resolved.colWidths);
      setActivePreset(resolved.presetName);
      setSort(resolved.sort);
    }

    // ── Step 3: fetch fresh data ──────────────────────────────────
    // If we had cached data, fetch in background and only update if changed
    if (hasCachedData) {
      fetchItemsRef.current([...resolved.tableCols, ...resolved.expandCols])
        .then(fresh => {
          perfLog(`usePresetTable(${tableSlug}): background refresh resolved`, `${fresh?.length ?? 0} rows`);
          if (!fresh?.length) return;
          // Bail out to the same array reference when this revalidate just
          // confirms the cached rows were already correct -- same pattern
          // the column-layout background refresh right above already uses.
          // Purely about the ROW data (`items`); Properties' specialised
          // street-number/street-name sort (see GenericMasterTable.tsx's
          // sortedItems) is a separate, pure client-side computation over
          // `items` + `sort` state -- untouched by this, and still
          // recomputes correctly whenever either actually changes.
          setItems(prev => JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh);
        })
        .catch(() => {});
    } else {
      // No cache -- must wait
      const data = await fetchItemsRef.current([...resolved.tableCols, ...resolved.expandCols]);
      perfLog(`usePresetTable(${tableSlug}): blocking fetch resolved`, `${data?.length ?? 0} rows`);
      if (data?.length) setItems(data);
      setLoading(false);
    }
  }, [tableSlug, companyId, schemaReady, resolveUserId, (myTeamIds || []).join(',')]); // fetchItems/defaultCols/resolveFromView accessed via closure -- recreated only when identity/company/schema readiness changes (resolveFromView deliberately excluded: it's recreated whenever a caller passes new defaultCols/defaultExpandCols array literals, which would otherwise re-run init on every render)

  // Layout effect, not a plain effect -- init()'s cache-hit paths (Step 1's
  // items/loading correction, Step 2's tableCols/expandCols/colWidths/sort
  // correction) are synchronous code (localStorage reads, no `await` before
  // their setState calls) even though init() itself is an async function --
  // an async function's body runs synchronously up to its first real
  // `await`, so those corrections land within this layout effect's flush,
  // before the browser paints. Previously this was a plain useEffect, which
  // runs AFTER paint -- so on any render where the lazy useState/useMemo
  // initializers above (each gated on `companyId` being synchronously
  // available at that exact first render) missed the cache, the user
  // visibly saw the wrong sort/columns/rows for a frame before init()
  // corrected it. Mirrors the identical fix already applied to
  // useCustomTable.ts's mount effect.
  useIsomorphicLayoutEffect(() => { init(); }, [init]);

  // Persists the company-wide column layout (+ sort). Admin-only -- every
  // member reads this same row, so an admin's change is immediately
  // "hardcoded" for the team.
  const saveCompanyColumns = async (
    t: string[] = tableCols, e: string[] = expandCols,
    w: Record<string, number> = colWidths,
    s: SortState | null = sort,
  ) => {
    if (!isAdmin || !companyId) return;
    const userId = await resolveUserId();
    // Conflict target must name all 4 columns of uq_company_default_views_scope
    // (a single NULLS NOT DISTINCT constraint, not the 3 partial indexes the
    // schema briefly had) -- see supabase/migrations/20260731150100_fix_default_views_conflict_target.sql
    // for why: a plain 'company_id,table_slug' target against a partial
    // index fails outright (Postgres 42P10), which silently broke every
    // save here (the error was never checked) until this fix.
    const { error } = await supabase.from('company_default_views').upsert({
      company_id: companyId,
      table_slug: tableSlug,
      columns: t,
      expansion_columns: e,
      column_widths: w,
      sort: s,
      preset_name: activePreset,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,table_slug,team_id,user_id' });
    if (error) console.error(`usePresetTable(${tableSlug}): saveCompanyColumns failed`, error.message);
  };

  const startResizing = (colId: string, e: React.MouseEvent) => {
    if (!isAdmin) return;
    const startX = e.pageX;
    // Start from the visible (possibly estimated) width, not raw state, so
    // the column doesn't visually jump to a flat default the moment a drag begins.
    const startWidth = effectiveColWidths[colId] || 250;
    // Track the latest widths outside React state so the save-on-mouseup
    // call is a plain statement, not a side effect inside a setState
    // updater -- React (Strict Mode) may invoke updater functions twice.
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

  // Sorting itself is free for everyone (session-only, applied client-side) -
  // but when an admin sorts, that choice also becomes the durable company
  // default, same as column changes. Mirrors how filters work: instant for
  // everyone, permanent only through the admin-authored / saved-view path.
  const handleSort = (colId: string, direction: SortDirection, mode?: SortMode) => {
    const next: SortState | null =
      (sort?.colId === colId && sort?.direction === direction && sort?.mode === mode)
        ? null
        : { colId, direction, mode };
    setSort(next);
    if (isAdmin) saveCompanyColumns(tableCols, expandCols, colWidths, next);
  };

  const toggleExpandRow = (id: string) => {
    setExpandedRow(prev => prev === id ? null : id);
  };

  return {
    items, setItems, loading, refresh: init,
    tableCols, expandCols, colWidths: effectiveColWidths,
    expandRelations, setExpandRelations,
    draggedIdx, setDraggedIdx, expandedRow, toggleExpandRow,
    activePreset, sort, handleSort,
    handleToggleColumn, handleReorder, startResizing,
  };
}
