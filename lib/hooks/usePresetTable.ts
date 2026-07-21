// lib/hooks/usePresetTable.ts
"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { perfLog } from "@/lib/perfLog";

const DEFAULT_PRESET_NAME = "Default view";

// Crude but effective stand-in for the real column label — this hook has no
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

interface CachedColumnConfig {
  tableCols: string[];
  expandCols: string[];
  colWidths: Record<string, number>;
  presetName: string;
  sort: SortState | null;
}

function rowsCacheKey(companyId: string, tableSlug: string): string {
  return `nk_cache_rows_${companyId}_${tableSlug}`;
}

function columnsCacheKey(companyId: string, tableSlug: string): string {
  return `nk_cache_columns_${companyId}_${tableSlug}`;
}

// Synchronous reads for useState lazy initializers — see the matching
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

function readCachedColumns(companyId: string | null | undefined, tableSlug: string): CachedColumnConfig | null {
  if (!companyId) return null;
  try {
    const raw = localStorage.getItem(columnsCacheKey(companyId, tableSlug));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedColumns(companyId: string, tableSlug: string, config: CachedColumnConfig): void {
  try {
    localStorage.setItem(columnsCacheKey(companyId, tableSlug), JSON.stringify(config));
  } catch {}
}

interface UsePresetTableOptions {
  tableSlug: string;
  defaultCols: string[];
  defaultExpandCols?: string[];
  defaultExpandRelations?: string[];
  userId?: string | null; // pass from context to skip auth call
  companyId?: string | null; // pass from context — columns are company-wide, not personal
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
  isAdmin = false,
  schemaReady = true,
  fetchItems,
}: UsePresetTableOptions) {
  // Lazy initializers run synchronously on first render — a table already
  // visited this session (e.g. switching Properties → Entities → back)
  // renders with its last-known rows/columns immediately instead of
  // blanking to a skeleton for a frame while init() re-fetches in the
  // background. See the matching comment in useTableSchema.ts.
  const [items, setItems] = useState<any[]>(() => readCachedRows(companyId, tableSlug) ?? []);
  const [loading, setLoading] = useState(() => readCachedRows(companyId, tableSlug) === null);

  const cachedColumnsAtMount = useMemo(() => readCachedColumns(companyId, tableSlug), []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only read once, at mount
  const [tableCols, setTableCols] = useState<string[]>(() => cachedColumnsAtMount?.tableCols ?? defaultCols);
  const [expandCols, setExpandCols] = useState<string[]>(() => cachedColumnsAtMount?.expandCols ?? defaultExpandCols);
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => cachedColumnsAtMount?.colWidths ?? {});
  const [expandRelations, setExpandRelations] = useState<string[]>(defaultExpandRelations);
  const [activePreset, setActivePreset] = useState(() => cachedColumnsAtMount?.presetName ?? DEFAULT_PRESET_NAME);
  const [sort, setSort] = useState<SortState | null>(() => cachedColumnsAtMount?.sort ?? null);

  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // colWidths only stores columns an admin has explicitly resized — everything
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

  // Most callers already have the user id via context (providedUserId) —
  // only hit auth.getUser() when that isn't available.
  const resolveUserId = useCallback(async (): Promise<string | null> => {
    if (providedUserId) return providedUserId;
    const { data: { user } } = await supabase.auth.getUser();
    return user?.id ?? null;
  }, [providedUserId]);

  // Columns/widths are company-wide (set by admins, shared by every member) —
  // wait for companyId from context rather than re-resolving it here, so we
  // don't duplicate the identity fetch GenericMasterTable already does.
  const init = useCallback(async () => {
    if (!companyId || !schemaReady) return;
    perfLog(`usePresetTable(${tableSlug}): init start`);

    // ── Step 1: show cached rows immediately ─────────────────────
    // (Already seeded synchronously via the lazy initializer above when
    // possible — this re-check just decides whether we can skip blocking
    // the UI on this run. Only flip loading on when there's truly no
    // cache, so a lazily-seeded "not loading" state isn't clobbered.)
    const cachedRows = readCachedRows(companyId, tableSlug);
    const hasCachedData = !!cachedRows;
    if (hasCachedData) {
      setItems(cachedRows);
      // companyId often resolves a tick after mount, so the lazy initializer
      // above may have seeded loading=true (it read with companyId still
      // null, before any cache was visible). Reconcile it here now that we
      // actually know there's cached data to show — otherwise this branch
      // never touches setLoading again (it only refreshes in the background)
      // and the skeleton stays up forever.
      setLoading(false);
    } else {
      setLoading(true);
    }

    // ── Step 2: load the company's column layout (single source of truth) ──
    let resolvedTableCols = defaultCols;
    let resolvedExpandCols = defaultExpandCols;
    let resolvedWidths: Record<string, number> = {};
    let resolvedPresetName = DEFAULT_PRESET_NAME;
    let resolvedSort: SortState | null = null;

    const { data: companyView } = await supabase
      .from('company_default_views')
      .select('*')
      .eq('company_id', companyId)
      .eq('table_slug', tableSlug)
      .maybeSingle();
    perfLog(`usePresetTable(${tableSlug}): company_default_views resolved`);

    if (companyView) {
      resolvedTableCols = companyView.columns?.length ? companyView.columns : defaultCols;
      resolvedExpandCols = companyView.expansion_columns || defaultExpandCols;
      resolvedWidths = companyView.column_widths || {};
      resolvedPresetName = companyView.preset_name || DEFAULT_PRESET_NAME;
      resolvedSort = companyView.sort || null;
    }

    writeCachedColumns(companyId, tableSlug, {
      tableCols: resolvedTableCols, expandCols: resolvedExpandCols,
      colWidths: resolvedWidths, presetName: resolvedPresetName, sort: resolvedSort,
    });
    setTableCols(resolvedTableCols);
    setExpandCols(resolvedExpandCols);
    setColWidths(resolvedWidths);
    setActivePreset(resolvedPresetName);
    setSort(resolvedSort);

    // ── Step 3: fetch fresh data ──────────────────────────────────
    // If we had cached data, fetch in background and only update if changed
    if (hasCachedData) {
      fetchItemsRef.current([...resolvedTableCols, ...resolvedExpandCols])
        .then(fresh => {
          perfLog(`usePresetTable(${tableSlug}): background refresh resolved`, `${fresh?.length ?? 0} rows`);
          if (fresh?.length) setItems(fresh);
        })
        .catch(() => {});
    } else {
      // No cache — must wait
      const data = await fetchItemsRef.current([...resolvedTableCols, ...resolvedExpandCols]);
      perfLog(`usePresetTable(${tableSlug}): blocking fetch resolved`, `${data?.length ?? 0} rows`);
      if (data?.length) setItems(data);
      setLoading(false);
    }
  }, [tableSlug, companyId, schemaReady]); // fetchItems/defaultCols accessed via closure — recreated only when identity/company/schema readiness changes

  useEffect(() => { init(); }, [init]);

  // Persists the company-wide column layout (+ sort). Admin-only — every
  // member reads this same row, so an admin's change is immediately
  // "hardcoded" for the team.
  const saveCompanyColumns = async (
    t: string[] = tableCols, e: string[] = expandCols,
    w: Record<string, number> = colWidths,
    s: SortState | null = sort,
  ) => {
    if (!isAdmin || !companyId) return;
    const userId = await resolveUserId();
    await supabase.from('company_default_views').upsert({
      company_id: companyId,
      table_slug: tableSlug,
      columns: t,
      expansion_columns: e,
      column_widths: w,
      sort: s,
      preset_name: activePreset,
      created_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,table_slug' });
  };

  const startResizing = (colId: string, e: React.MouseEvent) => {
    if (!isAdmin) return;
    const startX = e.pageX;
    // Start from the visible (possibly estimated) width, not raw state, so
    // the column doesn't visually jump to a flat default the moment a drag begins.
    const startWidth = effectiveColWidths[colId] || 250;
    // Track the latest widths outside React state so the save-on-mouseup
    // call is a plain statement, not a side effect inside a setState
    // updater — React (Strict Mode) may invoke updater functions twice.
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

  // Sorting itself is free for everyone (session-only, applied client-side) —
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
