// app/api/archive-requests/reject/route.ts
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

  const { data: requests, error: fetchError } = await admin
    .from("archive_requests")
    .select("id, entity_label, requested_by")
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });

  const { error } = await admin
    .from("archive_requests")
    .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  for (const reqRow of requests || []) {
    if (!reqRow.requested_by) continue;
    await admin.rpc("create_notification", {
      p_company_id: companyId,
      p_recipient_user_id: reqRow.requested_by,
      p_event_type: "archive_request_rejected",
      p_title: `Archive request rejected: ${reqRow.entity_label}`,
      p_entity_table: "archive_requests",
      p_entity_id: reqRow.id,
    });
  }

  return NextResponse.json({ ok: true });
}
