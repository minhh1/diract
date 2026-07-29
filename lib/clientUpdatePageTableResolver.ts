// lib/clientUpdatePageTableResolver.ts
// The one place that knows how to resolve fields/records/values for
// WHATEVER table a Detailed Table Page ("Client Update Page" internally --
// see components/settings/ClientUpdatePagesTab.tsx) is built on --
// `client_update_pages.base_table` / `client_update_page_items.record_table`
// is either a system table name (SYSTEM_TABLES below) or a company_tables.id
// cast to text, same convention record_tabs.record_table / company_record_
// tab_defaults.record_table already use elsewhere in this codebase (see
// lib/dashboardWidgets/defaultRecordDashboardTabs.ts). No FK on record_id --
// it's polymorphic, same tradeoff already accepted for company_default_
// scopes.resource_id.
//
// Deliberately does NOT absorb the property-linked-field or related_entity
// logic in lib/clientUpdatePageDetail.ts (a genuinely narrower, projects-
// only relation hop) or the auto_fed/editable_field_keys logic in
// app/api/client-update-pages/[id]/values/route.ts (a different page_kind
// axis entirely) -- those stay their own branches, unchanged.

export const SYSTEM_TABLES = ["projects", "entities", "properties"] as const;
export type SystemTable = (typeof SYSTEM_TABLES)[number];

export function isSystemTable(recordTable: string): recordTable is SystemTable {
  return (SYSTEM_TABLES as readonly string[]).includes(recordTable);
}

// The column whose value stands in as a record's display name -- every
// system table in this app has one of these two shapes today.
const DISPLAY_COLUMN: Record<SystemTable, string> = {
  projects: "name",
  entities: "name",
  properties: "street_address",
};

export interface ResolvedField {
  field_key: string;
  label: string;
}

// Base + custom fields available on `recordTable`, for the creation-time
// field picker and for resolving what a 'base'/'custom' field_source
// actually points at.
export async function resolveTableFields(
  admin: any,
  companyId: string,
  recordTable: string
): Promise<{ base: ResolvedField[]; custom: ResolvedField[] }> {
  if (isSystemTable(recordTable)) {
    const { data: schemaCols } = await admin.rpc("get_schema_metadata", {
      target_table: recordTable,
      p_company_id: companyId,
    });
    // category === 'data' && !is_hidden is get_schema_metadata's own
    // signal for "a real, offerable column" -- same filter every other
    // schema-driven field picker in this app uses (e.g.
    // AdminDefaultViewsTab.tsx), rather than a hand-maintained exclude list
    // that would need updating for every new system table.
    const base: ResolvedField[] = (schemaCols || [])
      .filter((c: any) => c.category === "data" && !c.is_hidden)
      .map((c: any) => ({ field_key: c.column_name, label: c.label || c.column_name.replace(/_/g, " ") }));

    const { data: customFields } = await admin
      .from("company_custom_fields")
      .select("id, label")
      .eq("company_id", companyId)
      .eq("table_name", recordTable)
      .is("deleted_at", null)
      .order("display_order");

    return { base, custom: (customFields || []).map((f: any) => ({ field_key: f.id, label: f.label })) };
  }

  // recordTable is a company_tables.id -- its own fields are all this page
  // ever needs, no separate custom-field concept (mirrors the existing
  // custom_table branch's own comment in clientUpdatePageDetail.ts).
  const { data: tableFields } = await admin
    .from("company_table_fields")
    .select("id, label")
    .eq("table_id", recordTable)
    .is("deleted_at", null)
    .order("display_order");

  return { base: (tableFields || []).map((f: any) => ({ field_key: f.id, label: f.label })), custom: [] };
}

// Snapshotted field_type/select_options for a newly-picked field -- used at
// creation time (app/api/client-update-pages/create/route.ts) where there's
// no existing page row yet to load a base_table from.
export async function inferFieldType(
  admin: any,
  companyId: string,
  recordTable: string,
  fieldSource: "base" | "custom",
  fieldKey: string
): Promise<{ fieldType: string; selectOptions: string[] | null }> {
  if (fieldSource === "custom") {
    const { data: cf } = await admin.from("company_custom_fields").select("field_type, select_options").eq("id", fieldKey).maybeSingle();
    if (!cf) return { fieldType: "text", selectOptions: null };
    const fieldType = ["date", "select", "number", "currency", "boolean"].includes(cf.field_type) ? cf.field_type : "text";
    return { fieldType, selectOptions: fieldType === "select" ? cf.select_options : null };
  }
  if (isSystemTable(recordTable)) {
    if (fieldKey === "purchase_price") return { fieldType: "currency", selectOptions: null };
    if (fieldKey === "property_address" || fieldKey === "name") return { fieldType: "text", selectOptions: null };
    const { data: schemaCols } = await admin.rpc("get_schema_metadata", { target_table: recordTable, p_company_id: companyId });
    const col = (schemaCols || []).find((c: any) => c.column_name === fieldKey);
    const fieldType = col?.data_type?.includes("date") ? "date" : ["numeric", "integer"].includes(col?.data_type) ? "number" : col?.data_type === "boolean" ? "boolean" : "text";
    return { fieldType, selectOptions: null };
  }
  const { data: ctf } = await admin.from("company_table_fields").select("field_type").eq("id", fieldKey).maybeSingle();
  const fieldType = ctf && ["date", "select", "number", "currency", "boolean"].includes(ctf.field_type) ? ctf.field_type : "text";
  return { fieldType, selectOptions: null };
}

// id -> raw record row (system table) or a values-shaped stand-in (custom
// table) -- callers read a system-table record's own columns directly
// (record[col]), and a custom-table record's fields via
// resolveFieldValuesBatch instead (there's no single "row" shape to hand
// back generically the way a real Postgres row is for a system table).
export async function resolveRecordsBatch(admin: any, recordTable: string, recordIds: string[]): Promise<Map<string, any>> {
  if (!recordIds.length) return new Map();
  if (isSystemTable(recordTable)) {
    const { data } = await admin.from(recordTable).select("*").in("id", recordIds);
    return new Map((data || []).map((r: any) => [r.id, r]));
  }
  const { data } = await admin.from("company_table_records").select("id").in("id", recordIds);
  return new Map((data || []).map((r: any) => [r.id, r]));
}

// A record's display name -- native `name`/`street_address` column for a
// system table, or its table's own primary_field_key value for a custom
// table (same lookup RelationPicker.tsx already does for relation options).
export async function resolveDisplayNamesBatch(admin: any, recordTable: string, recordIds: string[]): Promise<Map<string, string>> {
  if (!recordIds.length) return new Map();
  if (isSystemTable(recordTable)) {
    const col = DISPLAY_COLUMN[recordTable];
    const { data } = await admin.from(recordTable).select(`id, ${col}`).in("id", recordIds);
    return new Map((data || []).map((r: any) => [r.id, r[col] ?? ""]));
  }
  const { data: table } = await admin.from("company_tables").select("primary_field_key").eq("id", recordTable).maybeSingle();
  const { data: fields } = await admin.from("company_table_fields").select("id, field_key").eq("table_id", recordTable).is("deleted_at", null);
  const primaryField = (fields || []).find((f: any) => f.field_key === table?.primary_field_key) || (fields || [])[0];
  if (!primaryField) return new Map(recordIds.map((id) => [id, ""]));
  const { data: values } = await admin
    .from("company_table_values")
    .select("record_id, value_text, value_number, value_date")
    .eq("field_id", primaryField.id)
    .in("record_id", recordIds);
  return new Map((values || []).map((v: any) => [v.record_id, String(v.value_text ?? v.value_number ?? v.value_date ?? "")]));
}

// Values for 'custom' (system table) or 'base' (custom table) field_source
// fields, keyed "<field_key>:<record_id>" -- consolidates what used to be
// two separate lookups (company_custom_field_values / company_table_values)
// duplicated per base_table branch.
export async function resolveFieldValuesBatch(
  admin: any,
  recordTable: string,
  fieldKeys: string[],
  recordIds: string[]
): Promise<Map<string, any>> {
  if (!fieldKeys.length || !recordIds.length) return new Map();
  const table = isSystemTable(recordTable) ? "company_custom_field_values" : "company_table_values";
  // One row per (field, record) pair, so this can easily exceed PostgREST's
  // default page cap (1000) on a wide/busy table -- e.g. the Irregularities
  // board crossed it at 2752 rows (8 fields x 344 records), which silently
  // truncated the result and rendered roughly half the board blank until
  // this was found live. Pages through in cap-sized chunks rather than
  // assuming everything fits in one response.
  const PAGE_SIZE = 1000;
  const all: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data } = await admin
      .from(table)
      .select("field_id, record_id, value_text, value_number, value_date, value_boolean, value_record_id")
      .in("field_id", fieldKeys)
      .in("record_id", recordIds)
      .range(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return new Map(all.map((v: any) => [`${v.field_id}:${v.record_id}`, v]));
}

export async function writeFieldValue(
  admin: any,
  params: { recordTable: string; recordId: string; field: { field_source: string; field_key: string }; value: any }
): Promise<{ error?: string }> {
  const { recordTable, recordId, field, value } = params;
  if (field.field_source === "base") {
    if (!isSystemTable(recordTable)) return { error: "This table has no separate base columns to edit directly" };
    const { error } = await admin.from(recordTable).update({ [field.field_key]: value }).eq("id", recordId);
    return error ? { error: error.message } : {};
  }
  if (field.field_source === "custom") {
    const table = isSystemTable(recordTable) ? "company_custom_field_values" : "company_table_values";
    const { error } = await admin
      .from(table)
      .upsert({ field_id: field.field_key, record_id: recordId, value_text: value }, { onConflict: "field_id,record_id" });
    return error ? { error: error.message } : {};
  }
  return { error: "Unsupported field source for a generic write" };
}

// Consolidates /api/client-update-pages/matters/search + entities/search
// into one generic lookup, for AddMatterModal.tsx's item picker.
export async function searchRecords(
  admin: any,
  companyId: string,
  recordTable: string,
  query: string
): Promise<{ id: string; name: string }[]> {
  if (isSystemTable(recordTable)) {
    const col = DISPLAY_COLUMN[recordTable];
    const { data } = await admin
      .from(recordTable)
      .select(`id, ${col}`)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .ilike(col, `%${query}%`)
      .order(col)
      .limit(20);
    return (data || []).map((r: any) => ({ id: r.id, name: r[col] ?? "" }));
  }

  const { data: table } = await admin.from("company_tables").select("primary_field_key").eq("id", recordTable).eq("company_id", companyId).maybeSingle();
  if (!table) return [];
  const { data: fields } = await admin.from("company_table_fields").select("id, field_key").eq("table_id", recordTable).is("deleted_at", null);
  const primaryField = (fields || []).find((f: any) => f.field_key === table.primary_field_key) || (fields || [])[0];
  if (!primaryField) return [];

  const { data: matches } = await admin
    .from("company_table_values")
    .select("record_id, value_text")
    .eq("field_id", primaryField.id)
    .ilike("value_text", `%${query}%`)
    .limit(20);
  return (matches || []).map((v: any) => ({ id: v.record_id, name: v.value_text ?? "" }));
}

export async function validateRecordBelongsToCompany(admin: any, companyId: string, recordTable: string, recordId: string): Promise<boolean> {
  if (isSystemTable(recordTable)) {
    const { data } = await admin.from(recordTable).select("id").eq("id", recordId).eq("company_id", companyId).maybeSingle();
    return !!data;
  }
  const { data: table } = await admin.from("company_tables").select("id").eq("id", recordTable).eq("company_id", companyId).maybeSingle();
  if (!table) return false;
  const { data: record } = await admin.from("company_table_records").select("id").eq("id", recordId).eq("table_id", recordTable).maybeSingle();
  return !!record;
}
