// app/api/onedrive/credentials/route.ts
// Admin-only read/write for company_onedrive_credentials. GET never returns
// the `credentials` column to the browser (mirrors
// app/api/teams/credentials/route.ts). One row per company -- POST upserts
// and resolves site_id/drive_id from the admin-provided site_url via Graph
// (see lib/msGraph/onedrive.ts) so those don't need to be looked up by
// hand. PATCH flips admin_consent_granted once the company's Microsoft 365
// admin has completed the Azure consent step -- this app has no way to
// detect that itself (same pattern as the Teams credentials route).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getGraphAppToken, resolveSiteAndDrive } from "@/lib/msGraph/onedrive";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data, error } = await admin
    .from("company_onedrive_credentials")
    .select("id, company_id, admin_consent_granted, last_synced_at, last_sync_error, created_at, site_id, drive_id, credentials->tenant_id, credentials->client_id, credentials->site_url")
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
  const { tenant_id, client_id, client_secret, site_url } = body ?? {};
  if (!tenant_id || !client_id || !client_secret || !site_url) {
    return NextResponse.json({ error: "tenant_id, client_id, client_secret, and site_url are all required" }, { status: 400 });
  }

  // Admin consent for Files.ReadWrite.All must already be in place for this
  // to succeed -- if it fails, credentials still save (so the admin can
  // grant consent and retry) but site_id/drive_id stay null.
  let siteId: string | null = null;
  let driveId: string | null = null;
  let resolveError: string | null = null;
  try {
    const token = await getGraphAppToken(tenant_id, client_id, client_secret);
    const resolved = await resolveSiteAndDrive(token, site_url);
    siteId = resolved.siteId;
    driveId = resolved.driveId;
  } catch (err) {
    resolveError = err instanceof Error ? err.message : "Failed to resolve the SharePoint site/library";
  }

  const { data, error } = await admin
    .from("company_onedrive_credentials")
    .upsert(
      {
        company_id: companyId,
        credentials: { tenant_id, client_id, client_secret, site_url },
        site_id: siteId,
        drive_id: driveId,
        last_sync_error: resolveError,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    )
    .select("id, created_at, site_id, drive_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ connection: data, resolveError });
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

  const { error } = await admin.from("company_onedrive_credentials").update({ admin_consent_granted: body.admin_consent_granted }).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { error } = await admin.from("company_onedrive_credentials").delete().eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
