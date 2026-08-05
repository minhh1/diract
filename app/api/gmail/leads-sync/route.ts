// app/api/gmail/leads-sync/route.ts
// Scans the company's shared "Leads" Gmail label (companies.gmail_leads_label
// -- see supabase/companies_gmail_leads_label.sql) for new messages and
// proposes an assignment for each one (link to an existing Lead, or create a
// new Lead) into lead_email_assignment_requests. Nothing is ever applied
// here -- every proposal waits for an admin to approve it via
// /api/lead-email-assignments/approve. Mirrors the source-of-truth mailbox
// resolution in app/api/gmail/sync/route.ts's runSync().
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getGmailAccessToken, getOrCreateLabelHierarchy, listMessagesWithLabel, matchLeadForEmail } from "@/lib/services/leadGmailAssignment";

// Same shape/table as the edge-function crons' heartbeat() helper (see e.g.
// supabase/functions/gmail-email-sync-cron/index.ts) -- registered as
// "gmail-leads-sync" in AdminGmailSyncTab.tsx's HEARTBEAT_DEFS so a stuck or
// failing Leads sync shows up in Admin → Gmail sync → System health next to
// the other Gmail cron/worker jobs, not just this one company's UI.
async function writeHeartbeat(admin: any, durationMs: number, result: unknown): Promise<void> {
  try {
    await admin.from("cron_heartbeats").upsert(
      { name: "gmail-leads-sync", last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break sync over a heartbeat write */ }
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;
  const t0 = Date.now();

  try {
    const { data: company } = await admin
      .from("companies")
      .select("gmail_leads_label, gmail_source_emails")
      .eq("id", companyId)
      .single();

    const leadsLabel: string | null = company?.gmail_leads_label || null;
    if (!leadsLabel) {
      const result = { proposed: 0, scanned: 0, message: "No Leads label configured. Set one in Gmail Label Settings first." };
      await writeHeartbeat(admin, Date.now() - t0, result);
      return NextResponse.json(result);
    }

    const { data: members } = await admin
      .from("company_memberships")
      .select("user_id")
      .eq("company_id", companyId);

    const connectedUsers: { userId: string; accessToken: string }[] = [];
    for (const m of members || []) {
      const token = await getGmailAccessToken(admin, m.user_id);
      if (token) connectedUsers.push({ userId: m.user_id, accessToken: token });
    }
    if (!connectedUsers.length) {
      const result = { proposed: 0, scanned: 0, message: "No team member has a connected Gmail account." };
      await writeHeartbeat(admin, Date.now() - t0, result);
      return NextResponse.json(result);
    }

    const sourceEmailList: string[] = company?.gmail_source_emails || [];
    let sourceUser = connectedUsers[0];
    if (sourceEmailList.length > 0) {
      const { data: tokenRows } = await admin
        .from("user_gmail_tokens")
        .select("user_id, email")
        .in("email", sourceEmailList);
      const nominated = (tokenRows || []).map((tr: any) => connectedUsers.find(u => u.userId === tr.user_id)).find(Boolean);
      if (nominated) sourceUser = nominated;
    }

    // Ensure the shared Leads label exists in every connected member's
    // mailbox -- this is the "push the shared label to every team member"
    // requirement, and it runs on every sync (not just once), so a newly
    // connected member or one who deleted the label gets it back
    // automatically. Previously this only ever looked the label up and gave
    // up if it didn't exist yet, which meant a brand-new label name typed
    // into Label Settings would never actually get created anywhere.
    const leadsLabelParts = leadsLabel.split("/");
    let labelId: string | null = null;
    for (const member of connectedUsers) {
      const id = await getOrCreateLabelHierarchy(member.accessToken, leadsLabelParts);
      if (member.userId === sourceUser.userId) labelId = id;
    }
    if (!labelId) {
      const result = { proposed: 0, scanned: 0, message: `Could not create the Leads label "${leadsLabel}" in the source mailbox.` };
      await writeHeartbeat(admin, Date.now() - t0, result);
      return NextResponse.json(result);
    }

    const messageIds = await listMessagesWithLabel(sourceUser.accessToken, labelId);
    if (!messageIds.length) {
      const result = { proposed: 0, scanned: 0 };
      await writeHeartbeat(admin, Date.now() - t0, result);
      return NextResponse.json(result);
    }

    // Skip anything already linked to a Lead, or already proposed/reviewed -
    // the partial unique index on lead_email_assignment_requests also guards
    // this at the DB level, but pre-filtering avoids paying for a metadata
    // fetch + match lookup per already-seen message on every sync run.
    const [{ data: alreadyLinked }, { data: alreadyRequested }] = await Promise.all([
      admin.from("lead_emails").select("gmail_message_id").eq("company_id", companyId).in("gmail_message_id", messageIds),
      admin.from("lead_email_assignment_requests").select("gmail_message_id").eq("company_id", companyId).in("gmail_message_id", messageIds),
    ]);
    const seen = new Set([
      ...(alreadyLinked || []).map((r: any) => r.gmail_message_id),
      ...(alreadyRequested || []).map((r: any) => r.gmail_message_id),
    ]);
    const newMessageIds = messageIds.filter(id => !seen.has(id));
    if (!newMessageIds.length) {
      const result = { proposed: 0, scanned: messageIds.length };
      await writeHeartbeat(admin, Date.now() - t0, result);
      return NextResponse.json(result);
    }

    const newRows: Record<string, any>[] = [];
    for (const msgId of newMessageIds) {
      const res = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${sourceUser.accessToken}` } }
      );
      if (!res.ok) continue;
      const msg = await res.json();
      const headers = msg.payload?.headers || [];
      const get = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

      const fromRaw = get("From");
      const fromMatch = fromRaw.match(/^(.+?)\s*<(.+?)>$/);
      const fromName = fromMatch ? fromMatch[1].trim().replace(/^"|"$/g, "") : fromRaw;
      const fromAddr = fromMatch ? fromMatch[2].trim() : fromRaw;
      const subject = get("Subject") || "(no subject)";
      const date = get("Date") || null;
      const snippet = msg.snippet || "";
      const threadId = msg.threadId || null;

      const match = await matchLeadForEmail(admin, companyId, { fromAddress: fromAddr, subject, threadId });

      newRows.push(match
        ? {
            company_id: companyId,
            kind: "link_existing",
            gmail_message_id: msgId,
            gmail_thread_id: threadId,
            subject, from_address: fromAddr, from_name: fromName, snippet, date,
            matched_lead_id: match.leadId,
            match_reason: match.matchReason,
          }
        : {
            company_id: companyId,
            kind: "create_new",
            gmail_message_id: msgId,
            gmail_thread_id: threadId,
            subject, from_address: fromAddr, from_name: fromName, snippet, date,
            proposed_fields: {
              lead_name: fromName || fromAddr,
              email: fromAddr,
              status: "New",
              date_received: new Date().toISOString().slice(0, 10),
              notes: snippet,
            },
          });
    }

    if (!newRows.length) {
      const result = { proposed: 0, scanned: messageIds.length };
      await writeHeartbeat(admin, Date.now() - t0, result);
      return NextResponse.json(result);
    }

    // Inserted one row at a time (rather than one bulk INSERT) so a single
    // duplicate-key race against the partial unique index -- a concurrent sync
    // run, or a message that slipped past the pre-filter above -- only drops
    // that one proposal instead of aborting the whole statement/batch.
    let proposedCount = 0;
    for (const row of newRows) {
      const { error: insertError } = await admin.from("lead_email_assignment_requests").insert(row);
      if (!insertError) proposedCount++;
      else if (insertError.code !== "23505") console.error("[leads-sync] insert failed:", insertError.message);
    }
    if (proposedCount > 0) {
      await admin.rpc("notify_company_admins", {
        p_company_id: companyId,
        p_event_type: "lead_email_assignment_submitted",
        p_title: proposedCount === 1 ? "1 lead email needs review" : `${proposedCount} lead emails need review`,
        p_link_url: "/dashboard/admin?tab=leadEmailAssignments",
        p_entity_table: "lead_email_assignment_requests",
      }).then(() => {}, () => {});
    }

    const result = { proposed: proposedCount, scanned: messageIds.length };
    await writeHeartbeat(admin, Date.now() - t0, result);
    return NextResponse.json(result);

  } catch (err: any) {
    console.error("[leads-sync] Unhandled error:", err);
    await writeHeartbeat(admin, Date.now() - t0, { error: err.message || "Unknown error" });
    return NextResponse.json({ error: err.message || "Unknown error" }, { status: 500 });
  }
}
