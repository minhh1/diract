// supabase/functions/outlook-label-sync-worker/index.ts
// Every 1 min via pg_cron — DISPATCHER ONLY, mirroring gmail-label-sync-worker's
// dispatcher/processor split (cheap DB-only work here, fans out one HTTPS
// call per pending user to outlook-label-sync-processor which does the
// actual Graph work in its own isolate). Kept from the start rather than
// starting simpler and refactoring under load later, since that split is
// exactly what the Gmail incident (2026-07-21/22) forced afterwards.
//
// Simplified vs. the Gmail version: a single realtime/backlog priority
// split instead of Gmail's four-tier scheme (new/processing/old were
// separated there to fix a real starvation incident under production
// load — Outlook starts at zero load, so that tuning isn't needed yet;
// revisit if the same starvation pattern shows up).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const PROCESSOR_URL = `${SUPABASE_URL}/functions/v1/outlook-label-sync-processor`;

const MAX_ATTEMPTS = 3;
const DISPATCH_CONCURRENCY = 3;
const MIN_DISPATCH_INTERVAL_MS = 1000;
const DISPATCH_TIMEOUT_MS = 60_000;
const MAX_UNITS_PER_TICK = 18;

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

async function logActivity(row: Record<string, unknown>): Promise<void> {
  try { await db.from("outlook_sync_log").insert(row); } catch (_) { /* never break sync over logging */ }
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
  labelCode: string | null; categoryName: string; totalUsers: number;
  isRemoved: boolean; knownMessages: { internetMessageId: string }[]; fastPath: boolean;
}

let nextSlotAt = 0;
async function paceDispatch(): Promise<void> {
  const now = Date.now();
  const wait = Math.max(0, nextSlotAt - now);
  nextSlotAt = Math.max(now, nextSlotAt) + MIN_DISPATCH_INTERVAL_MS;
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
}

async function acquireUserLock(userId: string): Promise<boolean> {
  const { data } = await db.rpc("acquire_outlook_user_lock", { p_user_id: userId, p_ttl_seconds: 100 });
  return data === true;
}
async function releaseUserLock(userId: string): Promise<void> {
  try { await db.rpc("release_outlook_user_lock", { p_user_id: userId }); } catch (_) {}
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

async function dispatchOne(unit: DispatchUnit): Promise<"ok" | "quarantined" | "dispatch_error" | "user_busy"> {
  if (!(await acquireUserLock(unit.userId))) return "user_busy";
  try {
    const data = await dispatchOnce(unit);
    if (data?.quarantined) return "quarantined";
    return "ok";
  } catch (err: any) {
    console.error(`[outlook-label-sync-worker] Dispatch failed for user ${unit.userId} job ${unit.jobId}:`, err.message);
    await logActivity({
      company_id: unit.companyId, triggered_by: null, action: "dispatch_error",
      project_id: unit.projectId, category_name: unit.categoryName,
      target_user_id: unit.userId, details: { job_type: "label_sync", error: err.message },
    });
    return "dispatch_error";
  } finally {
    await releaseUserLock(unit.userId);
  }
}

const LOCK_NAME = "outlook-label-sync-worker";
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

Deno.serve(async (_req) => {
  console.log("[outlook-label-sync-worker] ========== DISPATCH START ==========");
  const t0 = Date.now();

  if (!(await acquireLock())) {
    console.log("[outlook-label-sync-worker] Previous tick still running — skipping");
    return respond({ ok: true, skipped: "already_running" });
  }

  try {
    return await runDispatch(t0);
  } finally {
    await releaseLock();
  }
});

async function runDispatch(t0: number): Promise<Response> {
  const { data: realtimeJobs } = await db.from("outlook_sync_jobs")
    .select("*").eq("job_type", "label_sync").eq("is_realtime", true)
    .in("status", ["pending", "processing"]).lt("attempts", MAX_ATTEMPTS)
    .order("updated_at", { ascending: false }).limit(10);

  const { data: backlogJobs } = await db.from("outlook_sync_jobs")
    .select("*").eq("job_type", "label_sync").eq("is_realtime", false)
    .in("status", ["pending", "processing"]).lt("attempts", MAX_ATTEMPTS)
    .order("updated_at", { ascending: true }).limit(20);

  const seen = new Set<string>();
  const jobs: any[] = [];
  for (const j of [...(realtimeJobs || []), ...(backlogJobs || [])]) {
    if (!seen.has(j.id)) { seen.add(j.id); jobs.push(j); }
  }

  console.log(`[outlook-label-sync-worker] Jobs: realtime=${realtimeJobs?.length || 0} backlog=${backlogJobs?.length || 0} total=${jobs.length}`);

  if (!jobs.length) {
    await heartbeat("outlook-label-sync-worker", Date.now() - t0, { dispatched: 0 });
    return respond({ ok: true, dispatched: 0 });
  }

  const units: DispatchUnit[] = [];

  for (const job of jobs) {
    if (units.length >= MAX_UNITS_PER_TICK) break;
    const { id: jobId, company_id: companyId, project_id: projectId, label_code: labelCode, category_name: categoryName, completed_users, total_users } = job;

    const { data: members } = await db.from("company_memberships").select("user_id").eq("company_id", companyId);
    const memberIds = (members || []).map((m: any) => m.user_id);
    const { data: connectedTokens } = memberIds.length
      ? await db.from("user_outlook_tokens").select("user_id").in("user_id", memberIds)
      : { data: [] as any[] };
    const allUserIds: string[] = (connectedTokens || []).map((t: any) => t.user_id);

    const completedSet = new Set(completed_users || []);
    const stillNeeded = allUserIds.filter(id => !completedSet.has(id));
    if (!stillNeeded.length) {
      await db.from("outlook_sync_jobs").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", jobId);
      continue;
    }

    const { data: quarantined } = await db.from("outlook_sync_failures")
      .select("user_id").eq("job_id", jobId).in("status", ["pending_retry", "persistent_failure"]);
    const quarantinedSet = new Set((quarantined || []).map((q: any) => q.user_id));
    const pendingUsers = stillNeeded.filter(id => !quarantinedSet.has(id));
    if (!pendingUsers.length) continue;

    const { data: dbLabel } = await db.from("project_outlook_labels")
      .select("removed_at").eq("project_id", projectId).eq("company_id", companyId).maybeSingle();
    const isRemoved = !!dbLabel?.removed_at;

    const { data: dbEmails } = await db.from("project_outlook_emails")
      .select("outlook_internet_message_id").eq("project_id", projectId).eq("company_id", companyId);
    const seenMsgIds = new Set<string>();
    const knownMessages: { internetMessageId: string }[] = [];
    for (const e of (dbEmails || [])) {
      if (!seenMsgIds.has(e.outlook_internet_message_id)) {
        seenMsgIds.add(e.outlook_internet_message_id);
        knownMessages.push({ internetMessageId: e.outlook_internet_message_id });
      }
    }
    const fastPath = !isRemoved && knownMessages.length === 0;

    for (const userId of pendingUsers) {
      units.push({
        jobId, userId, companyId, projectId, labelCode, categoryName,
        totalUsers: total_users || allUserIds.length, isRemoved, knownMessages, fastPath,
      });
    }
  }

  console.log(`[outlook-label-sync-worker] Dispatching ${units.length} (job, user) units, concurrency=${DISPATCH_CONCURRENCY}`);

  const outcomes = await mapWithConcurrency(units, DISPATCH_CONCURRENCY, dispatchOne);
  const ok = outcomes.filter(o => o === "ok").length;
  const quarantinedCount = outcomes.filter(o => o === "quarantined").length;
  const dispatchErrors = outcomes.filter(o => o === "dispatch_error").length;
  const userBusy = outcomes.filter(o => o === "user_busy").length;

  const { count: remaining } = await db.from("outlook_sync_jobs")
    .select("*", { count: "exact", head: true }).eq("job_type", "label_sync").eq("status", "pending");

  const result = { dispatched: units.length, ok, quarantined: quarantinedCount, dispatchErrors, userBusy, remaining };
  console.log(`[outlook-label-sync-worker] DONE in ${Date.now() - t0}ms —`, JSON.stringify(result));
  await heartbeat("outlook-label-sync-worker", Date.now() - t0, result);
  return respond({ ok: true, ...result });
}
