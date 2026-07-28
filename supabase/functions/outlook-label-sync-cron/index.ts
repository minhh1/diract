// supabase/functions/outlook-label-sync-cron/index.ts
// Every 15 min — upserts one label_sync job per project per company,
// mirroring gmail-label-sync-cron. outlook-label-sync-worker handles
// per-user processing and tracks completion.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break sync over a heartbeat write */ }
}

Deno.serve(async (_req) => {
  console.log("[outlook-label-sync-cron] START");
  const t0 = Date.now();
  let queued = 0;

  // Mirrors gmail-label-sync-cron's own signal (.not('gmail_parent_label',
  // 'is', null)) rather than mail_provider — outlook_parent_folder is what
  // app/api/outlook/assign actually persists on first use, so it's the
  // reliable "this company is actively using Outlook labels" flag.
  const { data: companies } = await db.from("companies")
    .select("id").not("outlook_parent_folder", "is", null);

  for (const company of (companies || [])) {
    const companyId = company.id;

    const { data: members } = await db.from("company_memberships")
      .select("user_id").eq("company_id", companyId);
    const memberIds = (members || []).map((m: any) => m.user_id);
    if (!memberIds.length) continue;

    const { data: connected } = await db.from("user_outlook_tokens")
      .select("user_id").in("user_id", memberIds);
    const totalUsers = (connected || []).length;
    if (!totalUsers) continue;

    const { data: activeLabels } = await db.from("project_outlook_labels")
      .select("project_id, label_code, category_name")
      .eq("company_id", companyId).is("removed_at", null).is("archived_at", null);

    const { data: removedLabels } = await db.from("project_outlook_labels")
      .select("project_id, label_code, category_name")
      .eq("company_id", companyId).not("removed_at", "is", null).is("archived_at", null);

    const allLabels = [...(activeLabels || []), ...(removedLabels || [])];
    if (!allLabels.length) continue;

    const { data: existingJobs } = await db.from("outlook_sync_jobs")
      .select("id, status, project_id, completed_users, total_users")
      .eq("job_type", "label_sync").eq("company_id", companyId);
    const existingByProject = new Map((existingJobs || []).map((j: any) => [j.project_id, j]));

    const toUpdate: string[] = [];
    const toInsert: any[] = [];
    let skippedInProgress = 0, skippedAlreadyDone = 0;

    for (const label of allLabels) {
      const existing = existingByProject.get(label.project_id) as any;
      if (existing?.status === "processing") continue;

      const completedCount = (existing?.completed_users || []).length;
      if (existing?.status === "pending" && completedCount > 0 && completedCount < (existing?.total_users || totalUsers)) {
        skippedInProgress++;
        continue;
      }

      if (existing?.status === "done" && existing.total_users === totalUsers) {
        skippedAlreadyDone++;
        continue;
      }

      if (existing) {
        toUpdate.push(existing.id);
      } else {
        toInsert.push({
          job_type: "label_sync", company_id: companyId, project_id: label.project_id,
          label_code: label.label_code, category_name: label.category_name,
          status: "pending", attempts: 0, completed_users: [], total_users: totalUsers,
        });
      }
    }

    if (toUpdate.length) {
      await db.from("outlook_sync_jobs").update({
        status: "pending", attempts: 0, error: null,
        completed_users: [], total_users: totalUsers,
        updated_at: new Date().toISOString(),
      }).in("id", toUpdate);
    }
    if (toInsert.length) {
      await db.from("outlook_sync_jobs").insert(toInsert);
    }

    queued += toUpdate.length + toInsert.length;
    console.log(`[outlook-label-sync-cron] Company ${companyId}: ${toUpdate.length} updated + ${toInsert.length} inserted + ${skippedInProgress} in-progress skipped + ${skippedAlreadyDone} already-done skipped (${totalUsers} users)`);
  }

  console.log(`[outlook-label-sync-cron] DONE in ${Date.now() - t0}ms — ${queued} jobs`);
  await heartbeat("outlook-label-sync-cron", Date.now() - t0, { queued });
  return new Response(JSON.stringify({ ok: true, queued }), {
    headers: { "Content-Type": "application/json" },
  });
});
