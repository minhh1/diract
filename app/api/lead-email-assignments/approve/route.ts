// app/api/lead-email-assignments/approve/route.ts
// Admin-only approval for lead_email_assignment_requests (see
// supabase/migrations/20260730140000_lead_email_assignments.sql). Mirrors
// app/api/archive-requests/approve's admin-gate + bulk-ids + per-id results
// shape. For 'create_new' rows, the Lead record is created and its id is
// persisted onto the request (matched_lead_id) BEFORE the Gmail label step
// runs — so if the label step fails (e.g. the approving admin has no
// connected Gmail account), the row stays 'pending' with `error` set and a
// retry reuses the already-created Lead instead of creating a duplicate.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { applyLeadGmailLabel, createLeadRecordFromProposal, getLeadDisplayName } from "@/lib/services/leadGmailAssignment";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids is required" }, { status: 400 });

  const { data: requests, error } = await admin
    .from("lead_email_assignment_requests")
    .select("id, kind, gmail_message_id, gmail_thread_id, subject, from_address, from_name, snippet, date, matched_lead_id, proposed_fields")
    .in("id", ids)
    .eq("company_id", companyId)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: company } = await admin.from("companies").select("gmail_leads_label").eq("id", companyId).single();
  const leadsParentLabel = company?.gmail_leads_label || "Leads";

  const results: Record<string, { ok: boolean; error?: string }> = {};

  for (const reqRow of requests || []) {
    let leadId: string | null = reqRow.matched_lead_id;
    let leadName = "";

    if (!leadId) {
      const created = await createLeadRecordFromProposal(admin, companyId, user.id, reqRow.proposed_fields || {});
      if ("error" in created) {
        await admin.from("lead_email_assignment_requests").update({ error: created.error }).eq("id", reqRow.id);
        results[reqRow.id] = { ok: false, error: created.error };
        continue;
      }
      leadId = created.id;
      leadName = created.leadName;
      await admin.from("lead_email_assignment_requests").update({ matched_lead_id: leadId }).eq("id", reqRow.id);
    } else {
      leadName = await getLeadDisplayName(admin, companyId, leadId);
    }

    const labelResult = await applyLeadGmailLabel(admin, {
      companyId,
      leadId,
      leadName,
      actingUserId: user.id,
      messageId: reqRow.gmail_message_id,
      threadId: reqRow.gmail_thread_id,
      subject: reqRow.subject,
      fromAddr: reqRow.from_address,
      fromName: reqRow.from_name,
      date: reqRow.date,
      snippet: reqRow.snippet,
      leadsParentLabel,
    });

    if (!labelResult.ok) {
      await admin.from("lead_email_assignment_requests").update({ error: labelResult.error }).eq("id", reqRow.id);
      results[reqRow.id] = { ok: false, error: labelResult.error };
      continue;
    }

    await admin.from("lead_email_assignment_requests").update({
      status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString(), error: null,
    }).eq("id", reqRow.id);
    results[reqRow.id] = { ok: true };
  }

  return NextResponse.json({ results });
}
