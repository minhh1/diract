// app/api/onedrive/admin-consent-callback/route.ts
// Redirect target for Azure AD's v2 admin-consent endpoint, for the
// Files.ReadWrite.All permission this OneDrive integration needs. Direct
// mirror of app/api/teams/admin-consent-callback/route.ts -- see that
// file's header comment for why adminClient() is used directly (whoever
// completes consent is the company's Microsoft 365 admin, who may have no
// Diract session at all) and why tenant is cross-checked against the
// stored tenant_id before flipping admin_consent_granted.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { APP_URL } from "@/lib/config";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  const companyId = req.nextUrl.searchParams.get("state");
  const adminConsent = req.nextUrl.searchParams.get("admin_consent");
  const error = req.nextUrl.searchParams.get("error");
  const errorDescription = req.nextUrl.searchParams.get("error_description");

  if (error || adminConsent !== "True" || !companyId) {
    const message = errorDescription || error || "Consent was not granted";
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?oneDriveConsent=error&message=${encodeURIComponent(message)}`);
  }

  const admin = adminClient();
  const { data: row } = await admin
    .from("company_onedrive_credentials")
    .select("credentials->tenant_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (row?.tenant_id && row.tenant_id === tenant) {
    await admin.from("company_onedrive_credentials").update({ admin_consent_granted: true }).eq("company_id", companyId);
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?oneDriveConsent=success`);
  }

  return NextResponse.redirect(`${APP_URL}/dashboard/admin?oneDriveConsent=error&message=${encodeURIComponent("Tenant mismatch")}`);
}
