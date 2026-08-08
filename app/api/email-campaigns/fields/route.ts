// app/api/email-campaigns/fields/route.ts
// Every email-type field available to target a campaign at: entities.email
// (the native, most-common case -- contacts/leads/clients), custom
// email-type fields on the other two system tables, and email-type fields
// on custom tables. Mirrors app/api/calendar/date-sources/fields/route.ts's
// same shape/reasoning, just for field_type='email' instead of 'date'.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const SYSTEM_TABLES: { table_name: string; label: string }[] = [
  { table_name: "entities", label: "Entities" },
  { table_name: "projects", label: "Projects" },
  { table_name: "tasks", label: "Tasks" },
];

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const [{ data: customTables }, { data: customTableFields }, { data: systemCustomFields }] = await Promise.all([
    admin.from("company_tables").select("id, name").eq("company_id", companyId).is("deleted_at", null).order("name"),
    admin.from("company_table_fields").select("id, table_id, field_key, label")
      .eq("company_id", companyId).eq("field_type", "email").is("deleted_at", null),
    admin.from("company_custom_fields").select("id, table_name, field_key, label")
      .eq("company_id", companyId).eq("field_type", "email"),
  ]);

  const customTableGroups = (customTables ?? []).map((t) => ({
    table_id: t.id, table_name: null as string | null, label: t.name,
    fields: (customTableFields ?? [])
      .filter((f) => f.table_id === t.id)
      .map((f) => ({ field_id: f.id, native_field_key: null as string | null, label: f.label })),
  })).filter((g) => g.fields.length > 0);

  const systemGroups = SYSTEM_TABLES.map((t) => {
    const fields = (systemCustomFields ?? [])
      .filter((f) => f.table_name === t.table_name)
      .map((f) => ({ field_id: f.id, native_field_key: null as string | null, label: f.label }));
    if (t.table_name === "entities") fields.unshift({ field_id: null, native_field_key: "email", label: "Email" });
    return { table_id: null as string | null, table_name: t.table_name, label: t.label, fields };
  }).filter((g) => g.fields.length > 0);

  return NextResponse.json({ tables: [...systemGroups, ...customTableGroups] });
}
