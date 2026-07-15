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

// supabase/functions/gmail-email-sync-worker/index.ts
// Every 1 min — picks 20 email_sync jobs, imports emails to users


async function applyLabel(token: string, msgId: string, labelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }),
  });
  return res.ok;
}

Deno.serve(async (_req) => {
  console.log("[email-sync-worker] START");
  const t0 = Date.now();

  const { data: jobs } = await db.from("gmail_sync_jobs")
    .select("*").eq("job_type", "email_sync").in("status", ["pending", "processing"])
    .lt("attempts", MAX_ATTEMPTS).order("created_at", { ascending: true }).limit(BATCH_SIZE);

  if (!jobs?.length) {
    console.log("[email-sync-worker] No pending jobs");
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { "Content-Type": "application/json" } });
  }

  console.log(`[email-sync-worker] Processing ${jobs.length} jobs`);
  let processed = 0;

  for (const job of jobs) {
    const { id: jobId, company_id: companyId, project_id: projectId, label_code: labelCode, gmail_label_name: rawName, completed_users, total_users, attempts } = job;
    const gmailLabelName = sanitiseLabelName(rawName || "");

    try {
      // Get connected users not yet processed
      const { data: members } = await db.from("company_memberships").select("user_id").eq("company_id", companyId);
      const allUserIds: string[] = [];
      for (const { user_id } of (members || [])) {
        const { data: t } = await db.from("user_gmail_tokens").select("user_id").eq("user_id", user_id).maybeSingle();
        if (t) allUserIds.push(user_id);
      }

      const completedSet = new Set(completed_users || []);
      const pendingUsers = allUserIds.filter(id => !completedSet.has(id));
      if (!pendingUsers.length) {
        await db.from("gmail_sync_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", jobId);
        continue;
      }

      // Get all emails for this project — include subject to detect NULL rows needing backfill
      const { data: dbEmails } = await db.from("project_emails")
        .select("gmail_message_id, subject").eq("project_id", projectId).eq("company_id", companyId);
      const msgIds = (dbEmails || []).map((e: any) => e.gmail_message_id);
      const nullSubjectIds = new Set((dbEmails || []).filter((e: any) => !e.subject).map((e: any) => e.gmail_message_id));
      if (!msgIds.length) {
        await db.from("gmail_sync_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", jobId);
        continue;
      }

      // Get source user token (first connected user)
      const sourceUserId = allUserIds[0];
      const sourceToken = await getAccessToken(sourceUserId);

      // Backfill metadata for NULL rows using source user token
      if (nullSubjectIds.size > 0 && sourceToken) {
        console.log(`[email-sync-worker] Backfilling metadata for ${nullSubjectIds.size} emails`);
        for (const msgId of nullSubjectIds) {
          const res = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${sourceToken}` } }
          );
          if (!res.ok) continue;
          const md = await res.json();
          const headers = md?.payload?.headers || [];
          const get = (n: string) => headers.find((h: any) => h.name === n)?.value || null;
          const fromRaw = get("From");
          let from_name = null, from_address = null;
          if (fromRaw) {
            const m = fromRaw.match(/^(.+?)\s*<([^>]+)>/);
            if (m) { from_name = m[1].replace(/^"|"$/g, "").trim(); from_address = m[2].trim(); }
            else { from_address = fromRaw.trim(); }
          }
          const dateRaw = get("Date");
          let date = null;
          try { if (dateRaw) date = new Date(dateRaw).toISOString(); } catch {}
          await db.from("project_emails").update({
            subject: get("Subject"), from_address, from_name,
            date, snippet: md?.snippet || null,
            gmail_thread_id: md?.threadId || msgId,
          }).eq("gmail_message_id", msgId).eq("project_id", projectId);
        }
      }

      for (const userId of pendingUsers) {
        const token = await getAccessToken(userId);
        if (!token) { console.log(`[email-sync-worker] No token for ${userId}`); continue; }

        // Find or create label
        const gmailLabels = await getGmailLabels(token);
        let labelId = findLabelId(gmailLabels, labelCode, gmailLabelName);
        if (!labelId) labelId = await createLabelHierarchy(token, gmailLabelName, gmailLabels);
        if (!labelId) { console.error(`[email-sync-worker] Cannot find/create label for ${userId}`); continue; }

        // Get emails already in this Gmail label
        const labelled = new Set(await getMessagesWithLabel(token, labelId));

        let imported = 0, applied = 0, skipped = 0;
        for (const msgId of msgIds) {
          if (labelled.has(msgId)) { skipped++; continue; }

          const hasMsg = await userHasMessage(token, msgId);
          if (hasMsg) {
            const ok = await applyLabel(token, msgId, labelId);
            if (ok) applied++;
          } else if (sourceToken && userId !== sourceUserId) {
            const ok = await importMessage(sourceToken, token, msgId, labelId);
            if (ok) imported++;
          }
        }

        console.log(`[email-sync-worker] User ${userId} label "${gmailLabelName}": applied=${applied} imported=${imported} skipped=${skipped}`);

        // Update project_emails for this user
        if (applied + imported > 0) {
          await db.from("project_emails").update({ gmail_label_applied: true })
            .eq("project_id", projectId).eq("company_id", companyId).eq("user_id", userId);
        }

        await markUserComplete(jobId, userId, total_users || allUserIds.length);
        processed++;
      }

    } catch (err: any) {
      console.error(`[email-sync-worker] Error job ${jobId}:`, err.message);
      await db.from("gmail_sync_jobs").update({
        status: attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts: attempts + 1, error: err.message, updated_at: new Date().toISOString(),
      }).eq("id", jobId);
    }
  }

  const { count: remaining } = await db.from("gmail_sync_jobs")
    .select("*", { count: "exact", head: true }).eq("job_type", "email_sync").eq("status", "pending");

  console.log(`[email-sync-worker] DONE in ${Date.now() - t0}ms — processed=${processed} remaining=${remaining}`);
  return new Response(JSON.stringify({ ok: true, processed, remaining }), { headers: { "Content-Type": "application/json" } });
});