"use client";

// Two related but differently-scheduled warm-up jobs:
//
// - warmSystemTableShells() -- schema/customFields/relatedFields for the
//   four system tables (properties/entities/projects/tasks), the single
//   biggest measured contributor to a slow first table load. Exactly 4
//   known tables, and the whole point is that they're warm the moment the
//   loading screen dismisses, so this is BLOCKING: called and awaited
//   directly from lib/companyBootstrap.ts as part of the bootstrap sequence
//   the AppLoader gates on, not fire-and-forget background work.
//
// - startBackgroundShellPrefetch() -- custom tables/dashboards
//   (source_table_type === 'custom'), an open-ended, per-company list that
//   could be dozens of tables. Genuinely non-blocking background work: a
//   user's first-ever visit to a custom table/dashboard they haven't opened
//   yet is normally a cold load (no cache to paint from), and this quietly
//   turns it into a warm one while they're still looking at whatever page
//   they landed on -- see that function's own doc comment for the
//   scheduling/priority reasoning.

import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { readCache, writeCache } from "@/lib/queryCache";
import { ensureDashboardWidgetsMigrated } from "@/lib/dashboardWidgets/ensureMigrated";
import { getSchemaMetadata } from "@/lib/services/schemaService";
import { fetchCompanyCustomFields } from "./useCompanyCustomFields";
import { warmRelatedFields } from "./useRelatedFields";
import type { CustomTable } from "./useCustomTables";
import type { CustomTableField } from "./useCustomTable";
import type { CompanyDashboard } from "./useDashboardData";

const SYSTEM_TABLES = ['properties', 'entities', 'projects', 'tasks'] as const;

async function prefetchSystemTableShell(tableName: string, companyId: string | null): Promise<void> {
  await Promise.all([
    getSchemaMetadata(tableName, companyId).catch(() => {}),
    fetchCompanyCustomFields(tableName).catch(() => {}),
    warmRelatedFields(tableName).catch(() => {}),
  ]);
}

// Called directly from lib/companyBootstrap.ts as a blocking bootstrap step
// (unlike everything else in this file, which is deliberately non-blocking
// background work) -- schema/customFields/relatedFields for the four system
// tables is exactly what a first visit to Entities/Projects/Tasks needs, and
// leaving it to catch up in the background risked a user clicking there
// before it finished (each table's related-fields alone can take up to
// FETCH_TIMEOUT_MS). Parallel across all 4 tables (each already fires its 3
// fetches in parallel too) so the whole step is bounded by the single
// slowest fetch, not their sum -- worst case ~4s, not ~20s, and the
// AppLoader's own ceiling still protects against a truly dead network.
export async function warmSystemTableShells(companyId: string | null): Promise<void> {
  await Promise.all(SYSTEM_TABLES.map(t => prefetchSystemTableShell(t, companyId)));
}

// warmSystemTableShells above only covers schema/customFields/relatedFields
// -- the metadata GenericMasterTable needs to RENDER a table -- not the row
// data itself. Without this, a session's first visit to whichever of the 4
// system tables the user *didn't* land on always hit usePresetTable's cold
// "blocking fetch" path (nk_cache_rows_<companyId>_<table> empty), paying a
// real ~1s network round trip in full view of a skeleton, exactly the "still
// not faster" gap this warms away.
//
// Deliberately NOT the same query GenericMasterTable's fetchItems runs (that
// depends on live schema/column-layout state only available inside the
// mounted component, plus per-table junction/relation joins -- reproducing
// it here would mean duplicating that query-building logic outside React,
// a much larger and riskier change). A plain `select('*')` seed is enough:
// once cached, the real fetchItems call on first visit takes swr()'s
// warm-cache path (paint immediately, correct any relation/custom-field
// columns via its own background refresh) instead of the cold blocking one.
// Skips any table whose row cache already has real data (e.g. the table the
// user landed on already warmed it for real) so this never clobbers a fresher
// cache with this coarser shape.
async function warmSystemTableRows(tableName: string, companyId: string): Promise<void> {
  const cacheKey = `rows_${companyId}_${tableName}`;
  if (readCache(cacheKey)) return;
  try {
    const { data } = await supabase.from(tableName).select('*').is('deleted_at', null);
    if (data) writeCache(cacheKey, data);
  } catch {}
}

// Fire-and-forget, called right after warmSystemTableShells -- unlike that
// blocking step, row data is large enough per table (and inherently
// per-table-shaped, see above) that awaiting it here would meaningfully
// lengthen the loading screen for a coarser payload the real fetchItems
// call replaces within moments of landing anyway.
export function startSystemTableRowPrefetch(companyId: string | null): Promise<void> {
  if (!companyId) return Promise.resolve();
  return Promise.all(SYSTEM_TABLES.map(t => warmSystemTableRows(t, companyId))).then(() => {});
}

// Duplicated from useCustomTable.ts/useDashboardData.ts rather than
// imported -- both are one-line key formats, and keeping this module
// standalone (no imports FROM the hook files) avoids any risk of dragging
// their React-hook internals into a plain background-fetch module.
const tableShellKey = (slug: string) => `table:${slug}`;
const dashboardShellKey = (slug: string) => `dashboard:${slug}`;

interface CachedTableShell { tableDef: CustomTable; fields: CustomTableField[] }
interface CachedDashboardShell { dashboard: CompanyDashboard; sourceTableDef: CustomTable | null }

async function prefetchTableFields(tbl: CustomTable): Promise<void> {
  if (readShellCache<CachedTableShell>(tableShellKey(tbl.slug))) return;
  const { data: flds } = await supabase
    .from('company_table_fields')
    .select('*')
    .eq('table_id', tbl.id)
    .is('deleted_at', null)
    .order('display_order');
  writeShellCache(tableShellKey(tbl.slug), { tableDef: tbl, fields: (flds || []) as CustomTableField[] });
}

// Sequential, not Promise.all -- this is idle-time background work the user
// never explicitly asked for, so it should never burst enough concurrent
// requests to compete with whatever page they're actually looking at.
async function prefetchAllShells(): Promise<void> {
  const { data: tables } = await supabase
    .from('company_tables').select('*').is('deleted_at', null).order('display_order');
  const tableList = (tables || []) as CustomTable[];
  const tableById = new Map(tableList.map(t => [t.id, t]));

  for (const tbl of tableList) {
    await prefetchTableFields(tbl);
  }

  const { data: dashboards } = await supabase
    .from('company_dashboards').select('*').is('deleted_at', null).order('display_order');

  for (const dash of (dashboards || []) as (CompanyDashboard & { id: string; widgets_migrated_at: string | null })[]) {
    if (dash.source_table_type !== 'custom' || !dash.source_table_id) continue;
    if (readShellCache<CachedDashboardShell>(dashboardShellKey(dash.slug))) continue;
    // Same one-time, idempotent migration useDashboardData.ts's own effect
    // runs on a real open -- doing it here just means it's already done by
    // the time the user gets there.
    if (!dash.widgets_migrated_at) {
      dash.widgets = await ensureDashboardWidgetsMigrated(dash);
    }
    const sourceTableDef = tableById.get(dash.source_table_id) ?? null;
    writeShellCache(dashboardShellKey(dash.slug), { dashboard: dash, sourceTableDef });
    if (sourceTableDef) await prefetchTableFields(sourceTableDef);
  }
}

let started = false;
let inFlight: Promise<void> | null = null;

// Call once, right after the company/user identity resolves (CompanyContext
// / lib/companyBootstrap.ts). Used to be delayed 2.5s to give the current
// page's own loading a head start -- now called as part of the app's own
// warm-up sequence (AppLoader awaits this directly for its progress bar),
// so firing it immediately instead of after a delay is the point: it's no
// longer background-only work competing with a page the user is already
// looking at, it's part of what the loading screen is *for*. The `started`
// guard is mainly for React Strict Mode's double-invoke in dev; in
// production CompanyProvider only mounts once per session anyway.
export function startBackgroundShellPrefetch(): Promise<void> {
  if (inFlight) return inFlight;
  if (started) return Promise.resolve();
  started = true;
  inFlight = prefetchAllShells().catch(() => {}).then(() => { inFlight = null; });
  return inFlight;
}
