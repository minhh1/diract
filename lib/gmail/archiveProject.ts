// lib/gmail/archiveProject.ts
// Shared enqueue logic for closed-matter archiving — used by both the
// admin-direct trigger (app/api/gmail/archive-project) and the add-on
// request-approval flow (app/api/gmail/archive-requests/approve). Stamps
// project_gmail_labels.archived_at and inserts a gmail_sync_jobs row that
// gmail-archive-worker will pick up on its next tick.
import type { SupabaseClient } from "@supabase/supabase-js";

export type EnqueueArchiveResult =
  | { ok: true; totalUsers: number }
  | { ok: false; status: number; error: string };

export async function enqueueProjectArchive(
  adminDb: SupabaseClient,
  companyId: string,
  projectId: string
): Promise<EnqueueArchiveResult> {
  const { data: company } = await adminDb
    .from("companies").select("gmail_archive_emails").eq("id", companyId).single();
  const archiveEmails: string[] = company?.gmail_archive_emails || [];
  if (!archiveEmails.length) {
    return { ok: false, status: 400, error: "Nominate at least one archive Gmail account first (Admin → Gmail settings)" };
  }

  const { data: label } = await adminDb
    .from("project_gmail_labels")
    .select("label_code, gmail_label_name")
    .eq("project_id", projectId).eq("company_id", companyId)
    .is("removed_at", null).is("archived_at", null)
    .maybeSingle();
  if (!label) {
    return { ok: false, status: 400, error: "No active shared label found for this project" };
  }

  const { data: existingJob } = await adminDb
    .from("gmail_sync_jobs")
    .select("id")
    .eq("job_type", "archive").eq("project_id", projectId).eq("company_id", companyId)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  if (existingJob) {
    return { ok: false, status: 409, error: "This project is already being archived" };
  }

  // total_users = connected company members minus the nominated archive accounts
  const { data: members } = await adminDb
    .from("company_memberships").select("user_id").eq("company_id", companyId);
  const memberIds = (members || []).map((m: any) => m.user_id);
  const { data: tokenRows } = memberIds.length
    ? await adminDb.from("user_gmail_tokens").select("user_id, email").in("user_id", memberIds)
    : { data: [] as any[] };
  const archiveEmailSet = new Set(archiveEmails);
  const totalUsers = (tokenRows || []).filter((t: any) => !archiveEmailSet.has(t.email)).length;

  await adminDb.from("project_gmail_labels")
    .update({ archived_at: new Date().toISOString() })
    .eq("project_id", projectId).eq("company_id", companyId);

  const { error: insertErr } = await adminDb.from("gmail_sync_jobs").insert({
    job_type: "archive",
    company_id: companyId,
    project_id: projectId,
    label_code: label.label_code,
    gmail_label_name: label.gmail_label_name,
    status: "pending",
    attempts: 0,
    completed_users: [],
    total_users: totalUsers,
  });
  if (insertErr) {
    // Roll back the archived_at stamp if we couldn't actually enqueue the job
    await adminDb.from("project_gmail_labels")
      .update({ archived_at: null })
      .eq("project_id", projectId).eq("company_id", companyId);
    return { ok: false, status: 500, error: insertErr.message };
  }

  return { ok: true, totalUsers };
}
