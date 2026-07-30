"use client";

// Two warm-up jobs, both BLOCKING bootstrap steps -- called and awaited
// directly from lib/companyBootstrap.ts as part of the sequence AppLoader
// gates the splash on, so neither system nor custom tables/dashboards are
// still cold the moment it dismisses:
//
// - warmSystemTableShells() -- schema/customFields/relatedFields for the
//   four system tables (properties/entities/projects/tasks). Exactly 4
//   known tables.
//
// - warmCustomTableShells() -- schema/fields for every custom table
//   (company_tables) and every custom dashboard's source table
//   (source_table_type === 'custom'), an open-ended, per-company list that
//   could be dozens of tables. Used to be fire-and-forget background work
//   (a user's first visit to a custom table/dashboard just paid a cold
//   load whenever it happened) -- now awaited up front instead, so a
//   custom table isn't the one thing still loading after everything else
//   already feels instant. Parallel across tables/dashboards (not the
//   sequential loop this used to be as idle-time-only work) so the wait is
//   bounded by the slowest single fetch, not their sum; the AppLoader's own
//   ceiling still protects a company with a large table count from a
//   truly slow network.

import { supabase } from "@/lib/supabase";
import { readShellCache, writeShellCache } from "@/lib/shellCache";
import { readCache, writeCache } from "@/lib/queryCache";
import { ensureDashboardWidgetsMigrated } from "@/lib/dashboardWidgets/ensureMigrated";
import { getSchemaMetadata } from "@/lib/services/schemaService";
import { fetchCompanyCustomFields, type CompanyCustomField } from "./useCompanyCustomFields";
import { warmRelatedFields } from "./useRelatedFields";
import { fetchScopedDefaultView } from "./scopedDefaultView";
import { writeCachedScopedView } from "./usePresetTable";
import { savedViewsService, writeCachedDefaultFilters } from "@/lib/services/savedViewsService";
import {
  resolveRelationLabels, type CustomTableField, type CustomTableRecord,
} from "./useCustomTable";
import {
  SYSTEM_TABLE_HIDDEN_COLS, SYSTEM_TABLE_RELATION_MAP, SYSTEM_TABLE_PERSON_LINK_COLS,
} from "@/lib/schema/systemTableRelations";
import {
  SYSTEM_TABLE_NAMES as DASHBOARD_SYSTEM_TABLE_NAMES, systemTableShellKey, dashboardSourceRowsKey,
  type SystemTableName,
} from "./useSystemTableAsCustomTable";
import type { CustomTable } from "./useCustomTables";
import type { CompanyDashboard } from "./useDashboardData";
import { publicTasksCacheKey } from "@/components/public/PublicTasksContent";
import { staffClientUpdateCacheKey } from "@/components/public/PublicClientUpdateContent";

const SYSTEM_TABLES = ['properties', 'entities', 'projects', 'tasks'] as const;

async function prefetchSystemTableShell(tableName: string, companyId: string | null): Promise<void> {
  await Promise.all([
    getSchemaMetadata(tableName, companyId).catch(() => {}),
    companyId ? fetchCompanyCustomFields(companyId, tableName).catch(() => {}) : Promise.resolve(),
    companyId ? warmRelatedFields(tableName, companyId).catch(() => {}) : Promise.resolve(),
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

// warmSystemTableShells/startSystemTableRowPrefetch above cover the SCHEMA
// and ROW data a system table needs to render -- not the per-viewer column
// layout/sort (usePresetTable.ts's scoped-view cache) or the implicit
// default-filters slot (GenericMasterTable.tsx's cache, via
// savedViewsService). Without this, those still did a real, blocking-
// feeling fetch on first landing even though everything else about the
// table was already warm -- exactly the "shouldn't be any load at all
// once the main screen appears" gap. Custom tables aren't covered here:
// they don't have a filters feature yet (see CustomTableMasterPage.tsx's
// own NO_FILTERS comment), and unlike the 4 system tables a company can
// have dozens of them, so their column layout stays warmed lazily by
// usePresetTable.ts itself rather than paying for all of them up front.
async function warmTableViewConfig(
  tableName: string,
  companyId: string,
  userId: string | null,
  myTeamIds: string[] | undefined,
): Promise<void> {
  await Promise.all([
    fetchScopedDefaultView(companyId, tableName, userId, myTeamIds)
      .then(view => writeCachedScopedView(companyId, tableName, view))
      .catch(() => {}),
    userId
      ? savedViewsService.getDefaultFilters(userId, companyId, tableName)
          .then(filters => writeCachedDefaultFilters(companyId, userId, tableName, filters))
          .catch(() => {})
      : Promise.resolve(),
  ]);
}

export async function warmSystemTableViewConfig(
  companyId: string | null,
  userId: string | null,
  myTeamIds?: string[],
): Promise<void> {
  if (!companyId) return;
  await Promise.all(SYSTEM_TABLES.map(t => warmTableViewConfig(t, companyId, userId, myTeamIds)));
}

// Relation-type custom field values hold a raw linked record id -- resolved
// to a display name here the same way GenericMasterTable.tsx's fetchItems
// does, so a custom field like a "Linked Entity" column doesn't seed the
// cache with a raw uuid that then visibly swaps to a name once the real
// fetch corrects it. Duplicated from GenericMasterTable.tsx rather than
// imported for the same reason prefetchTableFields below duplicates its
// shell-key helpers -- this file stays a standalone background-fetch
// module, no imports FROM component internals.
const RELATION_TARGET_TABLES: Record<string, { table: string; nameColumn: string }> = {
  entity: { table: 'entities', nameColumn: 'name' },
  property: { table: 'properties', nameColumn: 'street_address' },
  project: { table: 'projects', nameColumn: 'name' },
};

// See GenericMasterTable.tsx's matching UUID_RE for why the relation lookup
// below filters to these before its `.in('id', ...)`.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Values are looked up by field_id alone (scoped to this table's custom
// fields; RLS scopes to this company) rather than by record_id, matching
// GenericMasterTable.tsx's own fetchCustomFields -- see its comment for why
// paging with .range() rather than a single unbounded select matters here.
async function fetchCustomFieldValues(fields: CompanyCustomField[]): Promise<Record<string, Record<string, any>>> {
  const fieldIds = fields.map(f => f.id);
  if (!fieldIds.length) return {};
  const PAGE_SIZE = 1000;
  const allValues: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: page } = await supabase
      .from('company_custom_field_values')
      .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
      .in('field_id', fieldIds)
      .range(from, from + PAGE_SIZE - 1);
    if (!page?.length) break;
    allValues.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  const byRecord: Record<string, Record<string, any>> = {};
  allValues.forEach(v => {
    if (!byRecord[v.record_id]) byRecord[v.record_id] = {};
    // value_record_id checked FIRST -- see GenericMasterTable.tsx's matching
    // fetchCustomFields comment for why (lib/ai/actions.ts's
    // insertCustomFieldValues writes both columns for entity fields it
    // creates, and checking value_text first would pick up that plain
    // display name instead of the real id).
    byRecord[v.record_id][v.field_id] =
      v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean;
  });

  const relationFields = fields.filter(f => f.field_type in RELATION_TARGET_TABLES);
  await Promise.all(relationFields.map(async field => {
    const { table, nameColumn } = RELATION_TARGET_TABLES[field.field_type];
    // Filtered to well-formed uuids -- see GenericMasterTable.tsx's matching
    // fetchCustomFields comment for why a value_text-only "entity" field
    // value (never actually linked to a real record) would otherwise 400
    // this whole batched `.in('id', ...)`, blanking every OTHER record's
    // value for this column too, not just the bad one.
    const linkedIds = [...new Set(Object.values(byRecord).map(v => v[field.id]).filter(Boolean))]
      .filter(id => UUID_RE.test(id));
    if (!linkedIds.length) return;
    const { data: linked } = await supabase.from(table).select(`id, ${nameColumn}`).in('id', linkedIds);
    const nameById = new Map((linked || []).map((r: any) => [r.id, r[nameColumn]]));
    for (const recordId of Object.keys(byRecord)) {
      const rawId = byRecord[recordId][field.id];
      if (rawId) byRecord[recordId][field.id] = nameById.get(rawId) || '';
    }
  }));

  return byRecord;
}

// warmSystemTableShells above only covers schema/customFields/relatedFields
// -- the metadata GenericMasterTable needs to RENDER a table -- not the row
// data itself. Without this, a session's first visit to whichever of the 4
// system tables the user *didn't* land on always hit usePresetTable's cold
// "blocking fetch" path (nk_cache_rows_<companyId>_<table> empty), paying a
// real ~1s network round trip in full view of a skeleton, exactly the "still
// not faster" gap this warms away.
//
// Custom field values ARE merged in (unlike an earlier version of this
// function, which seeded a bare `select('*')`) -- seeding without them
// meant any custom-field column (e.g. a "Matter Number" field on the
// projects table) visibly painted blank on first load, then jumped to its
// real value ~1-2s later once the real fetchItems background-refresh
// corrected it. Junction-backed relation columns (a table's own FK-in-a-
// separate-table links) are still NOT reproduced here, same trade-off as
// before for the same reason -- see warmCustomTableShells' doc comment
// above for the general "duplicating query-building logic outside React
// is a much larger and riskier change" reasoning; those remain a coarser
// seed corrected by the real fetch, same as before this fix, just no
// longer true of plain custom fields (the common case this was reported
// against).
// Skips any table whose row cache already has real data (e.g. the table the
// user landed on already warmed it for real) so this never clobbers a fresher
// cache with this coarser shape.
async function warmSystemTableRows(tableName: string, companyId: string): Promise<void> {
  const cacheKey = `rows_${companyId}_${tableName}`;
  if (readCache(cacheKey)) return;
  try {
    const fields = await fetchCompanyCustomFields(companyId, tableName);
    const [{ data }, byRecord] = await Promise.all([
      supabase.from(tableName).select('*').is('deleted_at', null),
      fetchCustomFieldValues(fields),
    ]);
    if (!data) return;
    const items = fields.length
      ? data.map((item: any) => ({ ...item, __customFields: byRecord[item.id] || {} }))
      : data;
    writeCache(cacheKey, items);
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
//
// Scoped by companyId -- a slug is only unique WITHIN a company (two
// different companies can each have their own "time-fee-entries" custom
// table), and unlike lib/services/schemaService.ts's system-table cache
// (already companyId-scoped), this used to key purely by slug. That meant
// switching active company (components/Sidebar.tsx's handleSwitchCompany,
// which reloads the page but only clears the system-table schema cache, not
// this one) left a previous company's table/dashboard shells sitting under
// the same key the new company's lookups would read -- wrong tableDef/
// fields silently served until something else happened to overwrite that
// exact slug for the new company.
export const tableShellKey = (companyId: string, slug: string) => `table:${companyId}:${slug}`;
export const dashboardShellKey = (companyId: string, slug: string) => `dashboard:${companyId}:${slug}`;

interface CachedTableShell { tableDef: CustomTable; fields: CustomTableField[] }
// cachedAt matches useDashboardData.ts's own CachedDashboardShell shape --
// that hook's DASHBOARD_CONFIG_TTL_MS check reads it to decide whether a
// cache hit can skip a live re-fetch entirely, so a warmed-but-not-yet-
// visited dashboard needs a real timestamp here too, not just the fields.
interface CachedDashboardShell { dashboard: CompanyDashboard; sourceTableDef: CustomTable | null; cachedAt: number }

async function prefetchTableFields(tbl: CustomTable, companyId: string): Promise<void> {
  if (readShellCache<CachedTableShell>(tableShellKey(companyId, tbl.slug))) return;
  const { data: flds } = await supabase
    .from('company_table_fields')
    .select('*')
    .eq('table_id', tbl.id)
    .is('deleted_at', null)
    .order('display_order');
  writeShellCache(tableShellKey(companyId, tbl.slug), { tableDef: tbl, fields: (flds || []) as CustomTableField[] });
}

// Companion to warmSystemTableRows above -- same "seed corrected by the real
// fetch" trade-off (see that function's own doc comment), for a company's
// custom tables instead of the 4 system tables. 'table_relation' (custom-
// table-to-custom-table) relation fields are left as their raw linked-record
// id here rather than resolved to a display label -- doing so needs an
// extra lookup of the target table's own display field first, a meaningfully
// bigger duplicate of useCustomTable.ts's resolveRelationLabels than is
// worth carrying in this standalone module just for a seed corrected within
// moments of the real page mounting anyway. entity/property/project
// relations (the same 3 system-table targets warmSystemTableRows already
// resolves) still get real labels here, reusing RELATION_TARGET_TABLES as-is.
async function warmCustomTableRows(tbl: CustomTable, companyId: string): Promise<void> {
  const cacheKey = `rows_${companyId}_${tbl.slug}`;
  if (readCache(cacheKey)) return;
  try {
    const { data: flds } = await supabase
      .from('company_table_fields').select('*')
      .eq('table_id', tbl.id).is('deleted_at', null).order('display_order');
    const fieldList = (flds || []) as CustomTableField[];
    const fieldMap = new Map(fieldList.map(f => [f.id, f]));

    const { data: recs } = await supabase
      .from('company_table_records')
      .select('*, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)')
      .eq('table_id', tbl.id).is('deleted_at', null)
      .order('created_at', { ascending: false });

    const records = (recs || []).map((rec: any) => {
      const values: Record<string, any> = {};
      (rec.values || []).forEach((v: any) => {
        const field = fieldMap.get(v.field_id);
        if (!field) return;
        // value_record_id checked FIRST -- see GenericMasterTable.tsx's
        // fetchCustomFields for why.
        values[field.field_key] = v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
      });
      return { id: rec.id, table_id: rec.table_id, created_at: rec.created_at, values, displayValues: {} as Record<string, string> };
    });

    const multiFields = fieldList.filter(f => f.allow_multiple);
    if (multiFields.length) {
      const { data: links } = await supabase
        .from('company_table_value_links')
        .select('record_id, field_id, value_record_id')
        .in('field_id', multiFields.map(f => f.id));
      const byRecord = new Map<string, Record<string, string[]>>();
      (links || []).forEach(l => {
        const field = fieldMap.get(l.field_id);
        if (!field) return;
        if (!byRecord.has(l.record_id)) byRecord.set(l.record_id, {});
        const rec = byRecord.get(l.record_id)!;
        (rec[field.field_key] ||= []).push(l.value_record_id);
      });
      for (const rec of records) {
        for (const field of multiFields) {
          rec.values[field.field_key] = byRecord.get(rec.id)?.[field.field_key] || [];
        }
      }
    }

    const relationFields = fieldList.filter(f => f.field_type in RELATION_TARGET_TABLES);
    await Promise.all(relationFields.map(async field => {
      const { table, nameColumn } = RELATION_TARGET_TABLES[field.field_type];
      const linkedIds = [...new Set(records.map(r => r.values[field.field_key]).filter(Boolean))]
        .filter(id => UUID_RE.test(id));
      if (!linkedIds.length) return;
      const { data: linked } = await supabase.from(table).select(`id, ${nameColumn}`).in('id', linkedIds);
      const nameById = new Map((linked || []).map((r: any) => [r.id, r[nameColumn]]));
      for (const rec of records) {
        const rawId = rec.values[field.field_key];
        if (rawId) rec.displayValues[field.field_key] = nameById.get(rawId) || '';
      }
    }));

    writeCache(cacheKey, records);
  } catch {}
}

// Companion to warmSystemTableViewConfig -- same idea (warm the raw scoped
// column/sort view and the implicit default-filters slot) for a custom
// table instead of one of the 4 system tables.
async function warmCustomTableViewConfig(
  tbl: CustomTable,
  companyId: string,
  userId: string | null,
  myTeamIds: string[] | undefined,
): Promise<void> {
  await Promise.all([
    fetchScopedDefaultView(companyId, tbl.slug, userId, myTeamIds)
      .then(view => writeCachedScopedView(companyId, tbl.slug, view))
      .catch(() => {}),
    userId
      ? savedViewsService.getDefaultFilters(userId, companyId, tbl.slug)
          .then(filters => writeCachedDefaultFilters(companyId, userId, tbl.slug, filters))
          .catch(() => {})
      : Promise.resolve(),
  ]);
}

// lib/hooks/useSystemTableAsCustomTable.ts's dashboard-widget adapter for a
// dashboard sourced directly from Properties/Entities/Projects (not a
// company_tables row) -- unlike every OTHER source kind, it has its own,
// entirely separate fields/records fetch (a system table needs to be
// reshaped into the CustomTableField/CustomTableRecord dashboard-widget
// shape that hook's own top comment explains), so warming it needs its own
// warmer here too rather than being covered by warmSystemTableShells or
// warmCustomTableRows above. Field derivation duplicated from that hook's
// own load() (not imported -- same standalone-module reasoning as the rest
// of this file) except resolveRelationLabels, which is plain, non-hook code
// already shared with useCustomTable.ts's own load().
const DASHBOARD_RELATION_FIELD_TYPE_BY_TABLE: Record<string, 'project' | 'property' | 'entity'> = {
  projects: 'project', properties: 'property', entities: 'entity',
};
function deriveDashboardNativeFieldType(dataType: string): string {
  if (dataType === 'boolean') return 'boolean';
  if (dataType === 'date' || dataType?.includes('timestamp')) return 'date';
  if (['numeric', 'integer', 'bigint', 'smallint', 'real', 'double precision'].includes(dataType)) return 'number';
  return 'text';
}
async function warmDashboardSourceSystemTable(tableName: SystemTableName, companyId: string): Promise<void> {
  const rowsKey = dashboardSourceRowsKey(tableName, companyId);
  if (readCache(rowsKey)) return;
  try {
    const [cols, { data: customFields }] = await Promise.all([
      getSchemaMetadata(tableName, companyId),
      supabase.from('company_custom_fields').select('*').eq('table_name', tableName).is('deleted_at', null).order('display_order'),
    ]);

    let order = 0;
    const nativeFields: CustomTableField[] = (cols || [])
      .filter((c: any) => ['data', 'relation'].includes(c.category) && !c.is_hidden && !SYSTEM_TABLE_HIDDEN_COLS.includes(c.column_name))
      .map((c: any) => {
        const relTable = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.table || c.relation_table || undefined;
        const relDisplayCol = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.displayCol || c.relation_display_column || undefined;
        const relationFieldType = relTable ? DASHBOARD_RELATION_FIELD_TYPE_BY_TABLE[relTable] : undefined;
        const junction = SYSTEM_TABLE_RELATION_MAP[c.column_name]?.junction;
        const isPersonLink = SYSTEM_TABLE_PERSON_LINK_COLS.includes(c.column_name);
        const field_type = relationFieldType || (isPersonLink ? 'text' : deriveDashboardNativeFieldType(c.data_type));
        return {
          id: c.column_name, table_id: tableName, field_key: c.column_name,
          label: c.label || c.column_name.replace(/_/g, ' '), field_type,
          select_options: null, default_value: null, linked_table_id: null,
          linked_system_table: relationFieldType ? relTable! : null,
          linked_display_field: relationFieldType ? relDisplayCol! : null,
          linked_display_field_2: null, linked_search_field_keys: null,
          linked_filter_column: null, linked_filter_value: null,
          is_required: !c.is_nullable, is_unique: false, show_in_table: true,
          display_order: order++, section_name: null, help_text: null,
          formula_type: null, formula_field_a_id: null, formula_field_b_id: null,
          formula_percent: null, formula_relation_field_id: null,
          auto_number_prefix: null, allow_multiple: !!junction, field_source: 'native',
        } as CustomTableField;
      });

    const cfFields: CustomTableField[] = (customFields || []).map((cf: any) => ({
      id: cf.id, table_id: tableName, field_key: cf.id, label: cf.label, field_type: cf.field_type,
      select_options: cf.select_options || null, default_value: cf.default_value ?? null,
      linked_table_id: null, linked_system_table: cf.linked_table || null,
      linked_display_field: cf.linked_display_column || null, linked_display_field_2: null,
      linked_search_field_keys: null, linked_filter_column: null, linked_filter_value: null,
      is_required: !!cf.is_required, is_unique: !!cf.is_unique, show_in_table: cf.show_in_table ?? true,
      display_order: order++, section_name: cf.section_name || null, help_text: cf.help_text || null,
      formula_type: null, formula_field_a_id: null, formula_field_b_id: null,
      formula_percent: null, formula_relation_field_id: null, auto_number_prefix: null,
      allow_multiple: false, field_source: 'custom',
    } as CustomTableField));

    const fieldList = [...nativeFields, ...cfFields];
    writeShellCache(systemTableShellKey(tableName, companyId), fieldList);

    const { data: baseRows } = await supabase.from(tableName).select('*').is('deleted_at', null);

    const multiFields = nativeFields.filter(f => f.allow_multiple);
    const multiValuesByRecord = new Map<string, Record<string, string[]>>();
    if (multiFields.length) {
      await Promise.all(multiFields.map(async f => {
        const junction = SYSTEM_TABLE_RELATION_MAP[f.field_key]?.junction;
        if (!junction) return;
        const { data: links } = await supabase.from(junction.table).select(`${junction.sourceCol}, ${junction.targetCol}`);
        (links || []).forEach((row: any) => {
          const recId = row[junction.sourceCol];
          if (!multiValuesByRecord.has(recId)) multiValuesByRecord.set(recId, {});
          const rec = multiValuesByRecord.get(recId)!;
          (rec[f.field_key] ||= []).push(row[junction.targetCol]);
        });
      }));
    }

    const cfIds = cfFields.map(f => f.id);
    const cfValuesByRecord = new Map<string, Record<string, any>>();
    if (cfIds.length) {
      const { data: cfValues } = await supabase
        .from('company_custom_field_values')
        .select('record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id')
        .in('field_id', cfIds);
      (cfValues || []).forEach(v => {
        if (!cfValuesByRecord.has(v.record_id)) cfValuesByRecord.set(v.record_id, {});
        // value_record_id checked FIRST -- see GenericMasterTable.tsx's
        // fetchCustomFields for why.
        cfValuesByRecord.get(v.record_id)![v.field_id] = v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
      });
    }

    const hydratedRecords: CustomTableRecord[] = (baseRows || []).map((row: any) => {
      const values: Record<string, any> = {};
      for (const f of nativeFields) {
        values[f.field_key] = f.allow_multiple
          ? (multiValuesByRecord.get(row.id)?.[f.field_key] || [])
          : (row[f.field_key] ?? null);
      }
      Object.assign(values, cfValuesByRecord.get(row.id) || {});
      return { id: row.id, table_id: tableName, created_at: row.created_at || row.updated_at || new Date().toISOString(), values, displayValues: {} };
    });

    await resolveRelationLabels(fieldList, hydratedRecords);
    writeCache(rowsKey, hydratedRecords);
  } catch {}
}

// A public_task_page/public_client_update_page widget's actual content
// (components/public/PublicTasksContent.tsx / PublicClientUpdateContent.tsx)
// comes from its own API route, not a direct client-side Supabase query --
// unlike every other widget, nothing above touches it at all, so a
// dashboard with one of these embedded still paid a fully cold fetch on
// open even once everything else felt instant. Fetched here under the
// current viewer's own bootstrap session, so authorization comes out
// identical to a real open (a widget scoped to someone else -- e.g. a
// 'self' task page -- just 404s/403s here same as it would for them, and is
// silently left uncached rather than surfacing an error this early).
async function warmPublicTaskPage(pageId: string): Promise<void> {
  if (readCache(publicTasksCacheKey(pageId))) return;
  try {
    const res = await fetch(`/api/public-tasks/${pageId}`);
    if (!res.ok) return;
    writeCache(publicTasksCacheKey(pageId), await res.json());
  } catch {}
}
async function warmStaffClientUpdatePage(slug: string): Promise<void> {
  if (readCache(staffClientUpdateCacheKey(slug))) return;
  try {
    const res = await fetch(`/api/client-update-pages/by-slug/${slug}`);
    if (!res.ok) return;
    writeCache(staffClientUpdateCacheKey(slug), await res.json());
  } catch {}
}

// Scans every dashboard's (already-migrated) widgets for these two types --
// deduped, since the same page/board could in principle be embedded on more
// than one dashboard -- and warms each exactly once. Widgets that haven't
// created their page/board yet (config.pageId/slug still null -- see
// PublicTaskPageWidget/PublicClientUpdatePageWidget's own doc comments)
// simply contribute nothing here.
function warmEmbeddedPublicPages(dashboardList: CompanyDashboard[]): Promise<void> {
  const pageIds = new Set<string>();
  const slugs = new Set<string>();
  for (const dash of dashboardList) {
    for (const w of dash.widgets || []) {
      if (w.type === 'public_task_page' && w.config.pageId) pageIds.add(w.config.pageId);
      else if (w.type === 'public_client_update_page' && w.config.slug) slugs.add(w.config.slug);
    }
  }
  return Promise.all([
    ...[...pageIds].map(id => warmPublicTaskPage(id).catch(() => {})),
    ...[...slugs].map(slug => warmStaffClientUpdatePage(slug).catch(() => {})),
  ]).then(() => undefined);
}

// Parallel across both tables and dashboards -- this is now a blocking
// bootstrap step (see this file's top doc comment), so the goal is the
// opposite of the sequential loop this used to be: bound the wait by the
// single slowest fetch, not their sum, the same trade-off
// warmSystemTableShells already makes across its 4 tables.
async function prefetchAllShells(
  companyId: string,
  userId: string | null,
  myTeamIds: string[] | undefined,
): Promise<void> {
  const { data: tables } = await supabase
    .from('company_tables').select('*').is('deleted_at', null).order('display_order');
  const tableList = (tables || []) as CustomTable[];
  const tableById = new Map(tableList.map(t => [t.id, t]));

  const { data: dashboards } = await supabase
    .from('company_dashboards').select('*').is('deleted_at', null).order('display_order');
  const dashboardList = (dashboards || []) as (CompanyDashboard & { id: string; widgets_migrated_at: string | null })[];

  await Promise.all([
    ...tableList.map(tbl => prefetchTableFields(tbl, companyId).catch(() => {})),
    // Rows + column/sort config + default filters -- same "nothing left to
    // load once the main screen appears" guarantee warmSystemTableShells/
    // warmSystemTableViewConfig already give the 4 system tables, extended
    // to every custom table too.
    ...tableList.map(tbl => warmCustomTableRows(tbl, companyId).catch(() => {})),
    ...tableList.map(tbl => warmCustomTableViewConfig(tbl, companyId, userId, myTeamIds).catch(() => {})),
    ...dashboardList.map(async (dash) => {
      if (readShellCache<CachedDashboardShell>(dashboardShellKey(companyId, dash.slug))) return;
      try {
        // Same one-time, idempotent migration useDashboardData.ts's own
        // effect runs on a real open -- doing it here just means it's
        // already done by the time the user gets there. Warmed for every
        // source kind (custom/system/none), not just 'custom' -- this used
        // to skip system-table-sourced and source-less dashboards entirely,
        // so useDashboardData.ts's own dashboardShellKey cache never got a
        // chance to warm for those.
        if (!dash.widgets_migrated_at) {
          dash.widgets = await ensureDashboardWidgetsMigrated(dash);
        }
        const sourceTableDef = dash.source_table_type === 'custom' && dash.source_table_id
          ? tableById.get(dash.source_table_id) ?? null
          : null;
        writeShellCache(dashboardShellKey(companyId, dash.slug), { dashboard: dash, sourceTableDef, cachedAt: Date.now() });
        if (sourceTableDef) await prefetchTableFields(sourceTableDef, companyId);
      } catch {}
    }),
    // Content for a dashboard sourced directly from Properties/Entities/
    // Projects (not a company_tables row) -- see warmDashboardSourceSystemTable's
    // own doc comment for why this needs an entirely separate warmer.
    // Deduped to one warm per distinct system table actually used as a
    // source, not once per dashboard.
    ...DASHBOARD_SYSTEM_TABLE_NAMES
      .filter(name => dashboardList.some(d => d.source_table_type === name))
      .map(name => warmDashboardSourceSystemTable(name, companyId).catch(() => {})),
  ]);

  // Run after the above (not folded into that same Promise.all) --
  // dashboardList's widgets are only guaranteed fully migrated once the
  // dashboard-shell loop's own await finishes; scanning for embedded
  // public-page widgets any earlier could race a legacy, not-yet-migrated
  // dashboard and miss whatever only exists post-conversion.
  await warmEmbeddedPublicPages(dashboardList);
}

let started = false;
let inFlight: Promise<void> | null = null;

// Call once, right after the company/user identity resolves (CompanyContext
// / lib/companyBootstrap.ts), and awaited by it -- see this file's top doc
// comment for why this is a blocking bootstrap step rather than
// fire-and-forget. The `started`/`inFlight` guards are mainly for React
// Strict Mode's double-invoke in dev (so a second caller awaits the same
// promise instead of re-fetching); in production CompanyProvider only
// mounts once per session anyway.
export function warmCustomTableShells(
  companyId: string | null,
  userId: string | null,
  myTeamIds?: string[],
): Promise<void> {
  if (!companyId) return Promise.resolve();
  if (inFlight) return inFlight;
  if (started) return Promise.resolve();
  started = true;
  inFlight = prefetchAllShells(companyId, userId, myTeamIds).catch(() => {}).then(() => { inFlight = null; });
  return inFlight;
}
