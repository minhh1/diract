// app/api/archive-requests/approve/route.ts
// Admin-only approval for archive_requests (see supabase/archive_requests.sql).
// Mirrors app/api/gmail/archive-requests/approve's admin-role-check pattern.
// Accepts multiple ids for the review tab's bulk action.
//
// Every entity_table gets a plain soft-delete (deleted_at = now()) EXCEPT
// 'gmail_project_archive' -- that one isn't a real entity table at all, it's
// the migrated-in Gmail closed-matter archive flow (see
// supabase/functions/gmail-addon/index.ts's /request-archive), where
// "archiving" means moving the project's Gmail messages into a nominated
// archive account and trashing them elsewhere, never touching the project
// record itself. That still goes through enqueueProjectArchive, same as
// it always has -- only the request/approval bookkeeping moved to the
// shared table.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { enqueueProjectArchive } from "@/lib/gmail/archiveProject";
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

  const { data: requests, error } = await admin
    .from("archive_requests")
    .select("id, entity_table, entity_id, entity_label, requested_by")
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: company } = await admin.from("companies").select("name").eq("id", companyId).single();

  const results: Record<string, { ok: boolean; error?: string }> = {};
  for (const reqRow of requests || []) {
    if (reqRow.entity_table === "gmail_project_archive") {
      const result = await enqueueProjectArchive(admin, companyId, reqRow.entity_id);
      if (!result.ok) {
        await admin.from("archive_requests").update({ error: result.error }).eq("id", reqRow.id);
        results[reqRow.id] = { ok: false, error: result.error };
        continue;
      }
    } else {
      const { error: delErr } = await admin
        .from(reqRow.entity_table)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", reqRow.entity_id);
      if (delErr) {
        results[reqRow.id] = { ok: false, error: delErr.message };
        continue;
      }
    }

    await admin.from("archive_requests").update({
      status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString(), error: null,
    }).eq("id", reqRow.id);
    results[reqRow.id] = { ok: true };

    if (reqRow.requested_by) {
      const { data: requester } = await admin.from("profiles").select("email, full_name").eq("id", reqRow.requested_by).maybeSingle();
      if (requester?.email) {
        await notifyEvent({
          admin, companyId, eventType: "archive_request_approved", to: requester.email,
          subject: `Archive request approved: ${reqRow.entity_label}`,
          html: archiveRequestDecisionHtml({
            companyName: company?.name || "Diract", requesterName: requester.full_name || "there",
            entityLabel: reqRow.entity_label, approved: true,
          }),
          sentBy: user.id,
        });
      }
    }
  }

  return NextResponse.json({ results });
}
