"use client";

// Background prefetch of every custom table's and custom dashboard's shell
// (fields / dashboard config / source table def) into the same localStorage
// cache useCustomTable.ts/useDashboardData.ts already read from (see
// shellCache.ts). A user's FIRST-EVER visit to a table/dashboard they
// haven't opened yet is normally a genuinely cold load (no cache to paint
// from); this turns it into a warm one by doing the fetching in the
// background while they're still looking at whatever page they landed on
// (typically Matters/Projects) -- see startBackgroundShellPrefetch()'s own
// doc comment for the scheduling/priority reasoning.
//
// Scoped to CUSTOM tables/dashboards only (source_table_type === 'custom'),
// not the three system tables (projects/properties/entities) or dashboards
// bound to them -- those already have their own, cheaper schema-metadata
// fetch and aren't the slow path this is solving for.

import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { ensureDashboardWidgetsMigrated } from "@/lib/dashboardWidgets/ensureMigrated";
import type { CustomTable } from "./useCustomTables";
import type { CustomTableField } from "./useCustomTable";
import type { CompanyDashboard } from "./useDashboardData";

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

// Call once, right after the company/user identity resolves (CompanyContext).
// Delayed via setTimeout rather than fired immediately or via
// requestIdleCallback -- deliberately gives the CURRENT page's own loading
// (which the user is actually waiting on) a head start, and a plain delay
// is predictable across browsers (requestIdleCallback isn't implemented in
// Safari). The `started` guard is mainly for React Strict Mode's
// double-invoke in dev; in production CompanyProvider only mounts once per
// session anyway.
export function startBackgroundShellPrefetch(): void {
  if (started) return;
  started = true;
  setTimeout(() => {
    prefetchAllShells().catch(() => {});
  }, 2500);
}
