// app/api/lead-email-assignments/keyword-rules/route.ts
// Admin CRUD for lead_email_keyword_rules -- the third-priority signal
// app/api/gmail/leads-sync uses to match an incoming email's subject to a
// specific Lead (after Gmail thread-id and sender-email matching both come
// up empty). See supabase/migrations/20260730140000_lead_email_assignments.sql.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data, error } = await admin
    .from("lead_email_keyword_rules")
    .select("id, keyword, match_lead_id, is_active, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rules: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const keyword: string = (body?.keyword || "").trim();
  const matchLeadId: string = body?.matchLeadId || "";
  if (!keyword || !matchLeadId) {
    return NextResponse.json({ error: "keyword and matchLeadId are required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("lead_email_keyword_rules")
    .insert({ company_id: companyId, keyword, match_lead_id: matchLeadId, created_by: user.id })
    .select("id, keyword, match_lead_id, is_active, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rule: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await admin
    .from("lead_email_keyword_rules")
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
