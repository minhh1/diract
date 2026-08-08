// app/api/calendar/date-sources/fields/route.ts
// Every date-type field available to point the calendar at: custom tables'
// own date fields (company_table_fields, field_type='date') and the three
// system tables' custom date fields (company_custom_fields, same
// field_type filter, keyed by table_name instead of table_id -- see
// company_custom_fields' own duality). Also includes tasks.due_date, the
// one native (not-a-custom-field) column worth exposing here -- see
// 20260808200500_calendar_date_sources.sql's own comment on why that needs
// a separate native_field_key path instead of a field_id.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const SYSTEM_TABLES: { table_name: string; label: string }[] = [
  { table_name: "projects", label: "Projects" },
  { table_name: "tasks", label: "Tasks" },
  { table_name: "entities", label: "Entities" },
];

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const [{ data: customTables }, { data: customTableFields }, { data: systemCustomFields }] = await Promise.all([
    admin.from("company_tables").select("id, name").eq("company_id", companyId).is("deleted_at", null).order("name"),
    admin.from("company_table_fields").select("id, table_id, field_key, label")
      .eq("company_id", companyId).eq("field_type", "date").is("deleted_at", null),
    admin.from("company_custom_fields").select("id, table_name, field_key, label")
      .eq("company_id", companyId).eq("field_type", "date"),
  ]);

  const customTableGroups = (customTables ?? []).map(t => ({
    table_id: t.id, table_name: null as string | null, label: t.name,
    fields: (customTableFields ?? [])
      .filter(f => f.table_id === t.id)
      .map(f => ({ field_id: f.id, native_field_key: null as string | null, label: f.label })),
  })).filter(g => g.fields.length > 0);

  const systemGroups = SYSTEM_TABLES.map(t => {
    const fields = (systemCustomFields ?? [])
      .filter(f => f.table_name === t.table_name)
      .map(f => ({ field_id: f.id, native_field_key: null as string | null, label: f.label }));
    if (t.table_name === "tasks") fields.unshift({ field_id: null, native_field_key: "due_date", label: "Due date" });
    return { table_id: null as string | null, table_name: t.table_name, label: t.label, fields };
  }).filter(g => g.fields.length > 0);

  return NextResponse.json({ tables: [...systemGroups, ...customTableGroups] });
}
