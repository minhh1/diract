// app/api/calendar/date-sources/route.ts
// CRUD for calendar_date_sources -- see that table's own migration
// (20260808200500_calendar_date_sources.sql) for the table_id/table_name
// and field_id/native_field_key dualities this validates against.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin.from("calendar_date_sources").select("*").eq("company_id", companyId).order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { table_id, table_name, field_id, native_field_key, notify_field_id } = body;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const color = typeof body.color === "string" && body.color ? body.color : "#6366f1";
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (!table_id && !table_name) return NextResponse.json({ error: "table_id or table_name is required" }, { status: 400 });
  if (table_id && table_name) return NextResponse.json({ error: "Provide table_id or table_name, not both" }, { status: 400 });
  if (!field_id && !native_field_key) return NextResponse.json({ error: "field_id or native_field_key is required" }, { status: 400 });
  if (field_id && native_field_key) return NextResponse.json({ error: "Provide field_id or native_field_key, not both" }, { status: 400 });

  const { data: created, error } = await admin.from("calendar_date_sources").insert({
    company_id: companyId,
    table_id: table_id || null,
    table_name: table_name || null,
    field_id: field_id || null,
    native_field_key: native_field_key || null,
    notify_field_id: notify_field_id || null,
    label, color, created_by: user.id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ source: created });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await admin.from("calendar_date_sources").delete().eq("id", id).eq("company_id", companyId);
  return NextResponse.json({ ok: true });
}
