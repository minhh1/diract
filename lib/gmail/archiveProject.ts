// lib/gmail/archiveProject.ts
// Shared enqueue logic for closed-matter archiving — used by both the
// admin-direct trigger (app/api/gmail/archive-project) and the unified
// archive-request approval flow (app/api/archive-requests/approve's
// 'gmail_project_archive' entity_table case). Stamps
// project_gmail_labels.archived_at, marks the matter Closed, and inserts a
// gmail_sync_jobs row that gmail-archive-worker will pick up on its next
// tick. Runs in that order deliberately: by the time the projects.status
// update fires trg_projects_status_archive (see
// enqueue_gmail_archive_on_close() in supabase/gmail_archive.sql -- the
// *other* direction of this same relationship, closing a matter
// auto-archives Gmail if the company has that turned on), archived_at is
// already set, so that trigger's own "is there an active label" check finds
// none and no-ops instead of double-enqueueing.
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

  // Gmail-archiving a matter means the matter is done -- mark it Closed too.
  // Unconditional (not `.neq("status", "Closed")`) since a NULL status
  // would never satisfy a not-equal filter in Postgres and silently never
  // get closed; re-setting an already-Closed project to Closed is a no-op
  // for trg_projects_status_archive anyway (it only fires on an actual
  // change). Best-effort: the Gmail side of the archive is already durably
  // enqueued above, so a failure here shouldn't be reported as the archive
  // itself having failed.
  await adminDb.from("projects")
    .update({ status: "Closed" })
    .eq("id", projectId).eq("company_id", companyId);

  return { ok: true, totalUsers };
}
