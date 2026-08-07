// app/api/ai/proposed-record-detail/route.ts
// Backs ProposedRecordsList.tsx's inline "expand a candidate for more
// detail" -- a small on-demand read so the interactive checklist a
// propose_records tool call renders doesn't need to embed every field of
// every candidate up front. table_id 'projects' is the Matters system
// table (see lib/ai/tableBuilderTools.ts's query_records, which uses the
// same sentinel); anything else is looked up as a custom table.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { searchParams } = new URL(req.url);
  const tableId = searchParams.get("table_id");
  const recordId = searchParams.get("record_id");
  if (!tableId || !recordId) return NextResponse.json({ error: "table_id and record_id are required" }, { status: 400 });

  if (tableId === "projects") {
    const { data } = await admin
      .from("projects")
      .select("name, status, description, created_at, updated_at")
      .eq("id", recordId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      fields: [
        { label: "Name", value: data.name },
        { label: "Status", value: data.status },
        { label: "Description", value: data.description },
        { label: "Created", value: data.created_at },
        { label: "Last updated", value: data.updated_at },
      ],
    });
  }

  const { data: table } = await admin.from("company_tables").select("id").eq("id", tableId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

  const { data: fields } = await admin.from("company_table_fields").select("id, label").eq("table_id", tableId).is("deleted_at", null).order("display_order");
  const { data: record } = await admin
    .from("company_table_records")
    .select("id, values:company_table_values(field_id, value_text, value_number, value_date, value_boolean, value_record_id)")
    .eq("id", recordId)
    .eq("table_id", tableId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const valueByField = new Map((record.values || []).map((v: any) => [v.field_id, v]));
  const result = (fields || []).map((f: any) => {
    const v = valueByField.get(f.id);
    const value = v ? (v.value_record_id ?? v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null) : null;
    return { label: f.label, value };
  });
  return NextResponse.json({ fields: result });
}
