// app/api/email-campaigns/route.ts
// List/create draft campaigns. Sending is a separate explicit action (see
// [id]/send/route.ts), never implicit on create -- same "draft first"
// pattern roster_shifts uses.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data, error } = await admin.from("email_campaigns").select("*").eq("company_id", companyId).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { table_id, table_name, email_field_id, native_field_key } = body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const bodyText = typeof body.body_text === "string" ? body.body_text.trim() : "";
  if (!name || !subject || !bodyText) return NextResponse.json({ error: "Name, subject, and body are required" }, { status: 400 });
  if (!table_id && !table_name) return NextResponse.json({ error: "table_id or table_name is required" }, { status: 400 });
  if (!email_field_id && !native_field_key) return NextResponse.json({ error: "email_field_id or native_field_key is required" }, { status: 400 });

  const { data: created, error } = await admin.from("email_campaigns").insert({
    company_id: companyId, name, subject, body_text: bodyText,
    table_id: table_id || null, table_name: table_name || null,
    email_field_id: email_field_id || null, native_field_key: native_field_key || null,
    created_by: user.id,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign: created });
}
