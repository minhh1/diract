// lib/customTableAdmin.ts
// Minimal server-side (admin/service-role client) reader/writer for the
// custom-table system (company_tables/company_table_fields/
// company_table_records/company_table_values/company_table_value_links).
// The existing lib/services/customTableService.ts covers this too, but it's
// browser-only (hardcodes the client-side `supabase` singleton) and carries
// ledger/formula/rollup/uniqueness machinery none of the Finance Model v2
// tables need (they're flat, no formulas, no ledger). This is deliberately
// simpler -- just enough to read/write rows for a known table's fields from
// an API route, matching the `admin` client-as-first-param convention used
// throughout lib/xero/, lib/financeModel/, etc.
import { isRelationType, getValueColumn } from "@/lib/schema/fieldCapabilities";

export interface FieldDef {
  id: string;
  field_key: string;
  field_type: string;
  allow_multiple: boolean;
}

export interface CustomTableRef {
  tableId: string;
  companyId: string;
  fields: FieldDef[];
}

export async function getCustomTable(admin: any, companyId: string, slug: string): Promise<CustomTableRef | null> {
  const { data: table } = await admin
    .from("company_tables")
    .select("id")
    .eq("company_id", companyId)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!table) return null;

  const { data: fields } = await admin
    .from("company_table_fields")
    .select("id, field_key, field_type, allow_multiple")
    .eq("table_id", table.id)
    .is("deleted_at", null);

  return { tableId: table.id, companyId, fields: (fields || []) as FieldDef[] };
}

function fieldByKey(fields: FieldDef[], key: string): FieldDef | undefined {
  return fields.find(f => f.field_key === key);
}

// Loads every field value for a set of record ids and assembles them into
// { id, [field_key]: value } rows -- single-value relation/scalar fields
// come from company_table_values; allow_multiple relation fields come from
// company_table_value_links (a field only ever has rows in one store or the
// other, same split lib/services/customTableService.ts's getCurrentValues
// relies on).
async function hydrateRows(admin: any, recordIds: string[], fields: FieldDef[]): Promise<Record<string, any>[]> {
  if (!recordIds.length) return [];

  const { data: values } = await admin
    .from("company_table_values")
    .select("record_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id")
    .in("record_id", recordIds);

  const multiFields = fields.filter(f => f.allow_multiple);
  let links: any[] = [];
  if (multiFields.length) {
    const { data } = await admin
      .from("company_table_value_links")
      .select("record_id, field_id, value_record_id")
      .in("record_id", recordIds)
      .in("field_id", multiFields.map(f => f.id));
    links = data || [];
  }

  const fieldById = new Map(fields.map(f => [f.id, f]));
  const rowsById = new Map<string, Record<string, any>>();
  for (const id of recordIds) rowsById.set(id, { id });

  for (const v of values || []) {
    const field = fieldById.get(v.field_id);
    if (!field) continue;
    const row = rowsById.get(v.record_id);
    if (!row) continue;
    row[field.field_key] = v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null;
  }
  for (const f of multiFields) for (const row of rowsById.values()) row[f.field_key] = [];
  for (const l of links) {
    const field = fieldById.get(l.field_id);
    const row = field && rowsById.get(l.record_id);
    if (field && row) row[field.field_key].push(l.value_record_id);
  }

  return recordIds.map(id => rowsById.get(id)!);
}

// Rows where `filterFieldKey` (a single-value relation field, e.g. "project")
// equals `filterValue` (the linked record's id) -- the standard "scoped to
// one parent record" query every Finance Model v2 subtab uses.
export async function listCustomTableRows(
  admin: any, table: CustomTableRef, filterFieldKey: string, filterValue: string
): Promise<Record<string, any>[]> {
  const filterField = fieldByKey(table.fields, filterFieldKey);
  if (!filterField) return [];

  const { data: matches } = await admin
    .from("company_table_values")
    .select("record_id")
    .eq("field_id", filterField.id)
    .eq("value_record_id", filterValue);
  const candidateIds = [...new Set((matches || []).map((m: any) => m.record_id))];
  if (!candidateIds.length) return [];

  const { data: alive } = await admin
    .from("company_table_records")
    .select("id")
    .in("id", candidateIds)
    .is("deleted_at", null);
  const aliveIds = (alive || []).map((r: any) => r.id);
  return hydrateRows(admin, aliveIds, table.fields);
}

export async function listAllCustomTableRows(admin: any, table: CustomTableRef): Promise<Record<string, any>[]> {
  const { data: alive } = await admin
    .from("company_table_records")
    .select("id")
    .eq("table_id", table.tableId)
    .is("deleted_at", null);
  return hydrateRows(admin, (alive || []).map((r: any) => r.id), table.fields);
}

export async function getCustomTableRow(admin: any, table: CustomTableRef, recordId: string): Promise<Record<string, any> | null> {
  const rows = await hydrateRows(admin, [recordId], table.fields);
  return rows[0] || null;
}

export async function createCustomTableRow(
  admin: any, table: CustomTableRef, userId: string | null, values: Record<string, any>
): Promise<string> {
  const { data: record, error } = await admin
    .from("company_table_records")
    .insert({ table_id: table.tableId, company_id: table.companyId, created_by: userId })
    .select("id")
    .single();
  if (error || !record) throw new Error(error?.message || "Failed to create record");

  await writeValues(admin, table, record.id, values);
  return record.id;
}

export async function updateCustomTableRow(admin: any, table: CustomTableRef, recordId: string, values: Record<string, any>): Promise<void> {
  await admin.from("company_table_records").update({ updated_at: new Date().toISOString() }).eq("id", recordId);
  await writeValues(admin, table, recordId, values);
}

export async function deleteCustomTableRow(admin: any, recordId: string): Promise<void> {
  await admin.from("company_table_records").update({ deleted_at: new Date().toISOString() }).eq("id", recordId);
}

async function writeValues(admin: any, table: CustomTableRef, recordId: string, values: Record<string, any>): Promise<void> {
  const upserts: Record<string, any>[] = [];
  const clearFieldIds: string[] = [];
  const multiWrites: { field: FieldDef; ids: string[] }[] = [];

  for (const [key, value] of Object.entries(values)) {
    const field = fieldByKey(table.fields, key);
    if (!field) continue;
    if (field.allow_multiple) {
      if (Array.isArray(value)) multiWrites.push({ field, ids: value.filter(Boolean) });
      continue;
    }
    if (value === undefined || value === null || value === "") {
      clearFieldIds.push(field.id);
      continue;
    }
    upserts.push({ company_id: table.companyId, table_id: table.tableId, record_id: recordId, field_id: field.id, [getValueColumn(field.field_type)]: value });
  }

  if (upserts.length) {
    await admin.from("company_table_values").upsert(upserts, { onConflict: "record_id,field_id" });
  }
  if (clearFieldIds.length) {
    await admin.from("company_table_values").delete().eq("record_id", recordId).in("field_id", clearFieldIds);
  }
  for (const { field, ids } of multiWrites) {
    await admin.from("company_table_value_links").delete().eq("record_id", recordId).eq("field_id", field.id);
    if (ids.length) {
      await admin.from("company_table_value_links").insert(ids.map(id => ({ company_id: table.companyId, record_id: recordId, field_id: field.id, value_record_id: id })));
    }
  }
}

export { isRelationType };
