// app/api/teams/credentials/route.ts
// Admin-only read/write for company_teams_credentials. GET never returns
// the `credentials` column to the browser (mirrors
// app/api/whatsapp/credentials/route.ts). One row per company -- POST
// upserts rather than inserts. PATCH flips admin_consent_granted once the
// company's Microsoft 365 admin has completed the Azure consent step --
// this app has no way to detect that itself.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data, error } = await admin
    .from("company_teams_credentials")
    .select("id, company_id, admin_consent_granted, last_synced_at, last_sync_error, created_at, secret_expires_at, credentials->tenant_id, credentials->client_id")
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
  const { tenant_id, client_id, client_secret, secret_expires_at } = body ?? {};

  if (!tenant_id || !client_id || !client_secret) {
    return NextResponse.json({ error: "tenant_id, client_id, and client_secret are all required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("company_teams_credentials")
    .upsert(
      {
        company_id: companyId,
        credentials: { tenant_id, client_id, client_secret },
        secret_expires_at: secret_expires_at || null,
        admin_consent_granted: false,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    )
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ connection: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (typeof body?.admin_consent_granted !== "boolean") {
    return NextResponse.json({ error: "admin_consent_granted (boolean) is required" }, { status: 400 });
  }

  const { error } = await admin
    .from("company_teams_credentials")
    .update({ admin_consent_granted: body.admin_consent_granted })
    .eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { error } = await admin.from("company_teams_credentials").delete().eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
