// app/api/calendar/date-events/route.ts
// Resolves every calendar_date_sources row into actual dated events for a
// visible range -- the read side of the generic per-table date-field
// mechanism (see 20260808200500_calendar_date_sources.sql). Three
// resolution paths, one per source shape: a native system-table column
// (tasks.due_date), a custom field on a system table
// (company_custom_field_values), or a field on a custom table
// (company_table_values). Each returns { record_id, date, name, table_name
// | table_id } so the client can build a "/dashboard/..." link per event,
// tagged with the source's label/color for rendering.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

// The only two native (not-a-custom-field) date columns this route knows
// how to read directly -- see calendar_date_sources' native_field_key.
const NATIVE_DATE_TABLES: Record<string, { table: string; nameCol: string }> = {
  tasks: { table: "tasks", nameCol: "name" },
};
const SYSTEM_TABLE_INFO: Record<string, { table: string; nameCol: string }> = {
  tasks: { table: "tasks", nameCol: "name" },
  projects: { table: "projects", nameCol: "name" },
  entities: { table: "entities", nameCol: "name" },
};

interface SourceEvent {
  source_id: string; label: string; color: string;
  record_id: string; name: string; date: string;
  table_name: string | null; table_id: string | null;
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });

  const { data: sources } = await admin.from("calendar_date_sources").select("*").eq("company_id", companyId);
  if (!sources?.length) return NextResponse.json({ events: [] });

  const events: SourceEvent[] = [];

  await Promise.all(sources.map(async (source) => {
    if (source.native_field_key) {
      const info = NATIVE_DATE_TABLES[source.table_name as string];
      if (!info) return;
      const { data: rows } = await admin.from(info.table)
        .select(`id, ${info.nameCol}, ${source.native_field_key}`)
        .eq("company_id", companyId)
        .gte(source.native_field_key, `${start}T00:00:00`)
        .lte(source.native_field_key, `${end}T23:59:59.999`);
      for (const r of (rows ?? []) as any[]) {
        const dateVal = r[source.native_field_key];
        if (!dateVal) continue;
        events.push({
          source_id: source.id, label: source.label, color: source.color,
          record_id: r.id, name: r[info.nameCol] || "Untitled", date: String(dateVal).slice(0, 10),
          table_name: source.table_name, table_id: null,
        });
      }
      return;
    }

    if (source.table_name) {
      const info = SYSTEM_TABLE_INFO[source.table_name];
      if (!info) return;
      const { data: values } = await admin.from("company_custom_field_values")
        .select("record_id, value_date")
        .eq("company_id", companyId).eq("field_id", source.field_id)
        .gte("value_date", start).lte("value_date", end);
      if (!values?.length) return;
      const recordIds = values.map(v => v.record_id);
      const { data: records } = await admin.from(info.table).select(`id, ${info.nameCol}`).in("id", recordIds);
      const nameById = new Map((records ?? []).map((r: any) => [r.id, r[info.nameCol]]));
      for (const v of values) {
        events.push({
          source_id: source.id, label: source.label, color: source.color,
          record_id: v.record_id, name: nameById.get(v.record_id) || "Untitled", date: v.value_date,
          table_name: source.table_name, table_id: null,
        });
      }
      return;
    }

    if (source.table_id) {
      const { data: values } = await admin.from("company_table_values")
        .select("record_id, value_date")
        .eq("company_id", companyId).eq("table_id", source.table_id).eq("field_id", source.field_id)
        .gte("value_date", start).lte("value_date", end);
      if (!values?.length) return;
      const recordIds = values.map(v => v.record_id);

      // Resolve each record's display name via the table's own configured
      // primary field (company_tables.primary_field_key), the same field a
      // generic custom table already treats as its title everywhere else.
      const { data: table } = await admin.from("company_tables").select("primary_field_key").eq("id", source.table_id).maybeSingle();
      let nameById = new Map<string, string>();
      if (table?.primary_field_key) {
        const { data: primaryField } = await admin.from("company_table_fields")
          .select("id").eq("table_id", source.table_id).eq("field_key", table.primary_field_key).maybeSingle();
        if (primaryField) {
          const { data: nameValues } = await admin.from("company_table_values")
            .select("record_id, value_text").eq("table_id", source.table_id).eq("field_id", primaryField.id).in("record_id", recordIds);
          nameById = new Map((nameValues ?? []).map(v => [v.record_id, v.value_text || "Untitled"]));
        }
      }
      for (const v of values) {
        events.push({
          source_id: source.id, label: source.label, color: source.color,
          record_id: v.record_id, name: nameById.get(v.record_id) || "Untitled", date: v.value_date,
          table_name: null, table_id: source.table_id,
        });
      }
    }
  }));

  return NextResponse.json({ events });
}
