// supabase/functions/gmail-legacy-label-cleanup/index.ts
// One-off, admin-triggered cleanup for a historical label-scheme migration:
// this app used to file matters under a plain "Filed Emails/<matterNumber>
// - <description>" parent label, with no [labelCode] suffix and no DB
// tracking at all -- at some point the company switched to the current
// "<parentLabel>/<matterNumber> — <project name> [CODE]" scheme (see
// lib/gmail/createProjectLabel.ts), but the OLD labels were never merged
// into the new ones or deleted. Confirmed live (2026-07-31): Huy Pham's
// mailbox alone had 291 "Filed Emails/*" labels still sitting alongside
// 236 current "Huynh Lawyers/*" ones, each pair applied redundantly to the
// same old messages -- which is exactly the "duplicate label on one email"
// symptom reported for matter 260507.
//
// This is a ONE-TIME backlog cleanup, not a recurring sync -- unlike
// gmail-label-sync-cron/worker/processor, there's no ongoing trigger for
// new duplicates to appear here (gmail-label-sync-cron's own rename
// detection, added the same day this was found, prevents the *current*
// label scheme from drifting again). Admin-triggered via
// components/admin/AdminGmailSyncTab.tsx: GET /scan for a dry-run report,
// POST /apply (bounded per call, safely re-invokable) to actually merge.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const FETCH_TIMEOUT_MS = 15_000;
function withTimeout(): AbortSignal { return AbortSignal.timeout(FETCH_TIMEOUT_MS); }

// Old scheme never had a code suffix -- matched purely on the leading
// matter-number digits right after the parent segment, same convention
// (4-6 digit matter numbers) used company-wide.
const OLD_LABEL_RE = /^Filed Emails\/(\d{4,6})\b/;

// Caps how much Gmail-API work one /apply call does, so it always finishes
// well inside the 150s platform ceiling regardless of backlog size --
// the caller (AdminGmailSyncTab.tsx) just calls /apply repeatedly until
// `remaining` comes back 0, same "keep calling until done" shape as any
// paginated endpoint.
const MAX_PAIRS_PER_APPLY_CALL = 3;
const MAX_MESSAGES_PER_LABEL_PER_CALL = 50;
const MOVE_CONCURRENCY = 4;
const SCAN_CONCURRENCY = 4;

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

// ── Gmail API ──────────────────────────────────────────────────────

async function getGmailLabels(token: string): Promise<{ id: string; name: string }[]> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", {
    headers: { Authorization: `Bearer ${token}` }, signal: withTimeout(),
  });
  if (!res.ok) return [];
  return (await res.json()).labels || [];
}

// Approximate count only -- resultSizeEstimate, not a real paginated
// fetch -- fast enough to run across a user's whole label list for a
// dry-run report without hitting the timeout.
async function estimateMessageCount(token: string, labelId: string): Promise<number> {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("labelIds", labelId);
  url.searchParams.set("maxResults", "1");
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: withTimeout() });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.resultSizeEstimate || 0;
}

async function getMessagesWithLabel(token: string, labelId: string, cap: number): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    url.searchParams.set("labelIds", labelId);
    url.searchParams.set("maxResults", String(Math.min(500, cap - ids.length)));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: withTimeout() });
    if (!res.ok) break;
    const data = await res.json();
    (data.messages || []).forEach((m: any) => ids.push(m.id));
    pageToken = data.nextPageToken;
  } while (pageToken && ids.length < cap);
  return ids;
}

// Single modify call does both -- half the API calls of separate
// apply/remove requests.
async function moveMessageLabel(token: string, msgId: string, fromLabelId: string, toLabelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/modify`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ addLabelIds: [toLabelId], removeLabelIds: [fromLabelId] }), signal: withTimeout(),
  });
  return res.ok;
}

async function deleteGmailLabel(token: string, labelId: string): Promise<boolean> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/labels/${labelId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal: withTimeout(),
  });
  return res.ok || res.status === 404; // already gone counts as success
}

// ── Matching ───────────────────────────────────────────────────────

interface CurrentLabelInfo { gmailLabelName: string; labelCode: string; projectId: string; projectName: string }

// One query per company (not per user) -- the "current" side of every
// pair is the same regardless of which mailbox we're scanning.
async function loadCurrentLabelsByMatterNumber(companyId: string): Promise<Map<string, CurrentLabelInfo>> {
  const result = new Map<string, CurrentLabelInfo>();

  const { data: labels } = await db.from("project_gmail_labels")
    .select("project_id, gmail_label_name, label_code")
    .eq("company_id", companyId).is("removed_at", null);
  if (!labels?.length) return result;

  const projectIds = labels.map((l: any) => l.project_id);
  const { data: projects } = await db.from("projects").select("id, name").in("id", projectIds);
  const projectById = new Map((projects || []).map((p: any) => [p.id, p]));

  const { data: matterField } = await db.from("company_custom_fields").select("id")
    .eq("company_id", companyId).eq("table_name", "projects")
    .ilike("label", "%matter%number%").is("deleted_at", null).maybeSingle();
  if (!matterField) return result;

  const { data: matterVals } = await db.from("company_custom_field_values")
    .select("record_id, value_text").eq("field_id", matterField.id).in("record_id", projectIds);
  const matterByProject = new Map((matterVals || []).map((v: any) => [v.record_id, v.value_text]));

  for (const label of labels as any[]) {
    const matterNumber = matterByProject.get(label.project_id);
    const project = projectById.get(label.project_id);
    if (!matterNumber || !project) continue;
    result.set(matterNumber, {
      gmailLabelName: label.gmail_label_name, labelCode: label.label_code,
      projectId: label.project_id, projectName: project.name,
    });
  }
  return result;
}

interface MatchedPair {
  matterNumber: string; projectId: string; projectName: string;
  oldLabelId: string; oldLabelName: string;
  newLabelId: string; newLabelName: string;
}

function findMatchedPairs(
  gmailLabels: { id: string; name: string }[],
  currentByMatter: Map<string, CurrentLabelInfo>
): MatchedPair[] {
  const pairs: MatchedPair[] = [];
  for (const label of gmailLabels) {
    const m = OLD_LABEL_RE.exec(label.name);
    if (!m) continue;
    const current = currentByMatter.get(m[1]);
    if (!current) continue; // no live matter for this number -- e.g. "1000 - Leads", leave alone
    const newLabel = gmailLabels.find(l => l.name.includes(`[${current.labelCode}]`));
    if (!newLabel) continue; // current label isn't in THIS user's mailbox at all -- nothing to merge into
    pairs.push({
      matterNumber: m[1], projectId: current.projectId, projectName: current.projectName,
      oldLabelId: label.id, oldLabelName: label.name,
      newLabelId: newLabel.id, newLabelName: newLabel.name,
    });
  }
  return pairs;
}

async function logActivity(row: Record<string, unknown>): Promise<void> {
  try { await db.from("gmail_sync_log").insert(row); } catch (_) { /* never break cleanup over logging */ }
}

// Unlike every other function in this folder (called server-to-server --
// the Gmail Add-on's UrlFetchApp, pg_cron/pg_net, another edge function --
// none of which are subject to CORS at all), this one is called directly
// from the browser (components/admin/GmailLegacyLabelCleanupPanel.tsx), so
// it needs real CORS headers and an OPTIONS preflight response or the
// browser blocks the request before it ever reaches requireCompanyAdmin.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function respond(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...CORS_HEADERS } });
}

// Deployed with --no-verify-jwt (same as every other function in this
// folder, needed elsewhere for callers like the Gmail Add-on that don't
// carry a Supabase session) -- so authorization has to happen INSIDE the
// function body instead of at the platform gateway. This one can delete
// Gmail labels and move messages across every connected mailbox, so it's
// gated to company admins specifically: the caller's own Supabase access
// token (attached by the admin UI's normal signed-in session) is decoded
// via auth.getUser, then checked against company_memberships for the
// requested companyId.
async function requireCompanyAdmin(req: Request, companyId: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, error: "Not authenticated", status: 401 };

  const { data: { user }, error } = await db.auth.getUser(token);
  if (error || !user) return { ok: false, error: "Not authenticated", status: 401 };

  const { data: membership } = await db.from("company_memberships")
    .select("role").eq("user_id", user.id).eq("company_id", companyId).maybeSingle();
  if (membership?.role !== "company_admin") return { ok: false, error: "Admin access required", status: 403 };

  return { ok: true };
}

// ── Function ──────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/gmail-legacy-label-cleanup/, "") || "/";

  try {
    // ── GET /scan?companyId=X — dry-run report, no writes ──────────
    if (req.method === "GET" && path === "/scan") {
      const companyId = url.searchParams.get("companyId") || "";
      if (!companyId) return respond({ error: "Missing companyId" }, 400);
      const auth = await requireCompanyAdmin(req, companyId);
      if (!auth.ok) return respond({ error: auth.error }, auth.status);

      const currentByMatter = await loadCurrentLabelsByMatterNumber(companyId);

      const { data: members } = await db.from("company_memberships").select("user_id").eq("company_id", companyId);
      const { data: profiles } = await db.from("profiles").select("id, full_name, email");
      const nameById = new Map((profiles || []).map((p: any) => [p.id, p.full_name || p.email]));

      const users: any[] = [];
      let totalPairs = 0, totalMessages = 0;
      for (const { user_id } of members || []) {
        const token = await getAccessToken(user_id);
        if (!token) continue;
        const gmailLabels = await getGmailLabels(token);
        const pairs = findMatchedPairs(gmailLabels, currentByMatter);
        if (!pairs.length) continue;

        const pairsWithCounts = await mapWithConcurrency(pairs, SCAN_CONCURRENCY, async p => ({
          ...p, messageCount: await estimateMessageCount(token, p.oldLabelId),
        }));
        const userTotal = pairsWithCounts.reduce((s, p) => s + p.messageCount, 0);
        totalPairs += pairs.length;
        totalMessages += userTotal;
        users.push({ userId: user_id, userName: nameById.get(user_id) || user_id, pairs: pairsWithCounts });
      }

      return respond({ ok: true, users, totalPairs, totalMessages });
    }

    // ── POST /apply { companyId, userId } — bounded, re-invokable ──
    if (req.method === "POST" && path === "/apply") {
      const body = await req.json();
      const { companyId, userId } = body;
      if (!companyId || !userId) return respond({ error: "Missing companyId or userId" }, 400);
      const auth = await requireCompanyAdmin(req, companyId);
      if (!auth.ok) return respond({ error: auth.error }, auth.status);

      const currentByMatter = await loadCurrentLabelsByMatterNumber(companyId);
      const token = await getAccessToken(userId);
      if (!token) return respond({ ok: true, processed: 0, remaining: 0, skipped: "no_token" });

      const gmailLabels = await getGmailLabels(token);
      const pairs = findMatchedPairs(gmailLabels, currentByMatter);
      const batch = pairs.slice(0, MAX_PAIRS_PER_APPLY_CALL);

      let processed = 0;
      for (const pair of batch) {
        const msgIds = await getMessagesWithLabel(token, pair.oldLabelId, MAX_MESSAGES_PER_LABEL_PER_CALL);
        // Real sync jobs (email-sync, label-sync) may be hitting this same
        // Gmail account concurrently -- Gmail's per-user concurrent-request
        // cap is shared across all of them, so this loop stays deliberately
        // narrow (small batches, modest concurrency) rather than racing to
        // finish, to leave headroom instead of tripping 429s that knock
        // real sync jobs into their own retry/failure state.
        let moved = 0;
        for (let i = 0; i < msgIds.length; i += MOVE_CONCURRENCY) {
          const results = await Promise.all(
            msgIds.slice(i, i + MOVE_CONCURRENCY).map(id => moveMessageLabel(token, id, pair.oldLabelId, pair.newLabelId))
          );
          moved += results.filter(Boolean).length;
        }
        // Only delete once nothing's left on the old label -- if this hit
        // MAX_MESSAGES_PER_LABEL_PER_CALL, more may remain; leave the label
        // in place and let the next /apply call finish draining it before
        // deleting (still counts as "processed" here since messages did
        // move -- remaining pairs still ahead of it get their own turn).
        const stillHasMore = msgIds.length >= MAX_MESSAGES_PER_LABEL_PER_CALL;
        if (!stillHasMore) {
          await deleteGmailLabel(token, pair.oldLabelId);
        }
        await logActivity({
          company_id: companyId, triggered_by: null, action: "legacy_label_merged",
          project_id: pair.projectId, gmail_label_name: pair.newLabelName,
          target_user_id: userId,
          details: { old_name: pair.oldLabelName, new_name: pair.newLabelName, messages_moved: moved, label_deleted: !stillHasMore },
        });
        processed++;
      }

      // Re-fetch fresh rather than reasoning about which labels this batch
      // actually finished deleting -- cheap (one call) and unambiguous: a
      // fully-merged label is simply gone from the list, a partially-drained
      // one (hit MAX_MESSAGES_PER_LABEL_PER_CALL) still shows up and gets
      // picked up again on the caller's next /apply call.
      const freshGmailLabels = await getGmailLabels(token);
      const remainingPairs = findMatchedPairs(freshGmailLabels, currentByMatter);

      return respond({ ok: true, processed, remaining: remainingPairs.length });
    }

    return respond({ error: "Not found" }, 404);
  } catch (err: any) {
    console.error("[gmail-legacy-label-cleanup] error:", err.message);
    return respond({ error: err.message || "Unknown error" }, 500);
  }
});
