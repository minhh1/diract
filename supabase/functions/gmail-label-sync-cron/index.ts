import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 20;

// ── Token ──────────────────────────────────────────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db.from("user_gmail_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId).single();
  if (!data) return null;

  if (new Date(data.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: googleClientId, client_secret: googleClientSecret,
        refresh_token: data.refresh_token, grant_type: "refresh_token",
      }),
    });
    const r = await res.json();
    if (!r.access_token) return null;
    await db.from("user_gmail_tokens").update({
      access_token: r.access_token,
      token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
    }).eq("user_id", userId);
    return r.access_token;
  }
  return data.access_token;
}

// ── Label name helpers ─────────────────────────────────────────────

// Strip "/" from the leaf label name (part after last /)
// e.g. "Huynh Lawyers/260576 -- A/B Test [CODE]"
//   → "Huynh Lawyers/260576 -- A-B Test [CODE]"
function sanitiseLabelName(name: string): string {
  const parts = name.split("/");
  if (parts.length <= 1) return name.replace(/\//g, "-");
  const parent = parts.slice(0, -1).join("/");
  const leaf = parts[parts.length - 1].replace(/\//g, "-");
  return `${parent}/${leaf}`;
}

// Normalise subject for matching (strip Re:/Fwd:, lowercase, trim)
function normaliseSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd?|fw|aw|antw|tr|sv|vs|rv|ref):\s*/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── Gmail API ──────────────────────────────────────────────────────

async function getGmailLabels(token: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return (await res.json()).labels || [];
}

function findLabelId(
  labels: { id: string; name: string }[],
  labelCode: string | null,
  labelName: string
): string | null {
  if (labelCode) {
    const byCode = labels.find(l => l.name.includes(`[${labelCode}]`));
    if (byCode) return byCode.id;
  }
  const norm = (s: string) => s.replace(/[\u2014\u2013\u2012]/g, "-").trim().toLowerCase();
  return labels.find(l => norm(l.name) === norm(labelName))?.id || null;
}

async function createLabelHierarchy(
  token: string,
  labelName: string,
  existingLabels: { id: string; name: string }[]
): Promise<string | null> {
  // Sanitise before creating
  const safeName = sanitiseLabelName(labelName);
  const parts = safeName.split("/");
  let lastId: string | null = null;

  for (let i = 1; i <= parts.length; i++) {
    const partial = parts.slice(0, i).join("/");
    const found = existingLabels.find(l => l.name === partial);
    if (found) { lastId = found.id; continue; }

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name: partial,
        labelListVisibility: "labelShow",
        messageListVisibility: i === parts.length ? "show" : "hide",
      }),
    });
    if (res.ok) {
      const c = await res.json();
      lastId = c.id;
      existingLabels.push(c);
    }
  }
  return lastId;
}

async function getMessagesWithLabel(token: string, labelId: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("labelIds", labelId);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    (data.messages || []).forEach((m: any) => ids.push(m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function applyLabelToMessage(token: string, msgId: string, labelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  return res.ok;
}

async function removeLabelFromMessage(token: string, msgId: string, labelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: [labelId] }),
  });
  return res.ok;
}

async function deleteGmailLabel(token: string, labelId: string): Promise<void> {
  const msgs = await getMessagesWithLabel(token, labelId);
  if (msgs.length) {
    for (let i = 0; i < msgs.length; i += 50) {
      await Promise.all(msgs.slice(i, i + 50).map(id =>
        removeLabelFromMessage(token, id, labelId)
      ));
    }
  }
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
}

async function userHasMessage(token: string, msgId: string): Promise<boolean> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=minimal`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.ok;
}

async function importMessage(
  sourceToken: string, targetToken: string,
  msgId: string, labelId: string
): Promise<boolean> {
  const rawRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=raw`,
    { headers: { Authorization: `Bearer ${sourceToken}` } }
  );
  if (!rawRes.ok) return false;
  const { raw } = await rawRes.json();
  if (!raw) return false;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/import", {
    method: "POST",
    headers: { Authorization: `Bearer ${targetToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, labelIds: [labelId, "INBOX"] }),
  });
  return res.ok;
}

async function getMessageSubject(token: string, msgId: string): Promise<string | null> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const subjectHeader = (data.payload?.headers || []).find((h: any) => h.name === "Subject");
  return subjectHeader?.value || null;
}

// ── Job helpers ────────────────────────────────────────────────────

async function markUserComplete(jobId: string, userId: string, totalUsers: number): Promise<void> {
  // Append userId to completed_users array
  // Mark job done only when all users completed
  const { data: job } = await db.from("gmail_sync_jobs")
    .select("completed_users, total_users").eq("id", jobId).single();
  if (!job) return;

  const completed: string[] = job.completed_users || [];
  if (!completed.includes(userId)) completed.push(userId);

  const allDone = completed.length >= (job.total_users || totalUsers);
  await db.from("gmail_sync_jobs").update({
    completed_users: completed,
    status: allDone ? "done" : "processing",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);
}

async function markUserFailed(jobId: string, error: string, attempts: number): Promise<void> {
  await db.from("gmail_sync_jobs").update({
    status: attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
    attempts: attempts + 1,
    error,
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);
}

async function removeUserFromCompleted(
  companyId: string, projectId: string, userId: string, jobType: string
): Promise<void> {
  const { data: job } = await db.from("gmail_sync_jobs")
    .select("id, completed_users")
    .eq("job_type", jobType)
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!job) return;

  const completed = (job.completed_users || []).filter((u: string) => u !== userId);
  await db.from("gmail_sync_jobs").update({
    completed_users: completed,
    status: "pending", // needs re-processing for this user
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
}

function respond(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}

// ── Label rename detection ──────────────────────────────────────────
// Recomputes what each active label's name SHOULD currently be from live
// source data (project name + matter number custom field value), the exact
// same formula lib/gmail/createProjectLabel.ts uses at creation time --
// reusing the label's EXISTING label_code, never regenerating it (that's
// the stable identifier the processor matches on, see
// gmail-label-sync-processor's findLabelId). A label whose stored
// gmail_label_name no longer matches this needs both the DB row and every
// connected user's actual Gmail label renamed -- e.g. a matter number
// correction made directly in the database (as opposed to through a normal
// edit) never had anything else to trigger a resync.
async function computeExpectedLabelNames(
  companyId: string,
  company: { gmail_parent_label: string | null; gmail_parent_code: string | null; gmail_label_tokens: string[] | null; gmail_sublabel_separator: string | null },
  projectIds: string[]
): Promise<Map<string, { fullLabelName: string; sublabel: string }>> {
  const result = new Map<string, { fullLabelName: string; sublabel: string }>();
  if (!projectIds.length) return result;

  const parentLabel = company.gmail_parent_label || "Shared Emails";
  const parentCode = company.gmail_parent_code || "";
  const parentFull = parentCode ? `${parentLabel} #${parentCode}` : parentLabel;
  const tokens: string[] = company.gmail_label_tokens || ["project_name"];
  const separator: string = company.gmail_sublabel_separator || " -- ";

  const { data: projects } = await db.from("projects").select("id, name").in("id", projectIds);
  const projectById = new Map((projects || []).map((p: any) => [p.id, p]));

  const matterByProject = new Map<string, string>();
  if (tokens.includes("matter_number")) {
    const { data: matterField } = await db
      .from("company_custom_fields").select("id")
      .eq("company_id", companyId).eq("table_name", "projects")
      .ilike("label", "%matter%number%").is("deleted_at", null).maybeSingle();
    if (matterField) {
      const { data: matterVals } = await db
        .from("company_custom_field_values").select("record_id, value_text")
        .eq("field_id", matterField.id).in("record_id", projectIds);
      (matterVals || []).forEach((v: any) => { if (v.value_text) matterByProject.set(v.record_id, v.value_text); });
    }
  }

  const labelCodeByProject = new Map<string, string>();
  const { data: labelRows } = await db.from("project_gmail_labels")
    .select("project_id, label_code").in("project_id", projectIds).is("removed_at", null);
  (labelRows || []).forEach((l: any) => { if (l.label_code) labelCodeByProject.set(l.project_id, l.label_code); });

  for (const projectId of projectIds) {
    const project = projectById.get(projectId);
    const labelCode = labelCodeByProject.get(projectId);
    if (!project || !labelCode) continue; // no label_code to anchor on -- can't safely recompute

    const parts = tokens.map((t: string) => {
      if (t === "project_name") return project.name;
      if (t === "matter_number") return matterByProject.get(projectId) || "";
      if (t === "year") return new Date().getFullYear().toString();
      return t;
    }).filter(Boolean);
    const cleanParts = parts.map((p: string) => p.replace(/\//g, ","));
    const sublabel = cleanParts.join(separator) + ` [${labelCode}]`;
    result.set(projectId, { fullLabelName: `${parentFull}/${sublabel}`, sublabel });
  }
  return result;
}

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break sync over a heartbeat write */ }
}

// ── Function ──────────────────────────────────────────────────────

// supabase/functions/gmail-label-sync-cron/index.ts
// Every 15 min -- upserts one label_sync job per project per company
// Worker handles per-user processing and tracks completion


Deno.serve(async (_req) => {
  console.log("[label-sync-cron] START");
  const t0 = Date.now();
  let queued = 0;

  const { data: companies } = await db
    .from("companies")
    .select("id, gmail_parent_label, gmail_parent_code, gmail_label_tokens, gmail_sublabel_separator")
    .not("gmail_parent_label", "is", null);

  for (const company of (companies || [])) {
    const companyId = company.id;

    // Count connected users for this company
    const { data: members } = await db
      .from("company_memberships")
      .select("user_id")
      .eq("company_id", companyId);

    const connectedUserIds: string[] = [];
    for (const { user_id } of (members || [])) {
      const { data: t } = await db.from("user_gmail_tokens")
        .select("user_id").eq("user_id", user_id).maybeSingle();
      if (t) connectedUserIds.push(user_id);
    }
    if (!connectedUserIds.length) continue;
    const totalUsers = connectedUserIds.length;

    // Get active labels -- archived projects are owned exclusively by
    // gmail-archive-worker, never touched by the ordinary sync path
    const { data: activeLabels } = await db
      .from("project_gmail_labels")
      .select("project_id, label_code, gmail_label_name")
      .eq("company_id", companyId)
      .is("removed_at", null)
      .is("archived_at", null);

    // Get removed labels (need cleanup) -- skip ones already handled by archiving
    const { data: removedLabels } = await db
      .from("project_gmail_labels")
      .select("project_id, label_code, gmail_label_name, removed_at")
      .eq("company_id", companyId)
      .not("removed_at", "is", null)
      .is("archived_at", null);

    const allLabels = [
      ...(activeLabels || []),
      ...(removedLabels || []),
    ];

    if (!allLabels.length) continue;

    // Detect labels whose stored name has drifted from what the source data
    // (project name / matter number) currently says it should be -- e.g. a
    // matter number corrected directly in the database, or a project
    // rename, neither of which has any other trigger to resync from. Only
    // checked against active labels; a removed label is about to be
    // deleted outright, its name doesn't matter.
    const expectedNames = await computeExpectedLabelNames(companyId, company, (activeLabels || []).map((l: any) => l.project_id));
    const renamedProjectIds = new Set<string>();
    for (const label of (activeLabels || []) as any[]) {
      const expected = expectedNames.get(label.project_id);
      if (!expected || expected.fullLabelName === label.gmail_label_name) continue;
      renamedProjectIds.add(label.project_id);
      await db.from("project_gmail_labels")
        .update({ gmail_label_name: expected.fullLabelName, label_sub: expected.sublabel })
        .eq("project_id", label.project_id).eq("company_id", companyId).is("removed_at", null);
      // Keep working against the corrected name for the rest of this tick
      // (job payloads below), not the stale value already in `label`.
      label.gmail_label_name = expected.fullLabelName;
    }
    if (renamedProjectIds.size) {
      console.log(`[label-sync-cron] Company ${companyId}: ${renamedProjectIds.size} label(s) renamed to match current source data`);
    }

    // Batch fetch ALL existing jobs for this company in one query
    const { data: existingJobs } = await db.from("gmail_sync_jobs")
      .select("id, status, project_id, completed_users, total_users, updated_at")
      .eq("job_type", "label_sync")
      .eq("company_id", companyId);

    const existingByProject = new Map((existingJobs || []).map((j: any) => [j.project_id, j]));

    // Build updates and inserts in bulk
    const toUpdate: string[] = [];
    const toInsert: any[] = [];
    // Separate, typically-tiny list -- a rename never touches more than a
    // handful of projects per tick, so these get their own individual
    // updates (they need a per-row gmail_label_name, which the uniform
    // bulk update below can't express) without giving up that bulk path's
    // single-query update for the common (no rename) case.
    const toRename: { id: string; gmail_label_name: string }[] = [];
    let skippedInProgress = 0, skippedAlreadyDone = 0;

    for (const label of allLabels) {
      const existing = existingByProject.get(label.project_id) as any;
      if (existing?.status === "processing") continue;

      // Skip partially completed jobs -- don't wipe progress
      const completedCount = (existing?.completed_users || []).length;
      if (existing?.status === "pending" && completedCount > 0 && completedCount < (existing?.total_users || totalUsers)) {
        skippedInProgress++;
        continue;
      }

      // A "done" job also needs redoing if the label was removed AFTER that
      // job last completed -- otherwise a job that finished applying the
      // label (completed_users full, status "done") stays "done" forever
      // once someone deletes the label, since total_users alone never
      // changes just because a label was removed. That silently stopped
      // the removal from ever reaching anyone but whoever did the
      // deleting (their own copy is handled synchronously elsewhere) -
      // every other connected user's mailbox kept the "deleted" label
      // forever. Confirmed in production 2026-07-29/30 (matter 260598):
      // job marked done at 06:50 (the original create), label removed_at
      // 07:03, job never reset since total_users (8) never changed.
      const removalMissed = !!(label as any).removed_at && existing?.status === "done"
        && new Date((label as any).removed_at).getTime() > new Date(existing.updated_at).getTime();

      // Same idea as removalMissed, but for a name that drifted from
      // current source data (see computeExpectedLabelNames above) --
      // otherwise an already-"done" job for this project would never get
      // requeued at all, since total_users alone wouldn't have changed.
      const renameMissed = renamedProjectIds.has(label.project_id);

      // A job that's already "done" and reflects the label's current state
      // only needs redoing if the company's connected-member count changed
      // since (someone joined/connected Gmail and needs the label too) -
      // otherwise leave it alone. This used to reset EVERY done job to
      // pending on EVERY 15-min sweep unconditionally, which meant the
      // whole system was perpetually re-verifying every label against every
      // user's mailbox forever -- the real cause of most of the
      // load/starvation issues chased down on 2026-07-21/22, not just a
      // symptom of them.
      if (existing?.status === "done" && existing.total_users === totalUsers && !removalMissed && !renameMissed) {
        skippedAlreadyDone++;
        continue;
      }

      if (existing) {
        toUpdate.push(existing.id);
        if (renameMissed) toRename.push({ id: existing.id, gmail_label_name: label.gmail_label_name });
      } else {
        toInsert.push({
          job_type: "label_sync",
          company_id: companyId,
          project_id: label.project_id,
          label_code: label.label_code,
          gmail_label_name: label.gmail_label_name,
          status: "pending",
          attempts: 0,
          completed_users: [],
          total_users: totalUsers,
        });
      }
    }

    // Bulk update fully reset jobs (completed or fresh)
    if (toUpdate.length) {
      await db.from("gmail_sync_jobs").update({
        status: "pending", attempts: 0, error: null,
        completed_users: [], total_users: totalUsers,
        updated_at: new Date().toISOString(),
      }).in("id", toUpdate);
    }

    // Correct the (rare) renamed jobs' own gmail_label_name -- separate
    // from the bulk reset above since each one's value differs.
    if (toRename.length) {
      await Promise.all(toRename.map(r =>
        db.from("gmail_sync_jobs").update({ gmail_label_name: r.gmail_label_name }).eq("id", r.id)
      ));
    }

    // Bulk insert new jobs
    if (toInsert.length) {
      await db.from("gmail_sync_jobs").insert(toInsert);
    }

    queued += toUpdate.length + toInsert.length;
    console.log(`[label-sync-cron] Company ${companyId}: ${toUpdate.length} updated + ${toInsert.length} inserted + ${skippedInProgress} in-progress skipped + ${skippedAlreadyDone} already-done skipped (${totalUsers} users)`);
  }

  console.log(`[label-sync-cron] DONE in ${Date.now() - t0}ms -- ${queued} jobs`);
  await heartbeat("gmail-label-sync-cron", Date.now() - t0, { queued });
  return new Response(JSON.stringify({ ok: true, queued }), {
    headers: { "Content-Type": "application/json" },
  });
});