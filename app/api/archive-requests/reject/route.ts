// app/api/archive-requests/reject/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { notifyEvent } from "@/lib/email/notify";
import { archiveRequestDecisionHtml } from "@/lib/email/templates";

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

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).single();
  for (const reqRow of requests || []) {
    if (!reqRow.requested_by) continue;
    const { data: requester } = await admin.from("profiles").select("email, full_name").eq("id", reqRow.requested_by).maybeSingle();
    if (!requester?.email) continue;
    await notifyEvent({
      admin, companyId, eventType: "archive_request_rejected", to: requester.email,
      subject: `Archive request rejected: ${reqRow.entity_label}`,
      html: archiveRequestDecisionHtml({
        companyName: company?.name || "Diract", requesterName: requester.full_name || "there",
        entityLabel: reqRow.entity_label, approved: false,
      }),
      sentBy: user.id,
    });
  }

  return NextResponse.json({ ok: true });
}
