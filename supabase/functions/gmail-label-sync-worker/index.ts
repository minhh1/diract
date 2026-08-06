// supabase/functions/gmail-label-sync-worker/index.ts
// Every 1 min via pg_cron -- DISPATCHER ONLY. Does cheap DB-only work
// (which jobs need attention, who's pending, who's quarantined) and fans
// out one concurrent HTTPS call per pending user to
// gmail-label-sync-processor, which does the actual Gmail API work in its
// OWN isolate. This is what actually scales: throughput is bounded by how
// many concurrent isolates Supabase runs, not by one function's own 150s
// execution ceiling or memory/CPU budget (both of which we hit trying to
// do this work in-process during the 2026-07-21 incident).
//
// Dispatch happens via plain Deno fetch() to another edge function's URL -
// NOT through pg_net -- so it doesn't compete with pg_cron's own limited
// outbound worker pool (the other bottleneck from that incident).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PROCESSOR_URL = `${SUPABASE_URL}/functions/v1/gmail-label-sync-processor`;

const MAX_ATTEMPTS = 3;
// A (job, user) pair needing more than this many messages labelled is
// routed straight to gmail-migration-worker's dedicated lane instead of
// ever being attempted here -- see 20260804040000_gmail_migration_lane.sql
// for the incident (Huynh Lawyers, every connected staff member stuck)
// this threshold exists to prevent. Not applied to a REMOVED label (see
// isRemoved below) -- removing a label is cheap per-message (one modify
// call, not a raw-fetch-then-import round trip) and was never what caused
// the incident.
const MIGRATION_THRESHOLD = 50;
// Dispatcher-side work per job is cheap (DB only), but the real ceiling is
// DISPATCH_CONCURRENCY (kept low to respect Supabase's own function-gateway
// rate limit) -- so total (job,user) units per tick still has to stay
// modest or the dispatcher itself blows the 150s ceiling waiting them out.
// Empirically even ~2.86 req/s (350ms pacing) kept exceeding the gateway's
// sustainable rate (observed retry-after growing across a single tick), so
// this is paced much more conservatively at ~1 req/s. Per-tier job limits
// (not one shared BATCH_SIZE) live next to each query below.
const DISPATCH_CONCURRENCY = 3;
const MIN_DISPATCH_INTERVAL_MS = 1000; // paces request starts to stay under the gateway's own rate limit
const DISPATCH_TIMEOUT_MS = 60_000; // processor may do several sequential Gmail calls

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function sanitiseLabelName(name: string): string {
  const parts = name.split("/");
  if (parts.length <= 1) return name.replace(/\//g, "-");
  const parent = parts.slice(0, -1).join("/");
  const leaf = parts[parts.length - 1].replace(/\//g, "-");
  return `${parent}/${leaf}`;
}

async function logActivity(row: Record<string, unknown>): Promise<void> {
  try { await db.from("gmail_sync_log").insert(row); } catch (_) { /* never break sync over logging */ }
}

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break sync */ }
}

function respond(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

interface DispatchUnit {
  jobId: string; userId: string; companyId: string; projectId: string;
  labelCode: string | null; gmailLabelName: string; totalUsers: number;
  isRemoved: boolean; dbMsgIds: string[]; fastPath: boolean;
}

// Supabase's gateway rate limit is a token bucket, not a pure concurrency
// cap -- a free concurrency slot re-fires the instant it's free, which can
// drain the bucket faster than it refills even at DISPATCH_CONCURRENCY=3
// (observed retry-after growing to 25s under sustained pressure). Pace the
// request *start* rate independently of how many slots are open.
let nextSlotAt = 0;
async function paceDispatch(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlotAt - now);
  nextSlotAt = Math.max(now, nextSlotAt) + MIN_DISPATCH_INTERVAL_MS;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
}

async function dispatchOnce(unit: DispatchUnit): Promise<{ quarantined?: boolean } | null> {
  await paceDispatch();
  const res = await fetch(PROCESSOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(unit),
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
  });
  return await res.json().catch(() => ({}));
}

// Gmail's "Too many concurrent requests for user" (429) is a per-ACCOUNT
// ceiling, not per-caller -- a user on several active matters can be the
// target of multiple simultaneous processor calls (one per job), each
// individually respecting its own dispatcher's pacing with no cross-job or
// cross-function awareness. This is a DB-backed lock (not in-process)
// because gmail-label-sync-worker and gmail-email-sync-worker run as
// separate isolates and both write to the same Gmail accounts.
async function acquireUserLock(userId: string): Promise<boolean> {
  const { data } = await db.rpc("acquire_gmail_user_lock", { p_user_id: userId, p_ttl_seconds: 100 });
  return data === true;
}
async function releaseUserLock(userId: string): Promise<void> {
  try { await db.rpc("release_gmail_user_lock", { p_user_id: userId }); } catch (_) {}
}

async function dispatchOne(unit: DispatchUnit): Promise<"ok" | "quarantined" | "dispatch_error" | "user_busy"> {
  if (!(await acquireUserLock(unit.userId))) return "user_busy";
  try {
    const data = await dispatchOnce(unit);
    if (data?.quarantined) return "quarantined";
    return "ok";
  } catch (err: any) {
    // Supabase's own function gateway rate-limits concurrent invocations
    // and tells us how long to back off -- worth one retry within the same
    // tick before giving up, since DISPATCH_CONCURRENCY alone won't catch
    // every burst.
    const backoffMatch = /retry after (\d+)ms/i.exec(err.message || "");
    if (backoffMatch) {
      const waitMs = Math.min(parseInt(backoffMatch[1], 10), 5000);
      await new Promise(r => setTimeout(r, waitMs));
      try {
        const data = await dispatchOnce(unit);
        if (data?.quarantined) return "quarantined";
        return "ok";
      } catch (retryErr: any) {
        err = retryErr;
      }
    }

    // Couldn't reach the processor even after one retry -- a dispatch-level
    // problem, not necessarily evidence this user's account is broken, so
    // don't quarantine here. Log it clearly and leave them pending for next tick.
    console.error(`[label-sync-worker] Dispatch failed for user ${unit.userId} job ${unit.jobId}:`, err.message);
    await logActivity({
      company_id: unit.companyId, triggered_by: null, action: "dispatch_error",
      project_id: unit.projectId, gmail_label_name: unit.gmailLabelName,
      target_user_id: unit.userId, details: { job_type: "label_sync", error: err.message },
    });
    return "dispatch_error";
  } finally {
    await releaseUserLock(unit.userId);
  }
}

const LOCK_NAME = "gmail-label-sync-worker";
const LOCK_TTL_MS = 170_000; // longer than the 150s platform ceiling, so a genuinely-still-running tick keeps its lock

async function acquireLock(): Promise<boolean> {
  const { data } = await db.from("dispatcher_locks")
    .update({ locked_until: new Date(Date.now() + LOCK_TTL_MS).toISOString() })
    .eq("name", LOCK_NAME).lt("locked_until", new Date().toISOString()).select();
  return !!data && data.length > 0;
}

async function releaseLock(): Promise<void> {
  try { await db.from("dispatcher_locks").update({ locked_until: new Date().toISOString() }).eq("name", LOCK_NAME); } catch (_) {}
}

Deno.serve(async (_req) => {
  console.log("[label-sync-worker] ========== DISPATCH START ==========");
  const t0 = Date.now();

  if (!(await acquireLock())) {
    console.log("[label-sync-worker] Previous tick still running -- skipping");
    return respond({ ok: true, skipped: "already_running" });
  }

  try {
    return await runDispatch(t0);
  } finally {
    await releaseLock();
  }
});

async function runDispatch(t0: number): Promise<Response> {
  // Each tier gets its own reserved query limit instead of "gather
  // new-then-processing-then-old and truncate to BATCH_SIZE" -- that scheme
  // let a steady trickle of brand-new jobs (newJobs alone often filled
  // BATCH_SIZE) permanently starve processingJobs, since the merge loop
  // broke before ever reaching them. Found in production on 2026-07-22:
  // 184 label_sync jobs sat frozen in "processing" (mid-rollout, some
  // members never getting synced) while only ~8 new jobs kept cycling
  // through every tick. Processing jobs get the largest allowance since
  // they're closest to done and users are actively waiting on them; most
  // have only 1-2 pending users left, so a larger job count here doesn't
  // translate into a proportionally larger dispatch-unit count.
  // Realtime-flagged jobs (a genuinely new email, deletion, or newly-
  // created label, per gmail-push/gmail-addon) always go first, ahead of
  // the ordinary backlog tiers below -- otherwise a brand-new action just
  // competes on equal footing with hundreds of routine backlog jobs.
  const { data: realtimeJobs } = await db
    .from("gmail_sync_jobs")
    .select("*")
    .eq("job_type", "label_sync")
    .eq("is_realtime", true)
    .in("status", ["pending", "processing"])
    .lt("attempts", MAX_ATTEMPTS)
    .order("updated_at", { ascending: false })
    .limit(10);

  const { data: newJobs } = await db
    .from("gmail_sync_jobs")
    .select("*")
    .eq("job_type", "label_sync")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .eq("completed_users", "[]")
    .order("updated_at", { ascending: false })
    .limit(3);

  const { data: processingJobs } = await db
    .from("gmail_sync_jobs")
    .select("*")
    .eq("job_type", "label_sync")
    .eq("status", "processing")
    .lt("attempts", MAX_ATTEMPTS)
    .order("updated_at", { ascending: true })
    .limit(30);

  const { data: oldJobs } = await db
    .from("gmail_sync_jobs")
    .select("*")
    .eq("job_type", "label_sync")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .neq("completed_users", "[]")
    .order("updated_at", { ascending: true })
    .limit(8);

  const seen = new Set<string>();
  const jobs: any[] = [];
  for (const j of [...(realtimeJobs || []), ...(newJobs || []), ...(processingJobs || []), ...(oldJobs || [])]) {
    if (!seen.has(j.id)) { seen.add(j.id); jobs.push(j); }
  }

  console.log(`[label-sync-worker] Jobs: realtime=${realtimeJobs?.length||0} new=${newJobs?.length||0} processing=${processingJobs?.length||0} old=${oldJobs?.length||0} total=${jobs.length}`);

  if (!jobs.length) {
    console.log("[label-sync-worker] No pending jobs");
    await heartbeat("gmail-label-sync-worker", Date.now() - t0, { dispatched: 0 });
    return respond({ ok: true, dispatched: 0 });
  }

  const units: DispatchUnit[] = [];
  // Job count alone doesn't bound tick duration -- the 184-job starvation
  // backlog found on 2026-07-22 wasn't uniform: most jobs had 1-2 pending
  // users left, but a handful had 6-7 (never touched since creation). At
  // ~1 unit/sec pacing, a batch that happens to include several of those
  // can still blow the 150s ceiling even with a modest job-count limit -
  // cap the actual unit count directly and let leftover jobs roll to next
  // tick instead. Trimmed further after adding the per-user concurrency
  // lock (2026-07-23) -- its extra acquire/release round-trip per unit
  // pushed one tick to 177s, over the ceiling (it happened to still
  // complete, but too close for comfort).
  const MAX_UNITS_PER_TICK = 18;

  // Batched once for the whole tick's job set, not once per job -- see the
  // matching fix/comment in gmail-email-sync-worker (a per-job round trip
  // here pushed a heavy tick, 137 pending jobs during the incident this
  // lane exists to fix, over the platform's execution ceiling with no
  // heartbeat written).
  const jobIds = jobs.map((j: any) => j.id);
  const { data: quarantinedRows } = await db.from("gmail_sync_failures")
    .select("job_id, user_id").in("job_id", jobIds).in("status", ["pending_retry", "persistent_failure"]);
  const quarantinedByJob = new Map<string, Set<string>>();
  for (const q of (quarantinedRows || [])) {
    if (!quarantinedByJob.has(q.job_id)) quarantinedByJob.set(q.job_id, new Set());
    quarantinedByJob.get(q.job_id)!.add(q.user_id);
  }
  const { data: migratingRows } = await db.from("gmail_migration_jobs")
    .select("source_job_id, user_id").in("source_job_id", jobIds).in("status", ["pending", "processing"]);
  const migratingByJob = new Map<string, Set<string>>();
  for (const m of (migratingRows || [])) {
    if (!migratingByJob.has(m.source_job_id)) migratingByJob.set(m.source_job_id, new Set());
    migratingByJob.get(m.source_job_id)!.add(m.user_id);
  }

  for (const job of jobs) {
    if (units.length >= MAX_UNITS_PER_TICK) break;
    const { id: jobId, company_id: companyId, project_id: projectId, label_code: labelCode, gmail_label_name: rawLabelName, completed_users, total_users } = job;
    const gmailLabelName = sanitiseLabelName(rawLabelName || "");

    const { data: members } = await db.from("company_memberships").select("user_id").eq("company_id", companyId);
    const memberIds = (members || []).map((m: any) => m.user_id);
    const { data: connectedTokens } = memberIds.length
      ? await db.from("user_gmail_tokens").select("user_id").in("user_id", memberIds)
      : { data: [] as any[] };
    const allUserIds: string[] = (connectedTokens || []).map((t: any) => t.user_id);

    const completedSet = new Set(completed_users || []);
    const stillNeeded = allUserIds.filter(id => !completedSet.has(id));
    if (!stillNeeded.length) {
      await db.from("gmail_sync_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", jobId);
      continue;
    }

    const quarantinedSet = quarantinedByJob.get(jobId) || new Set();
    const migratingSet = migratingByJob.get(jobId) || new Set();
    const pendingUsers = stillNeeded.filter(id => !quarantinedSet.has(id) && !migratingSet.has(id));
    if (!pendingUsers.length) continue;

    const { data: dbLabel } = await db.from("project_gmail_labels")
      .select("removed_at").eq("project_id", projectId).eq("company_id", companyId).maybeSingle();
    const isRemoved = !!dbLabel?.removed_at;

    // Each user has their OWN copy of a shared thread with its OWN Gmail
    // message id -- one project_emails row per (project, message, user),
    // not one shared row per message. Grouping by user_id here (instead of
    // handing every dispatched unit the full project-wide id list, as this
    // used to) is what makes applyLabel below only ever try ids that
    // actually exist in the mailbox it's calling against. Confirmed live
    // 2026-08-06: the ungrouped version was calling modify with OTHER
    // users' message ids on a project with 7 members and ~34 messages
    // each -- 6/7 of every "toApply" list 404'd ("Requested entity was not
    // found") on every single tick, forever, since a 404'd id never enters
    // gmailMsgSet/confirmed_applied_ids and so is never excluded from the
    // next tick's toApply either. That's the real cause of the migration
    // backlog that stopped draining for 2+ hours across 6+ matters, not any
    // of the mailbox/size/duplicate-job theories chased before this.
    const { data: dbEmails } = await db.from("project_emails")
      .select("gmail_message_id, user_id").eq("project_id", projectId).eq("company_id", companyId);
    const msgIdsByUser = new Map<string, string[]>();
    for (const e of (dbEmails || [])) {
      if (!msgIdsByUser.has(e.user_id)) msgIdsByUser.set(e.user_id, []);
      msgIdsByUser.get(e.user_id)!.push(e.gmail_message_id);
    }
    // Project-wide total -- still the right measure for "is this label
    // migration-scale" (MIGRATION_THRESHOLD below) and for fastPath (a
    // project with genuinely zero synced emails yet, for anyone).
    const dbMsgIds = (dbEmails || []).map((e: any) => e.gmail_message_id);
    const fastPath = !isRemoved && dbMsgIds.length === 0;

    // Large backlog on an active (non-removed) label -- hand every
    // still-pending user for this job to the migration lane instead.
    if (!isRemoved && dbMsgIds.length > MIGRATION_THRESHOLD) {
      const rows = pendingUsers.map(userId => ({
        company_id: companyId, source_job_id: jobId, job_type: "label_sync",
        project_id: projectId, user_id: userId, label_code: labelCode,
        gmail_label_name: gmailLabelName, total_users: total_users || allUserIds.length,
        // Per-user count, not the project-wide total -- this is what the
        // migration worker actually has to apply for THIS mailbox, and
        // what its "order by message_count asc" sizing/pacing assumes it
        // means. The project-wide total overstated true per-user work by
        // ~totalUsers-fold and skewed both the processing order and the
        // "X remaining" progress readout.
        message_count: (msgIdsByUser.get(userId) || []).length, status: "pending",
      }));
      const { error: migrationInsertErr } = await db.from("gmail_migration_jobs")
        .upsert(rows, { onConflict: "source_job_id,user_id", ignoreDuplicates: true });
      if (migrationInsertErr) console.error(`[label-sync-worker] migration route error for job ${jobId}:`, migrationInsertErr.message);
      // Deliberately NOT bumping updated_at here (unlike the matching fix in
      // gmail-email-sync-worker) -- this job has completed_users still "[]"
      // (none of its pending users made it through the fast lane), so it
      // stays classified under the "newJobs" tier above, which sorts
      // updated_at DESCENDING. Bumping to now() would make it the NEWEST
      // and keep winning that tier's 3 slots every tick -- the opposite of
      // what's needed. Left untouched, it naturally ages out of newJobs'
      // top-3 within a cron cycle or two as genuinely new jobs land with
      // more recent timestamps; the bounded cost of an occasional re-pick
      // (a few cheap DB reads, no Gmail calls) is acceptable at this tier's
      // small limit, unlike email-sync-worker's single 20-slot query where
      // oversized jobs could crowd out the entire batch.
      console.log(`[label-sync-worker] Job ${jobId}: routed ${rows.length} user(s) to migration lane (${dbMsgIds.length} messages)`);
      continue;
    }

    for (const userId of pendingUsers) {
      units.push({
        jobId, userId, companyId, projectId, labelCode, gmailLabelName,
        totalUsers: total_users || allUserIds.length, isRemoved,
        dbMsgIds: msgIdsByUser.get(userId) || [], fastPath,
      });
    }
  }

  console.log(`[label-sync-worker] Dispatching ${units.length} (job, user) units, concurrency=${DISPATCH_CONCURRENCY}`);

  const outcomes = await mapWithConcurrency(units, DISPATCH_CONCURRENCY, dispatchOne);
  const ok = outcomes.filter(o => o === "ok").length;
  const quarantinedCount = outcomes.filter(o => o === "quarantined").length;
  const dispatchErrors = outcomes.filter(o => o === "dispatch_error").length;
  // Another job (this dispatcher or gmail-email-sync-worker) already had a
  // write in flight against this same Gmail account -- left pending, no
  // error logged, picked up again next tick once that other call clears.
  const userBusy = outcomes.filter(o => o === "user_busy").length;

  const { count: remaining } = await db.from("gmail_sync_jobs")
    .select("*", { count: "exact", head: true }).eq("job_type", "label_sync").eq("status", "pending");

  const result = { dispatched: units.length, ok, quarantined: quarantinedCount, dispatchErrors, userBusy, remaining };
  console.log(`[label-sync-worker] DONE in ${Date.now() - t0}ms -`, JSON.stringify(result));
  await heartbeat("gmail-label-sync-worker", Date.now() - t0, result);
  return respond({ ok: true, ...result });
}
