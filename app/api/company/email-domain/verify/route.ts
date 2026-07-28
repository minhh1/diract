// Re-checks a company's custom sending domain against Resend -- triggers a
// fresh DNS lookup on Resend's side, then reads back the current
// status/records. Separate from the main route since it doesn't take a
// body and isn't a create/delete.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getDomain, verifyDomain } from "@/lib/email/resend";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data: existing, error: fetchError } = await admin
    .from("company_email_domains")
    .select("resend_domain_id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing?.resend_domain_id) return NextResponse.json({ error: "No domain configured" }, { status: 400 });

  try {
    await verifyDomain(existing.resend_domain_id);
  } catch {
    // Verify is just a nudge to re-check DNS now rather than on Resend's own
    // schedule -- if it errors (e.g. already verified), still fall through
    // to reading the current status below.
  }

  let resendDomain;
  try {
    resendDomain = await getDomain(existing.resend_domain_id);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to check domain status" }, { status: 502 });
  }

  const { data, error } = await admin
    .from("company_email_domains")
    .update({
      status: resendDomain.status === "verified" ? "verified" : resendDomain.status === "failure" ? "failed" : "pending",
      dns_records: resendDomain.records,
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId)
    .select("id, domain, status, dns_records, from_name, from_local_part, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ domain: data });
}
