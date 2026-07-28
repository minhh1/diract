// Admin-only read/write for company_email_domains -- one custom sending
// domain per company, verified via Resend (see lib/email/resend.ts).
// Mirrors app/api/teams/credentials/route.ts's shape. POST both creates the
// Resend-side domain (on first call) and upserts the local row; DELETE tears
// down both. GET/POST/DELETE are all gated the same way as Teams -- there's
// no per-field secret to withhold here (dns_records are meant to be shown
// and copied by the admin), unlike company_teams_credentials' client_secret.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createDomain, deleteDomain } from "@/lib/email/resend";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data, error } = await admin
    .from("company_email_domains")
    .select("id, domain, status, dns_records, from_name, from_local_part, created_at")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ domain: data });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const domain: string | undefined = body?.domain?.trim();
  const fromName: string = body?.from_name?.trim() || "Notifications";
  const fromLocalPart: string = body?.from_local_part?.trim() || "notifications";
  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

  let resendDomain;
  try {
    resendDomain = await createDomain(domain);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to register domain with Resend" }, { status: 502 });
  }

  const { data, error } = await admin
    .from("company_email_domains")
    .upsert(
      {
        company_id: companyId,
        domain,
        resend_domain_id: resendDomain.id,
        status: resendDomain.status === "verified" ? "verified" : "pending",
        dns_records: resendDomain.records,
        from_name: fromName,
        from_local_part: fromLocalPart,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" }
    )
    .select("id, domain, status, dns_records, from_name, from_local_part, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ domain: data });
}

export async function DELETE() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data: existing } = await admin
    .from("company_email_domains")
    .select("resend_domain_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing?.resend_domain_id) {
    try {
      await deleteDomain(existing.resend_domain_id);
    } catch {
      // Resend-side cleanup is best-effort -- still remove the local row so
      // the admin can re-add and retry rather than getting stuck.
    }
  }

  const { error } = await admin.from("company_email_domains").delete().eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
