// supabase/functions/gmail-sync-recovery-worker/index.ts
// Every 15 min -- the ONLY thing that ever retries a user quarantined in
// gmail_sync_failures (gmail-label-sync-worker / gmail-email-sync-worker
// never retry a failed user themselves -- they quarantine and move on so a
// single rate-limited or broken account can never block the fast queue).
// Retries one (job, user) pair at a time; on success, resumes that user in
// their original job. After RECOVERY_MAX_ATTEMPTS failed retries, escalates
// to 'persistent_failure' -- surfaced in the admin "Persistent failures" tab
// so someone can go fix the underlying account issue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const RECOVERY_MAX_ATTEMPTS = 3;
// Consecutive (not cumulative) zero-progress deferrals before escalating to
// persistent_failure -- same fix as gmail-migration-worker's identical
// constant/incident.
const STALL_THRESHOLD = 3;
// Same chunk size deleteGmailLabel already parallelises removeLabelFromMessage
// calls in below -- applying labels in chunks like this instead of one at a
// time is what actually lets a fair-share slice make a real dent.
const APPLY_CHUNK_SIZE = 25;
// A large mailbox or an account still tripping Gmail's own rate limit can
// eat the whole 150s platform ceiling by itself. Without a budget check,
// the platform kills the isolate mid-loop with no chance to persist
// progress -- and since the query always orders by last_attempted_at
// ascending, the next tick just re-picks the exact same stuck item first,
// forever. Bail out with time to spare so every tick always finishes and
// writes its heartbeat.
const TIME_BUDGET_MS = 100_000;
// Floor on each item's fair-share slice (see runRecovery) so a full batch
// doesn't divide the budget down to a sliver too small to get real work
// done in.
const MIN_ITEM_BUDGET_MS = 8_000;
// Must satisfy BATCH_SIZE * MIN_ITEM_BUDGET_MS <= TIME_BUDGET_MS -- fetching
// more items than the guaranteed-minimum floor can actually fit in one tick
// means the tail of every batch gets fetched but never even attempted (the
// outer per-iteration time check breaks before reaching them), silently
// starving them every single tick regardless of how fast they'd finish.
// Derived rather than a separate literal so a future change to either
// budget constant can't reintroduce that gap by accident. (Also raises the
// old hardcoded 10 to 12 -- still comfortably inside the same 150s platform
// ceiling that motivated keeping this "small" in the first place.)
const BATCH_SIZE = Math.floor(TIME_BUDGET_MS / MIN_ITEM_BUDGET_MS);

const FETCH_TIMEOUT_MS = 15_000;
function withTimeout(): AbortSignal { return AbortSignal.timeout(FETCH_TIMEOUT_MS); }

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
      signal: withTimeout(),
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

function sanitiseLabelName(name: string): string {
  const parts = name.split("/");
  if (parts.length <= 1) return name.replace(/\//g, "-");
  const parent = parts.slice(0, -1).join("/");
  const leaf = parts[parts.length - 1].replace(/\//g, "-");
  return `${parent}/${leaf}`;
}

// ── Gmail API ──────────────────────────────────────────────────────

async function getGmailLabels(token: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` }, signal: withTimeout(),
  });
  if (!res.ok) {
    const error = await res.text().catch(() => "");
    console.error(`[sync-recovery-worker] getGmailLabels failed: ${res.status} ${error.slice(0, 300)}`);
    return [];
  }
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
  const norm = (s: string) => s.replace(/[—–‒]/g, "-").trim().toLowerCase();
  return labels.find(l => norm(l.name) === norm(labelName))?.id || null;
}

async function createLabelHierarchy(
  token: string, labelName: string, existingLabels: { id: string; name: string }[]
): Promise<string | null> {
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
        name: partial, labelListVisibility: "labelShow",
        messageListVisibility: i === parts.length ? "show" : "hide",
      }),
      signal: withTimeout(),
    });
    if (res.ok) {
      const c = await res.json();
      lastId = c.id;
      existingLabels.push(c);
    }
  }
  return lastId;
}

// `complete: false` means a page failed to load -- the caller MUST treat
// that as "this list can't be trusted", not "these are the only messages
// currently carrying the label". See gmail-migration-worker's identical
// function for the incident this fixes: a silently-truncated/empty result
// here used to make toApply look bigger than it really was, and the
// "remaining" count reported in last_error could visibly regress between
// ticks purely because this call failed, with nothing anywhere to say so.
async function getMessagesWithLabel(token: string, labelId: string): Promise<{ ids: string[]; complete: boolean }> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  let complete = true;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("labelIds", labelId);
    url.searchParams.set("maxResults", "500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: withTimeout() });
    if (!res.ok) {
      const error = await res.text().catch(() => "");
      console.error(`[sync-recovery-worker] getMessagesWithLabel failed mid-page (label=${labelId}, ${ids.length} collected so far): ${res.status} ${error.slice(0, 300)}`);
      complete = false;
      break;
    }
    const data = await res.json();
    (data.messages || []).forEach((m: any) => ids.push(m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { ids, complete };
}

// Return shape carries the failure reason, not just ok/not-ok -- mirrors
// gmail-migration-worker's identical change.
async function applyLabel(token: string, msgId: string, labelId: string): Promise<{ ok: boolean; msgId: string; status?: number; error?: string }> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [labelId] }), signal: withTimeout(),
  });
  if (res.ok) return { ok: true, msgId };
  const error = await res.text().catch(() => "");
  return { ok: false, msgId, status: res.status, error: error.slice(0, 300) };
}

async function removeLabelFromMessage(token: string, msgId: string, labelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: [labelId] }), signal: withTimeout(),
  });
  return res.ok;
}

async function deleteGmailLabel(token: string, labelId: string): Promise<void> {
  // Doesn't need `complete` -- deleting the label object below removes it
  // from every message that had it regardless of how many this per-message
  // pass got to first.
  const { ids: msgs } = await getMessagesWithLabel(token, labelId);
  if (msgs.length) {
    for (let i = 0; i < msgs.length; i += 50) {
      await Promise.all(msgs.slice(i, i + 50).map(id => removeLabelFromMessage(token, id, labelId)));
    }
  }
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: withTimeout(),
  });
}

async function userHasMessage(token: string, msgId: string): Promise<boolean> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=minimal`,
    { headers: { Authorization: `Bearer ${token}` }, signal: withTimeout() }
  );
  return res.ok;
}

async function importMessage(sourceToken: string, targetToken: string, msgId: string, labelId: string): Promise<boolean> {
  const rawRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=raw`,
    { headers: { Authorization: `Bearer ${sourceToken}` }, signal: withTimeout() }
  );
  if (!rawRes.ok) return false;
  const { raw } = await rawRes.json();
  if (!raw) return false;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/import", {
    method: "POST", headers: { Authorization: `Bearer ${targetToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw, labelIds: [labelId] }), signal: withTimeout(),
  });
  return res.ok;
}

// ── Job / logging helpers ──────────────────────────────────────────

async function markUserComplete(jobId: string, userId: string, totalUsers: number): Promise<void> {
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

async function logActivity(row: Record<string, unknown>): Promise<void> {
  try { await db.from("gmail_sync_log").insert(row); } catch (_) { /* never break recovery over logging */ }
}

// Same idempotency guard as gmail-email-sync-processor (see
// supabase/migrations/20260730170000_gmail_import_claims.sql) -- this
// worker and the processor can both attempt to import the same message for
// the same user (e.g. a job resumes here right as the fast worker also
// picks it up), so the claim, not just the per-user Gmail lock, is what
// actually prevents a duplicate copy landing in the target's mailbox.
async function claimImport(companyId: string, projectId: string, userId: string, msgId: string): Promise<boolean> {
  const { error } = await db.from("gmail_import_claims").insert({
    user_id: userId, gmail_message_id: msgId, company_id: companyId, project_id: projectId,
  });
  return !error;
}
async function releaseImportClaim(userId: string, msgId: string): Promise<void> {
  try { await db.from("gmail_import_claims").delete().eq("user_id", userId).eq("gmail_message_id", msgId); } catch (_) { /* best-effort */ }
}

// Thrown when a single failure's own work (e.g. a large mailbox with
// hundreds of messages) alone exceeds the tick's time budget. This is real
// incremental progress, not a broken account -- Gmail's label state is the
// checkpoint, so the next tick picks up wherever this one left off. Doesn't
// count against RECOVERY_MAX_ATTEMPTS, so a big mailbox can take as many
// ticks as it needs without wrongly escalating to "persistent_failure".
class BudgetDeferredError extends Error {
  deferred = true;
}

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break recovery */ }
}

function respond(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// ── Overlap guard ────────────────────────────────────────────────
// Runs on both pg_cron and a GitHub Actions backup trigger -- this table
// (shared with the label/email dispatchers) makes a second trigger source
// firing mid-run a safe no-op instead of two invocations racing to update
// the same gmail_sync_failures rows.

const LOCK_NAME = "gmail-sync-recovery-worker";
const LOCK_TTL_MS = 170_000;

async function acquireLock(): Promise<boolean> {
  const { data } = await db.from("dispatcher_locks")
    .update({ locked_until: new Date(Date.now() + LOCK_TTL_MS).toISOString() })
    .eq("name", LOCK_NAME).lt("locked_until", new Date().toISOString()).select();
  return !!data && data.length > 0;
}

async function releaseLock(): Promise<void> {
  try { await db.from("dispatcher_locks").update({ locked_until: new Date().toISOString() }).eq("name", LOCK_NAME); } catch (_) {}
}

// ── Function ──────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  console.log("[sync-recovery-worker] START");
  const t0 = Date.now();

  if (!(await acquireLock())) {
    console.log("[sync-recovery-worker] Previous tick still running -- skipping");
    return respond({ ok: true, skipped: "already_running" });
  }

  try {
    return await runRecovery(t0);
  } finally {
    await releaseLock();
  }
});

async function runRecovery(t0: number): Promise<Response> {
  const { data: failures } = await db.from("gmail_sync_failures")
    .select("*")
    .eq("status", "pending_retry")
    .order("last_attempted_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (!failures?.length) {
    console.log("[sync-recovery-worker] Nothing to retry");
    await heartbeat("gmail-sync-recovery-worker", Date.now() - t0, { retried: 0, resolved: 0, escalated: 0, deferred: 0, skipped: 0 });
    return respond({ ok: true, retried: 0, resolved: 0, escalated: 0, deferred: 0, skipped: 0 });
  }

  // A single large mailbox can eat a lot of the tick's time budget by
  // itself (see BudgetDeferredError above), so small/fast items (which is
  // most real failures -- rate limits, transient errors) should get their
  // shot first; large mailboxes are safe to push to the back since
  // deferrals don't burn RECOVERY_MAX_ATTEMPTS and make real incremental
  // progress (Gmail's label state is the checkpoint) once they do get a
  // turn. This sort alone isn't enough, though -- an item that's merely
  // "not the biggest" can still fail to finish within a full tick's budget
  // and keep re-winning the front slot forever, starving everything behind
  // it. The per-item fair-share deadline below (itemBudgetMs) is the actual
  // fix for that: it caps how much of the tick ANY one item can consume,
  // so the rest of the batch always gets a turn too.
  const projectIds = [...new Set(failures.map((f: any) => f.project_id))];
  const sizeByProject = new Map<string, number>();
  await Promise.all(projectIds.map(async (pid) => {
    const { count } = await db.from("project_emails").select("*", { count: "exact", head: true }).eq("project_id", pid);
    sizeByProject.set(pid, count || 0);
  }));
  failures.sort((a: any, b: any) => (sizeByProject.get(a.project_id) || 0) - (sizeByProject.get(b.project_id) || 0));

  let retried = 0, resolved = 0, escalated = 0, deferred = 0, skipped = 0;

  for (let i = 0; i < failures.length; i++) {
    const failure = failures[i];
    const elapsed = Date.now() - t0;
    if (elapsed > TIME_BUDGET_MS) {
      skipped = failures.length - retried;
      console.log(`[sync-recovery-worker] Time budget reached -- skipping ${skipped} untouched, deferring to next tick`);
      break;
    }
    // Fair-share pacing (same fix as gmail-migration-worker's runMigration):
    // split whatever's left of the tick budget across however many items
    // haven't been attempted yet, recomputed every iteration, instead of
    // letting the oldest/smallest item run against the FULL remaining
    // budget. Closes exactly the gap this file's own header comment above
    // (sizeByProject sort) already flagged as a residual risk -- sorting
    // smallest-first helps, but a mailbox that's merely "not the biggest"
    // can still fail to finish within budget and, since deferrals don't
    // burn RECOVERY_MAX_ATTEMPTS, keep re-winning the front slot and
    // starving everything behind it forever.
    const itemsRemaining = failures.length - i;
    const itemBudgetMs = Math.max((TIME_BUDGET_MS - elapsed) / itemsRemaining, MIN_ITEM_BUDGET_MS);
    const itemDeadline = Date.now() + itemBudgetMs;
    const {
      id: failureId, company_id: companyId, job_id: jobId, job_type: jobType,
      project_id: projectId, user_id: userId, attempts, confirmed_applied_ids: confirmedAppliedIdsRaw,
      consecutive_stall_count: consecutiveStallCount,
    } = failure;
    // Same fix as gmail-migration-worker's identical variable -- a message
    // this failure already succeeded on in a prior tick stays excluded from
    // toApply regardless of what a later Gmail list read says.
    const confirmedAppliedIds = new Set<string>(Array.isArray(confirmedAppliedIdsRaw) ? confirmedAppliedIdsRaw : []);
    retried++;
    console.log(`[sync-recovery-worker] Retrying failure=${failureId} job=${jobId} user=${userId} type=${jobType} attempt=${attempts + 1}/${RECOVERY_MAX_ATTEMPTS} budget=${Math.round(itemBudgetMs / 1000)}s`);

    // Same fix as gmail-migration-worker's identical variables/incident -- a
    // deferral that confirmed zero real progress this tick increments its
    // OWN consecutive-stall counter (separate from `attempts`, which real
    // thrown errors still use independently); STALL_THRESHOLD of these in a
    // row with no progress in between escalates to persistent_failure,
    // resetting to 0 the instant any tick makes real progress.
    let madeProgressThisTick = false;
    let stallCount = consecutiveStallCount || 0;

    let job: any = null;
    try {
      const { data } = await db.from("gmail_sync_jobs").select("*").eq("id", jobId).maybeSingle();
      job = data;
      if (!job) {
        // Parent job no longer exists -- nothing left to recover
        await db.from("gmail_sync_failures").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", failureId);
        resolved++;
        continue;
      }

      const gmailLabelName = sanitiseLabelName(job.gmail_label_name || "");
      const token = await getAccessToken(userId);
      if (!token) throw new Error("No Gmail token for this user");

      if (jobType === "label_sync") {
        const { data: dbLabel } = await db.from("project_gmail_labels")
          .select("removed_at").eq("project_id", projectId).eq("company_id", companyId).maybeSingle();
        const isRemoved = !!dbLabel?.removed_at;

        // Scoped to THIS user -- see the matching fix/comment in
        // gmail-migration-worker's label_sync branch. Each mailbox has its
        // own copy of a shared thread with its own Gmail message id; an
        // unscoped query here hands applyLabel other users' ids, which
        // 404 ("Requested entity was not found") against this token every
        // time and never leave toApply since a 404 never joins
        // gmailMsgSet/confirmed_applied_ids.
        const { data: dbEmails } = await db.from("project_emails")
          .select("gmail_message_id").eq("project_id", projectId).eq("company_id", companyId).eq("user_id", userId);
        const dbMsgIds = (dbEmails || []).map((e: any) => e.gmail_message_id);

        const gmailLabels = await getGmailLabels(token);
        const existingLabelId = findLabelId(gmailLabels, job.label_code, gmailLabelName);

        if (isRemoved) {
          if (existingLabelId) await deleteGmailLabel(token, existingLabelId);
        } else {
          let labelId = existingLabelId;
          if (!labelId) labelId = await createLabelHierarchy(token, gmailLabelName, gmailLabels);
          if (!labelId) throw new Error("Could not find or create label");
          if (dbMsgIds.length) {
            const { ids: currentlyLabelled, complete } = await getMessagesWithLabel(token, labelId);
            if (!complete) throw new BudgetDeferredError(`Could not get a complete list of currently-labelled messages (label=${labelId}) -- will retry next tick`);
            const gmailMsgSet = new Set(currentlyLabelled);
            const toApply = dbMsgIds.filter((id: string) => !gmailMsgSet.has(id) && !confirmedAppliedIds.has(id));
            // Chunked + parallel, same pattern deleteGmailLabel already uses
            // below -- applying one at a time sequentially meant a mailbox
            // with real per-call latency (large/archive mailboxes especially)
            // could exhaust an entire fair-share slice on only a handful of
            // messages, never converging even across many ticks.
            for (let c = 0; c < toApply.length; c += APPLY_CHUNK_SIZE) {
              if (Date.now() > itemDeadline) throw new BudgetDeferredError(`Item's fair-share budget (${Math.round(itemBudgetMs / 1000)}s) reached mid-mailbox (${toApply.length - c} of ${toApply.length} messages remaining) -- will resume next tick`);
              const results = await Promise.all(toApply.slice(c, c + APPLY_CHUNK_SIZE).map(msgId => applyLabel(token, msgId, labelId)));
              let chunkHadNewConfirmations = false;
              for (const r of results) if (r.ok) { confirmedAppliedIds.add(r.msgId); chunkHadNewConfirmations = true; madeProgressThisTick = true; }
              if (chunkHadNewConfirmations) {
                await db.from("gmail_sync_failures")
                  .update({ confirmed_applied_ids: [...confirmedAppliedIds] }).eq("id", failureId);
              }
            }
            if (toApply.length) {
              await db.from("project_emails").update({ gmail_label_applied: true })
                .eq("project_id", projectId).eq("company_id", companyId).eq("user_id", userId);
            }
          }
        }
      } else if (jobType === "email_sync") {
        const { data: dbEmails } = await db.from("project_emails")
          .select("gmail_message_id, user_id").eq("project_id", projectId).eq("company_id", companyId);
        const msgIds = (dbEmails || []).map((e: any) => e.gmail_message_id);

        if (msgIds.length) {
          // Per-filer source token, not one arbitrary "any other connected
          // member" -- same bug and same fix as gmail-email-sync-worker
          // (see that file's comment): Gmail message IDs are mailbox-scoped,
          // so reading a message's raw content only works via whichever
          // mailbox actually filed THAT specific message.
          const filerByMsgId: Record<string, string> = {};
          for (const e of (dbEmails || [])) filerByMsgId[e.gmail_message_id] = e.user_id;
          const distinctFilerIds = [...new Set(Object.values(filerByMsgId))].filter(id => id !== userId);
          const sourceTokensByUserId: Record<string, string> = {};
          for (const filerId of distinctFilerIds) {
            const t = await getAccessToken(filerId);
            if (t) sourceTokensByUserId[filerId] = t;
          }

          const gmailLabels = await getGmailLabels(token);
          let labelId = findLabelId(gmailLabels, job.label_code, gmailLabelName);
          if (!labelId) labelId = await createLabelHierarchy(token, gmailLabelName, gmailLabels);
          if (!labelId) throw new Error("Could not find or create label");

          const { ids: currentlyLabelled, complete: labelListComplete } = await getMessagesWithLabel(token, labelId);
          if (!labelListComplete) throw new BudgetDeferredError(`Could not get a complete list of currently-labelled messages (label=${labelId}) -- will retry next tick`);
          const labelled = new Set(currentlyLabelled);
          for (const msgId of msgIds) {
            if (labelled.has(msgId) || confirmedAppliedIds.has(msgId)) continue;
            if (Date.now() > itemDeadline) throw new BudgetDeferredError(`Item's fair-share budget (${Math.round(itemBudgetMs / 1000)}s) reached mid-mailbox (${msgIds.length} messages) -- will resume next tick`);
            const hasMsg = await userHasMessage(token, msgId);
            if (hasMsg) {
              const result = await applyLabel(token, msgId, labelId);
              if (result.ok) {
                confirmedAppliedIds.add(msgId);
                madeProgressThisTick = true;
                await db.from("gmail_sync_failures")
                  .update({ confirmed_applied_ids: [...confirmedAppliedIds] }).eq("id", failureId);
              }
              continue;
            }
            const filerToken = sourceTokensByUserId[filerByMsgId[msgId]];
            if (!filerToken) {
              // No usable Gmail connection for the filer (most commonly a
              // removed/disconnected member) -- see the matching fix/comment
              // in gmail-migration-worker's email_sync branch. There's no
              // other mailbox to read this message from, so record it
              // resolved instead of re-running a real userHasMessage network
              // call on it every tick forever.
              confirmedAppliedIds.add(msgId);
              madeProgressThisTick = true;
              await db.from("gmail_sync_failures")
                .update({ confirmed_applied_ids: [...confirmedAppliedIds] }).eq("id", failureId);
              continue;
            }
            // Claim BEFORE importing -- the actual race-proof guard against
            // gmail-email-sync-processor (or another recovery tick) also
            // importing this exact (user, message) pair concurrently.
            if (!(await claimImport(companyId, projectId, userId, msgId))) {
              // Already claimed by an earlier tick/processor -- see the
              // matching fix/comment in gmail-migration-worker's email_sync
              // branch. Without this, userHasMessage(msgId) and this same
              // failed claim attempt repeat on this id every tick forever
              // (the import created a NEW message id this loop never
              // learns), which is what let email_sync items get stuck at a
              // fixed "X messages" remaining count alongside the
              // label_sync user-scoping bug.
              //
              // madeProgressThisTick=true here too -- confirmed live
              // 2026-08-06: without it, a tick whose only advancement was
              // resolving already-claimed ids (confirmed_applied_ids
              // genuinely growing) still got counted as a zero-progress
              // stall, wrongly re-escalating jobs that were converging fine.
              confirmedAppliedIds.add(msgId);
              madeProgressThisTick = true;
              await db.from("gmail_sync_failures")
                .update({ confirmed_applied_ids: [...confirmedAppliedIds] }).eq("id", failureId);
              continue;
            }
            const ok = await importMessage(filerToken, token, msgId, labelId);
            if (ok) {
              confirmedAppliedIds.add(msgId);
              madeProgressThisTick = true;
              await db.from("gmail_sync_failures")
                .update({ confirmed_applied_ids: [...confirmedAppliedIds] }).eq("id", failureId);
            } else {
              await releaseImportClaim(userId, msgId);
            }
          }
          await db.from("project_emails").update({ gmail_label_applied: true })
            .eq("project_id", projectId).eq("company_id", companyId).eq("user_id", userId);
        }
      } else {
        throw new Error(`Recovery not supported for job_type "${jobType}"`);
      }

      // Success -- resume this user in their original job and clear the quarantine
      await markUserComplete(jobId, userId, job.total_users);
      await db.from("gmail_sync_failures").update({
        status: "resolved", resolved_at: new Date().toISOString(), last_attempted_at: new Date().toISOString(),
      }).eq("id", failureId);
      await logActivity({
        company_id: companyId, triggered_by: null, action: "sync_recovered",
        project_id: projectId, gmail_label_name: job.gmail_label_name,
        target_user_id: userId, details: { job_type: jobType },
      });
      resolved++;
      console.log(`[sync-recovery-worker] ✓ Resolved failure ${failureId}`);

    } catch (err: any) {
      if (err?.deferred && madeProgressThisTick) {
        // Real progress was made (Gmail's own label state is the checkpoint)
        // but this item alone ran out of time -- retry it next tick without
        // burning one of its RECOVERY_MAX_ATTEMPTS, and reset the stall streak.
        await db.from("gmail_sync_failures").update({
          last_error: err.message || "Deferred -- resuming next tick", consecutive_stall_count: 0,
          last_attempted_at: new Date().toISOString(),
        }).eq("id", failureId);
        deferred++;
        console.log(`[sync-recovery-worker] ⏸ Deferred (not counted as a failed attempt -- made real progress this tick, stall streak reset): ${failureId} -- ${err.message}`);
        continue;
      }
      if (err?.deferred) {
        // Deferred with confirmed zero real progress this tick -- own
        // consecutive-stall counter, separate from `attempts`, same fix as
        // gmail-migration-worker's identical branch.
        stallCount += 1;
        const stalled = stallCount >= STALL_THRESHOLD;
        await db.from("gmail_sync_failures").update({
          status: stalled ? "persistent_failure" : "pending_retry",
          consecutive_stall_count: stallCount, last_error: err.message || "Deferred -- resuming next tick",
          last_attempted_at: new Date().toISOString(),
        }).eq("id", failureId);
        if (stalled) {
          escalated++;
          await logActivity({
            company_id: companyId, triggered_by: null, action: "sync_failed",
            project_id: projectId, gmail_label_name: job?.gmail_label_name || null,
            target_user_id: userId, details: { job_type: jobType, error: err.message, reason: "consecutive_stall" },
          });
          console.error(`[sync-recovery-worker] ✗ Escalated to persistent_failure after ${stallCount} consecutive zero-progress ticks: ${failureId} -- ${err.message}`);
        } else {
          deferred++;
          console.log(`[sync-recovery-worker] ⏸ Deferred with ZERO progress (stall ${stallCount}/${STALL_THRESHOLD}): ${failureId} -- ${err.message}`);
        }
        continue;
      }

      const nextAttempts = attempts + 1;
      const isPersistent = nextAttempts >= RECOVERY_MAX_ATTEMPTS;
      await db.from("gmail_sync_failures").update({
        status: isPersistent ? "persistent_failure" : "pending_retry",
        attempts: nextAttempts, last_error: err.message || "Unknown error",
        last_attempted_at: new Date().toISOString(),
      }).eq("id", failureId);

      if (isPersistent) {
        escalated++;
        await logActivity({
          company_id: companyId, triggered_by: null, action: "sync_failed",
          project_id: projectId, gmail_label_name: job?.gmail_label_name || null,
          target_user_id: userId, details: { job_type: jobType, error: err.message },
        });
        console.error(`[sync-recovery-worker] ✗ Escalated to persistent_failure: ${failureId} -- ${err.message}`);
      } else {
        console.error(`[sync-recovery-worker] ✗ Retry failed (${nextAttempts}/${RECOVERY_MAX_ATTEMPTS}): ${failureId} -- ${err.message}`);
      }
    }
  }

  console.log(`[sync-recovery-worker] DONE in ${Date.now() - t0}ms -- retried=${retried} resolved=${resolved} escalated=${escalated} deferred=${deferred} skipped=${skipped}`);
  await heartbeat("gmail-sync-recovery-worker", Date.now() - t0, { retried, resolved, escalated, deferred, skipped });
  return respond({ ok: true, retried, resolved, escalated, deferred, skipped });
}
