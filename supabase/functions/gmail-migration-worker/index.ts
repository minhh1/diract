// supabase/functions/gmail-migration-worker/index.ts
// Every 5 min -- the dedicated slow lane for LARGE (job, user) backlogs
// (message_count > MIGRATION_THRESHOLD in gmail-email-sync-worker /
// gmail-label-sync-worker, see 20260804040000_gmail_migration_lane.sql for
// the incident this fixes), routed here directly instead of ever being
// attempted by the fast lane and quarantining into gmail_sync_failures -
// that table stays reserved for genuinely transient failures (rate limits,
// timeouts) that gmail-sync-recovery-worker can clear in one retry, so a
// one-time historical backlog can never again starve daily sync for
// everyone waiting behind it.
//
// Structurally a near-copy of gmail-sync-recovery-worker's per-message loop
// (same BudgetDeferredError mid-mailbox deferral, same claim-based import
// idempotency) -- the two are kept separate rather than merged into one
// parameterised worker because they read from different tables with
// different queueing semantics (this one needs message_count for its
// smallest-first sort; recovery needs job_id/user_id to look up
// gmail_sync_jobs). Success here still writes to the SAME gmail_sync_jobs.
// completed_users the fast lane and recovery worker both use, so nothing
// about existing job-completion bookkeeping changes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const MAX_ATTEMPTS = 3;
// Same chunk size deleteGmailLabel already parallelises removeLabelFromMessage
// calls in below -- applying labels in chunks like this instead of one at a
// time is what actually lets a fair-share slice make a real dent.
const APPLY_CHUNK_SIZE = 25;
// Bigger than recovery's 100s -- this worker exists specifically to make a
// dedicated dent in large backlogs, not to leave headroom for something
// else sharing the tick.
const TIME_BUDGET_MS = 130_000;
// Floor on each item's fair-share slice (see runMigration) so a batch full
// of items doesn't divide the budget down to a sliver too small to get any
// real work done in.
const MIN_ITEM_BUDGET_MS = 10_000;
// Must satisfy BATCH_SIZE * MIN_ITEM_BUDGET_MS <= TIME_BUDGET_MS -- fetching
// more items than the guaranteed-minimum floor can actually fit in one tick
// means the tail of every batch gets fetched but never even attempted (the
// outer per-iteration time check breaks before reaching them), silently
// starving them every single tick regardless of how fast they'd finish.
// Derived rather than a separate literal so a future change to either
// budget constant can't reintroduce that gap by accident.
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
    console.error(`[migration-worker] getGmailLabels failed: ${res.status} ${error.slice(0, 300)}`);
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
// currently carrying the label". A silently-truncated/empty result here
// used to make toApply (dbMsgIds minus this set) look bigger than it
// really was -- messages that already had the label would get redundantly
// re-applied, and worse, the "remaining" count reported in last_error could
// go UP between ticks purely because this call failed partway through, with
// nothing anywhere to say so.
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
      console.error(`[migration-worker] getMessagesWithLabel failed mid-page (label=${labelId}, ${ids.length} collected so far): ${res.status} ${error.slice(0, 300)}`);
      complete = false;
      break;
    }
    const data = await res.json();
    (data.messages || []).forEach((m: any) => ids.push(m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return { ids, complete };
}

// Return shape carries the failure reason, not just ok/not-ok -- the
// label_sync branch below logs it when a chunk has failures, since a
// silently-failing applyLabel call was previously indistinguishable from a
// slow-but-succeeding one: both just leave the message out of next tick's
// gmailMsgSet, so `toApply` never shrinks for that message either way.
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
  // pass got to first, so an incomplete list here just means slightly more
  // of the work happens via the label delete than via individual removes.
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
  try { await db.from("gmail_sync_log").insert(row); } catch (_) { /* never break migration over logging */ }
}

// Same idempotency guard as gmail-email-sync-processor / gmail-sync-recovery-worker
// (see supabase/migrations/20260730170000_gmail_import_claims.sql) -- this
// worker, the fast processors, and the recovery worker can all attempt to
// import the same message for the same user, so the claim (not just the
// per-user Gmail lock) is what actually prevents a duplicate copy landing
// in the target's mailbox.
async function claimImport(companyId: string, projectId: string, userId: string, msgId: string): Promise<boolean> {
  const { error } = await db.from("gmail_import_claims").insert({
    user_id: userId, gmail_message_id: msgId, company_id: companyId, project_id: projectId,
  });
  return !error;
}
async function releaseImportClaim(userId: string, msgId: string): Promise<void> {
  try { await db.from("gmail_import_claims").delete().eq("user_id", userId).eq("gmail_message_id", msgId); } catch (_) { /* best-effort */ }
}

// Thrown when a single migration job's own work (hundreds/thousands of
// messages) alone exceeds the tick's time budget. Real incremental
// progress, not a broken account -- Gmail's label state is the checkpoint,
// so the next tick resumes wherever this one left off. Doesn't count
// against MAX_ATTEMPTS, so a big mailbox can take as many ticks as it needs
// without wrongly escalating to persistent_failure.
class BudgetDeferredError extends Error {
  deferred = true;
}

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break migration */ }
}

function respond(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// ── Overlap guard ────────────────────────────────────────────────
const LOCK_NAME = "gmail-migration-worker";
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
  console.log("[migration-worker] START");
  const t0 = Date.now();

  if (!(await acquireLock())) {
    console.log("[migration-worker] Previous tick still running -- skipping");
    return respond({ ok: true, skipped: "already_running" });
  }

  try {
    return await runMigration(t0);
  } finally {
    await releaseLock();
  }
});

async function runMigration(t0: number): Promise<Response> {
  const { data: pending } = await db.from("gmail_migration_jobs")
    .select("*")
    .in("status", ["pending", "processing"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("message_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!pending?.length) {
    console.log("[migration-worker] Nothing to migrate");
    await heartbeat("gmail-migration-worker", Date.now() - t0, { processed: 0, done: 0, escalated: 0, deferred: 0 });
    return respond({ ok: true, processed: 0, done: 0, escalated: 0, deferred: 0 });
  }

  let processed = 0, done = 0, escalated = 0, deferred = 0;

  for (let i = 0; i < pending.length; i++) {
    const item = pending[i];
    const elapsed = Date.now() - t0;
    if (elapsed > TIME_BUDGET_MS) {
      console.log(`[migration-worker] Time budget reached -- ${pending.length - processed} untouched, deferring to next tick`);
      break;
    }
    // Fair-share pacing: split whatever's left of the tick budget across
    // however many items in this batch haven't been attempted yet, instead
    // of letting one mailbox run against the FULL remaining budget. A
    // deferral doesn't count against MAX_ATTEMPTS (see BudgetDeferredError
    // below), so an item that never quite finishes within its slice keeps
    // re-sorting to the front of next tick's smallest-first batch -- without
    // this, that one item can burn the entire tick every time and starve
    // every other item behind it indefinitely. Recomputed each iteration
    // (not fixed once upfront) so an item that finishes early hands its
    // unused time back to whatever's left in the pool.
    const itemsRemaining = pending.length - i;
    const itemBudgetMs = Math.max((TIME_BUDGET_MS - elapsed) / itemsRemaining, MIN_ITEM_BUDGET_MS);
    const itemDeadline = Date.now() + itemBudgetMs;
    const {
      id: itemId, company_id: companyId, source_job_id: sourceJobId, job_type: jobType,
      project_id: projectId, user_id: userId, label_code: labelCode, total_users: totalUsers, attempts,
      confirmed_applied_ids: confirmedAppliedIdsRaw,
    } = item;
    // Message ids this item has already successfully called applyLabel on
    // in a PRIOR tick -- excluded from toApply below regardless of what a
    // fresh Gmail list read says, since that read isn't reliably
    // consistent under sustained polling (see this migration's own
    // comment). Mutated in place as chunks succeed and persisted back to
    // the row so it survives into the next tick even if this one defers.
    const confirmedAppliedIds = new Set<string>(Array.isArray(confirmedAppliedIdsRaw) ? confirmedAppliedIdsRaw : []);
    processed++;
    console.log(`[migration-worker] Processing item=${itemId} job=${sourceJobId} user=${userId} type=${jobType} messages=${item.message_count} attempt=${attempts + 1}/${MAX_ATTEMPTS} budget=${Math.round(itemBudgetMs / 1000)}s`);

    await db.from("gmail_migration_jobs").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", itemId);

    try {
      const { data: job } = await db.from("gmail_sync_jobs").select("*").eq("id", sourceJobId).maybeSingle();
      if (!job) {
        // Parent job no longer exists (e.g. project/label deleted) -- nothing left to migrate
        await db.from("gmail_migration_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", itemId);
        done++;
        continue;
      }

      const gmailLabelName = sanitiseLabelName(job.gmail_label_name || item.gmail_label_name || "");
      const token = await getAccessToken(userId);
      if (!token) throw new Error("No Gmail token for this user");

      if (jobType === "label_sync") {
        const { data: dbLabel } = await db.from("project_gmail_labels")
          .select("removed_at").eq("project_id", projectId).eq("company_id", companyId).maybeSingle();
        const isRemoved = !!dbLabel?.removed_at;

        const { data: dbEmails } = await db.from("project_emails")
          .select("gmail_message_id").eq("project_id", projectId).eq("company_id", companyId);
        const dbMsgIds = (dbEmails || []).map((e: any) => e.gmail_message_id);

        const gmailLabels = await getGmailLabels(token);
        const existingLabelId = findLabelId(gmailLabels, labelCode, gmailLabelName);

        if (isRemoved) {
          if (existingLabelId) await deleteGmailLabel(token, existingLabelId);
        } else {
          let labelId = existingLabelId;
          if (!labelId) labelId = await createLabelHierarchy(token, gmailLabelName, gmailLabels);
          if (!labelId) throw new Error("Could not find or create label");
          if (dbMsgIds.length) {
            const { ids: currentlyLabelled, complete } = await getMessagesWithLabel(token, labelId);
            // A failed/incomplete list here must NOT be treated as "nothing
            // has the label yet" -- that would make toApply balloon to
            // include messages that are already correctly labelled, and the
            // "remaining" count in last_error would visibly regress between
            // ticks for no real reason. Defer instead, same non-punishing
            // retry as a budget timeout -- this genuinely isn't this item's
            // fault.
            if (!complete) throw new BudgetDeferredError(`Could not get a complete list of currently-labelled messages (label=${labelId}) -- will retry next tick`);
            const gmailMsgSet = new Set(currentlyLabelled);
            // Excludes confirmedAppliedIds too, not just the live list -- a
            // message this item already succeeded on in a prior tick never
            // goes back into toApply, even if this tick's list read is one
            // of the ones that (transiently, wrongly) omits it.
            const toApply = dbMsgIds.filter((id: string) => !gmailMsgSet.has(id) && !confirmedAppliedIds.has(id));
            // Chunked + parallel, same pattern deleteGmailLabel already uses
            // below -- applying one at a time sequentially meant a mailbox
            // with real per-call latency (large/archive mailboxes especially)
            // could exhaust an entire fair-share slice on only a handful of
            // messages, never converging even across many ticks.
            const applyFailures: { msgId: string; status?: number; error?: string }[] = [];
            for (let c = 0; c < toApply.length; c += APPLY_CHUNK_SIZE) {
              if (Date.now() > itemDeadline) throw new BudgetDeferredError(`Item's fair-share budget (${Math.round(itemBudgetMs / 1000)}s) reached mid-mailbox (${toApply.length - c} of ${toApply.length} messages remaining) -- will resume next tick`);
              const results = await Promise.all(toApply.slice(c, c + APPLY_CHUNK_SIZE).map(msgId => applyLabel(token, msgId, labelId)));
              let chunkHadNewConfirmations = false;
              for (const r of results) {
                if (r.ok) { confirmedAppliedIds.add(r.msgId); chunkHadNewConfirmations = true; }
                else applyFailures.push(r);
              }
              // Persisted after every chunk (not just once at the end) so a
              // later defer/throw in this same tick, or the isolate simply
              // running out of platform time, doesn't lose confirmations
              // that already genuinely happened.
              if (chunkHadNewConfirmations) {
                await db.from("gmail_migration_jobs")
                  .update({ confirmed_applied_ids: [...confirmedAppliedIds] }).eq("id", itemId);
              }
            }
            if (applyFailures.length) {
              console.error(`[migration-worker] applyLabel failed for ${applyFailures.length}/${toApply.length} messages on item=${itemId}:`, JSON.stringify(applyFailures.slice(0, 5)));
              await logActivity({
                company_id: companyId, triggered_by: null, action: "apply_label_failed",
                project_id: projectId, gmail_label_name: gmailLabelName, target_user_id: userId,
                details: { job_type: jobType, failed_count: applyFailures.length, total: toApply.length, samples: applyFailures.slice(0, 5) },
              });
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
          const filerByMsgId: Record<string, string> = {};
          for (const e of (dbEmails || [])) filerByMsgId[e.gmail_message_id] = e.user_id;
          const distinctFilerIds = [...new Set(Object.values(filerByMsgId))].filter(id => id !== userId);
          const sourceTokensByUserId: Record<string, string> = {};
          for (const filerId of distinctFilerIds) {
            const t = await getAccessToken(filerId);
            if (t) sourceTokensByUserId[filerId] = t;
          }

          const gmailLabels = await getGmailLabels(token);
          let labelId = findLabelId(gmailLabels, labelCode, gmailLabelName);
          if (!labelId) labelId = await createLabelHierarchy(token, gmailLabelName, gmailLabels);
          if (!labelId) throw new Error("Could not find or create label");

          const { ids: currentlyLabelled, complete: labelListComplete } = await getMessagesWithLabel(token, labelId);
          // Same reasoning as the label_sync branch above -- an incomplete
          // list must not be read as "none of these have the label yet".
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
                await db.from("gmail_migration_jobs")
                  .update({ confirmed_applied_ids: [...confirmedAppliedIds] }).eq("id", itemId);
              }
              continue;
            }
            const filerToken = sourceTokensByUserId[filerByMsgId[msgId]];
            if (!filerToken) continue;
            if (!(await claimImport(companyId, projectId, userId, msgId))) continue;
            const ok = await importMessage(filerToken, token, msgId, labelId);
            if (!ok) await releaseImportClaim(userId, msgId);
          }
          await db.from("project_emails").update({ gmail_label_applied: true })
            .eq("project_id", projectId).eq("company_id", companyId).eq("user_id", userId);
        }
      } else {
        throw new Error(`Migration not supported for job_type "${jobType}"`);
      }

      // Success -- resume this user in their ORIGINAL job (same
      // completed_users bookkeeping the fast lane and recovery worker use)
      // and mark this migration item done.
      await markUserComplete(sourceJobId, userId, totalUsers);
      await db.from("gmail_migration_jobs").update({
        status: "done", updated_at: new Date().toISOString(),
      }).eq("id", itemId);
      await logActivity({
        company_id: companyId, triggered_by: null, action: "sync_migrated",
        project_id: projectId, gmail_label_name: gmailLabelName,
        target_user_id: userId, details: { job_type: jobType, message_count: item.message_count },
      });
      done++;
      console.log(`[migration-worker] ✓ Done item ${itemId}`);

    } catch (err: any) {
      if (err?.deferred) {
        await db.from("gmail_migration_jobs").update({
          status: "pending", last_error: err.message || "Deferred -- resuming next tick", updated_at: new Date().toISOString(),
        }).eq("id", itemId);
        deferred++;
        console.log(`[migration-worker] ⏸ Deferred (not counted as a failed attempt): ${itemId} -- ${err.message}`);
        continue;
      }

      const nextAttempts = attempts + 1;
      const isPersistent = nextAttempts >= MAX_ATTEMPTS;
      await db.from("gmail_migration_jobs").update({
        status: isPersistent ? "persistent_failure" : "pending",
        attempts: nextAttempts, last_error: err.message || "Unknown error",
        updated_at: new Date().toISOString(),
      }).eq("id", itemId);

      if (isPersistent) {
        escalated++;
        await logActivity({
          company_id: companyId, triggered_by: null, action: "sync_failed",
          project_id: projectId, gmail_label_name: item.gmail_label_name,
          target_user_id: userId, details: { job_type: jobType, error: err.message, lane: "migration" },
        });
        console.error(`[migration-worker] ✗ Escalated to persistent_failure: ${itemId} -- ${err.message}`);
      } else {
        console.error(`[migration-worker] ✗ Retry failed (${nextAttempts}/${MAX_ATTEMPTS}): ${itemId} -- ${err.message}`);
      }
    }
  }

  console.log(`[migration-worker] DONE in ${Date.now() - t0}ms -- processed=${processed} done=${done} escalated=${escalated} deferred=${deferred}`);
  await heartbeat("gmail-migration-worker", Date.now() - t0, { processed, done, escalated, deferred });
  return respond({ ok: true, processed, done, escalated, deferred });
}
