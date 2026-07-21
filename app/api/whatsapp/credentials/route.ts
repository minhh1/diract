// app/api/whatsapp/credentials/route.ts
// Admin-only read/write for company_whatsapp_credentials. GET never returns
// the `credentials` column to the browser (mirrors
// app/api/virtual-computers/credentials/route.ts). One row per company --
// POST upserts rather than inserts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data, error } = await admin
    .from("company_whatsapp_credentials")
    .select("id, company_id, created_at, updated_at, credentials->phone_number_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ connection: data });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { access_token, phone_number_id, business_account_id, webhook_verify_token } = body ?? {};

  if (!access_token || !phone_number_id || !business_account_id || !webhook_verify_token) {
    return NextResponse.json(
      { error: "access_token, phone_number_id, business_account_id, and webhook_verify_token are all required" },
      { status: 400 }
    );
  }

  const { data, error } = await admin
    .from("company_whatsapp_credentials")
    .upsert(
      {
        company_id: companyId,
        credentials: { access_token, phone_number_id, business_account_id, webhook_verify_token },
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    )
    .select("id, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ connection: data });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { error } = await admin.from("company_whatsapp_credentials").delete().eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
