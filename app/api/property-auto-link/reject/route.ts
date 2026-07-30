// app/api/property-auto-link/reject/route.ts
// Admin-only reject for property_auto_link_requests — no side effects, just
// flips status. These rows are system-generated (property-auto-link-scan),
// same as lead_email_assignment_requests, so there's no requested_by human
// to notify. A rejected project never gets re-proposed by a later scan
// (see the migration's project_id unique index).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });

  const { error } = await admin
    .from("property_auto_link_requests")
    .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
