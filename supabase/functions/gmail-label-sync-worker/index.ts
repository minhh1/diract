import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 50; // increased from 20 — label creation is fast

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
// e.g. "Huynh Lawyers/260576 — A/B Test [CODE]"
//   → "Huynh Lawyers/260576 — A-B Test [CODE]"
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

// ── Function ──────────────────────────────────────────────────────

// supabase/functions/gmail-label-sync-worker/index.ts
// Every 1 min — picks 20 label_sync jobs, processes per user


async function applyLabel(token: string, msgId: string, labelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  return res.ok;
}

Deno.serve(async (_req) => {
  console.log("[label-sync-worker] ========== START ==========");
  const t0 = Date.now();

  // Fetch jobs in priority order:
  // 1. Jobs with 0 completed_users (brand new — create label ASAP)
  // 2. Jobs that are processing (partially done — finish them)
  // 3. Everything else oldest first
  const { data: newJobs } = await db
    .from("gmail_sync_jobs")
    .select("*")
    .eq("job_type", "label_sync")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .eq("completed_users", "[]") // never started
    .order("updated_at", { ascending: false }) // newest first
    .limit(BATCH_SIZE);

  const { data: processingJobs } = await db
    .from("gmail_sync_jobs")
    .select("*")
    .eq("job_type", "label_sync")
    .eq("status", "processing")
    .lt("attempts", MAX_ATTEMPTS)
    .limit(10);

  const { data: oldJobs } = await db
    .from("gmail_sync_jobs")
    .select("*")
    .eq("job_type", "label_sync")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .neq("completed_users", "[]") // partially done
    .order("updated_at", { ascending: true })
    .limit(10);

  // Deduplicate and combine: new first, then processing, then old
  const seen = new Set<string>();
  const jobs: any[] = [];
  for (const j of [...(newJobs || []), ...(processingJobs || []), ...(oldJobs || [])]) {
    if (!seen.has(j.id)) { seen.add(j.id); jobs.push(j); }
    if (jobs.length >= BATCH_SIZE) break;
  }

  console.log(`[label-sync-worker] Jobs: new=${newJobs?.length||0} processing=${processingJobs?.length||0} old=${oldJobs?.length||0} total=${jobs.length}`);

  if (!jobs?.length) {
    console.log("[label-sync-worker] No pending jobs");
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  let processed = 0;

  for (const job of jobs) {
    const { id: jobId, company_id: companyId, project_id: projectId, label_code: labelCode, gmail_label_name: rawLabelName, completed_users, total_users, attempts } = job;
    const gmailLabelName = sanitiseLabelName(rawLabelName || "");
    console.log(`[label-sync-worker] ── Job ${jobId} label=[${labelCode}] "${gmailLabelName}" attempts=${attempts} completed=${(completed_users||[]).length}/${total_users}`);

    try {
      // Get company info
      const { data: company, error: companyErr } = await db.from("companies")
        .select("gmail_parent_label").eq("id", companyId).single();
      console.log(`[label-sync-worker] company="${company?.gmail_parent_label}"${companyErr ? ' err='+companyErr.message : ''}`);
      if (!company?.gmail_parent_label) {
        await db.from("gmail_sync_jobs").update({ status: "failed", error: "No gmail_parent_label", updated_at: new Date().toISOString() }).eq("id", jobId);
        continue;
      }

      // Get all connected users for this company
      const { data: members, error: membersErr } = await db.from("company_memberships")
        .select("user_id").eq("company_id", companyId);
      console.log(`[label-sync-worker] members=${members?.length || 0}${membersErr ? ' err='+membersErr.message : ''}`);

      const allUserIds: string[] = [];
      for (const { user_id } of (members || [])) {
        const { data: t } = await db.from("user_gmail_tokens").select("user_id, email").eq("user_id", user_id).maybeSingle();
        if (t) allUserIds.push(user_id);
      }
      console.log(`[label-sync-worker] connectedUsers=${allUserIds.length}`);

      const completedSet = new Set(completed_users || []);
      const pendingUsers = allUserIds.filter(id => !completedSet.has(id));
      console.log(`[label-sync-worker] pendingUsers=${pendingUsers.length} alreadyDone=${completedSet.size}`);

      if (!pendingUsers.length) {
        console.log(`[label-sync-worker] All users done — marking job done`);
        await db.from("gmail_sync_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", jobId);
        continue;
      }

      // Check if label is removed in DB
      const { data: dbLabel, error: labelErr } = await db.from("project_gmail_labels")
        .select("removed_at").eq("project_id", projectId).eq("company_id", companyId).maybeSingle();
      const isRemoved = !!dbLabel?.removed_at;
      console.log(`[label-sync-worker] isRemoved=${isRemoved}${labelErr ? ' err='+labelErr.message : ''}`);

      // Get project emails from DB
      const { data: dbEmails, error: emailsErr } = await db.from("project_emails")
        .select("gmail_message_id").eq("project_id", projectId).eq("company_id", companyId);
      const dbMsgIds = (dbEmails || []).map((e: any) => e.gmail_message_id);
      console.log(`[label-sync-worker] dbEmails=${dbMsgIds.length}${emailsErr ? ' err='+emailsErr.message : ''}`);

      // Fast path — if no emails and label not removed, just create label for each user
      // Skip the slow getMessagesWithLabel call
      const fastPath = !isRemoved && dbMsgIds.length === 0;

      // Process each pending user
      for (const userId of pendingUsers) {
        console.log(`[label-sync-worker] Processing user ${userId}`);

        const token = await getAccessToken(userId);
        if (!token) {
          console.log(`[label-sync-worker] ✗ No token for user ${userId} — skipping`);
          await markUserComplete(jobId, userId, total_users || allUserIds.length);
          continue;
        }

        // Safety check
        const { data: memberCheck } = await db.from("company_memberships")
          .select("user_id").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
        if (!memberCheck) {
          console.error(`[label-sync-worker] ✗ SKIP user ${userId} — not a member of company ${companyId}`);
          continue;
        }

        const gmailLabels = await getGmailLabels(token);
        console.log(`[label-sync-worker] User ${userId}: ${gmailLabels.length} Gmail labels`);

        const existingLabelId = findLabelId(gmailLabels, labelCode, gmailLabelName);
        console.log(`[label-sync-worker] existingLabelId=${existingLabelId || 'NOT FOUND'}`);

        if (isRemoved) {
          if (existingLabelId) {
            console.log(`[label-sync-worker] Removing "${gmailLabelName}" from user ${userId}`);
            await deleteGmailLabel(token, existingLabelId);
            console.log(`[label-sync-worker] ✓ Removed`);
          } else {
            console.log(`[label-sync-worker] Label already absent for user ${userId}`);
          }
        } else if (fastPath) {
          // Fast path — just ensure label exists, no email sync needed
          if (!existingLabelId) {
            console.log(`[label-sync-worker] Fast path: Creating "${gmailLabelName}" for user ${userId}`);
            const newId = await createLabelHierarchy(token, gmailLabelName, gmailLabels);
            console.log(`[label-sync-worker] Fast path: Created=${newId || 'FAILED'}`);
          } else {
            console.log(`[label-sync-worker] Fast path: Label exists ${existingLabelId}`);
          }
        } else {
          let labelId = existingLabelId;
          if (!labelId) {
            console.log(`[label-sync-worker] Creating "${gmailLabelName}" for user ${userId}`);
            labelId = await createLabelHierarchy(token, gmailLabelName, gmailLabels);
            console.log(`[label-sync-worker] Created labelId=${labelId || 'FAILED'}`);
          } else {
            console.log(`[label-sync-worker] Label already exists: ${labelId}`);
          }

          if (labelId) {
            if (dbMsgIds.length === 0) {
              console.log(`[label-sync-worker] No emails to apply for this project`);
            } else {
              const gmailMsgSet = new Set(await getMessagesWithLabel(token, labelId));
              console.log(`[label-sync-worker] Gmail has ${gmailMsgSet.size} msgs with label, DB has ${dbMsgIds.length}`);
              const toApply = dbMsgIds.filter(id => !gmailMsgSet.has(id));
              console.log(`[label-sync-worker] Need to apply label to ${toApply.length} messages`);
              let applied = 0, applyFailed = 0;
              for (const msgId of toApply) {
                const ok = await applyLabel(token, msgId, labelId);
                if (ok) applied++; else applyFailed++;
              }
              console.log(`[label-sync-worker] Applied=${applied} failed=${applyFailed}`);
              if (applied > 0) {
                await db.from("project_emails").update({ gmail_label_applied: true })
                  .eq("project_id", projectId).eq("company_id", companyId).eq("user_id", userId);
              }
            }
          } else {
            console.error(`[label-sync-worker] ✗ Could not find or create label for user ${userId}`);
          }
        }

        await markUserComplete(jobId, userId, total_users || allUserIds.length);
        console.log(`[label-sync-worker] ✓ User ${userId} marked complete`);
        processed++;
      }

    } catch (err: any) {
      console.error(`[label-sync-worker] ✗ Error job ${jobId}:`, err.message, err.stack);
      await db.from("gmail_sync_jobs").update({
        status: attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts: attempts + 1, error: err.message,
        updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
  }

  const { count: remaining } = await db.from("gmail_sync_jobs")
    .select("*", { count: "exact", head: true }).eq("job_type", "label_sync").eq("status", "pending");

  console.log(`[label-sync-worker] DONE in ${Date.now() - t0}ms — processed=${processed} remaining=${remaining}`);
  return new Response(JSON.stringify({ ok: true, processed, remaining }), { headers: { "Content-Type": "application/json" } });
});