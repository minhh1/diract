// app/api/teams/admin-consent-callback/route.ts
// Redirect target for Azure AD's v2 admin-consent endpoint
// (https://login.microsoftonline.com/{tenant}/adminconsent). Registering
// this URL as the app's Redirect URI is required -- AADSTS500113 ("No
// reply address is registered for the application") fires if the app has
// zero redirect URIs, even though this integration is otherwise pure
// app-only client-credentials auth with no interactive sign-in.
//
// Whoever completes consent is the company's Microsoft 365 admin, who may
// not have a niksen-flow session at all -- there's no user to authorize
// against here, hence adminClient() directly rather than
// authorizeCompanyMember(). state carries the company_id we set when
// building the consent link (see AdminMsTeamsTab.tsx); tenant is
// cross-checked against the stored tenant_id as a sanity check before
// flipping admin_consent_granted, since state is just a query param an
// attacker could guess/reuse.
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
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?msTeamsConsent=error&message=${encodeURIComponent(message)}`);
  }

  const admin = adminClient();
  const { data: row } = await admin
    .from("company_teams_credentials")
    .select("credentials->tenant_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (row?.tenant_id && row.tenant_id === tenant) {
    await admin.from("company_teams_credentials").update({ admin_consent_granted: true }).eq("company_id", companyId);
    return NextResponse.redirect(`${APP_URL}/dashboard/admin?msTeamsConsent=success`);
  }

  return NextResponse.redirect(`${APP_URL}/dashboard/admin?msTeamsConsent=error&message=${encodeURIComponent("Tenant mismatch")}`);
}
