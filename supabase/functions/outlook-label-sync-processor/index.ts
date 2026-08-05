// supabase/functions/outlook-label-sync-processor/index.ts
// Does the actual Graph work for ONE (job, user) pair. Invoked directly by
// outlook-label-sync-worker via a plain HTTPS fetch, mirroring
// gmail-label-sync-processor's isolate-per-unit design.
//
// Key Graph-specific differences from the Gmail processor:
//   - there is no "list every message with this label" call to compare
//     against (Gmail's getMessagesWithLabel) -- each known message has to be
//     looked up individually by internetMessageId, since Graph's own `id`
//     is opaque and different per mailbox for the same email.
//   - moving a message to a folder (POST /messages/{id}/move) returns a
//     NEW message with a new id -- every write path below applies the
//     category first, then moves, then uses the post-move id.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const microsoftClientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const microsoftClientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
const microsoftTenant = Deno.env.get("MICROSOFT_TENANT") || "common";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

const FETCH_TIMEOUT_MS = 15_000;
function withTimeout(): AbortSignal { return AbortSignal.timeout(FETCH_TIMEOUT_MS); }

// A fixed preset color for every matter category -- Graph only accepts
// colors from a closed preset0..preset24 palette, and reuse across
// categories is fine (only the display name has to be unique).
const CATEGORY_COLOR = "preset9";

// ── Token ──────────────────────────────────────────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db.from("user_outlook_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId).single();
  if (!data) return null;

  if (new Date(data.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch(`https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: microsoftClientId, client_secret: microsoftClientSecret,
        refresh_token: data.refresh_token, grant_type: "refresh_token",
      }),
      signal: withTimeout(),
    });
    const r = await res.json();
    if (!r.access_token) return null;
    await db.from("user_outlook_tokens").update({
      access_token: r.access_token,
      token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
    }).eq("user_id", userId);
    return r.access_token;
  }
  return data.access_token;
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

// ── Graph: folder ──────────────────────────────────────────────────

async function getOrCreateMailFolder(token: string, folderName: string): Promise<string | null> {
  const listRes = await fetch(`${GRAPH_BASE}/me/mailFolders?$top=100`, {
    headers: { Authorization: `Bearer ${token}` }, signal: withTimeout(),
  });
  if (listRes.ok) {
    const data = await listRes.json();
    const found = (data.value || []).find((f: any) => f.displayName === folderName);
    if (found) return found.id;
  }
  const createRes = await fetch(`${GRAPH_BASE}/me/mailFolders`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: folderName }), signal: withTimeout(),
  });
  if (!createRes.ok) return null;
  const created = await createRes.json();
  return created.id;
}

// ── Graph: category ────────────────────────────────────────────────

async function getOrCreateCategory(token: string, categoryName: string): Promise<boolean> {
  const listRes = await fetch(`${GRAPH_BASE}/me/outlook/masterCategories`, {
    headers: { Authorization: `Bearer ${token}` }, signal: withTimeout(),
  });
  if (listRes.ok) {
    const data = await listRes.json();
    if ((data.value || []).some((c: any) => c.displayName === categoryName)) return true;
  }
  const createRes = await fetch(`${GRAPH_BASE}/me/outlook/masterCategories`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: categoryName, color: CATEGORY_COLOR }), signal: withTimeout(),
  });
  return createRes.ok;
}

// ── Graph: message lookup + apply ─────────────────────────────────

async function findMessageByInternetMessageId(token: string, internetMessageId: string): Promise<{ id: string; categories: string[] } | null> {
  const filter = `internetMessageId eq '${escapeODataString(internetMessageId)}'`;
  const res = await fetch(`${GRAPH_BASE}/me/messages?$filter=${encodeURIComponent(filter)}&$select=id,categories&$top=1`, {
    headers: { Authorization: `Bearer ${token}` }, signal: withTimeout(),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const msg = (data.value || [])[0];
  return msg ? { id: msg.id, categories: msg.categories || [] } : null;
}

// Applies the category, then moves into folderId. Returns the post-move
// message id (Graph mints a new id on move) or null on failure.
async function applyCategoryAndMove(
  token: string, messageId: string, existingCategories: string[], categoryName: string, folderId: string
): Promise<string | null> {
  if (!existingCategories.includes(categoryName)) {
    const patchRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ categories: [...existingCategories, categoryName] }), signal: withTimeout(),
    });
    if (!patchRes.ok) return null;
  }
  const moveRes = await fetch(`${GRAPH_BASE}/me/messages/${messageId}/move`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ destinationId: folderId }), signal: withTimeout(),
  });
  if (!moveRes.ok) return messageId; // category applied even if already in the target folder and move 404s
  const moved = await moveRes.json();
  return moved.id || messageId;
}

async function removeCategory(token: string, messageId: string, existingCategories: string[], categoryName: string): Promise<boolean> {
  if (!existingCategories.includes(categoryName)) return true;
  const res = await fetch(`${GRAPH_BASE}/me/messages/${messageId}`, {
    method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ categories: existingCategories.filter(c => c !== categoryName) }), signal: withTimeout(),
  });
  return res.ok;
}

// ── Job / logging helpers ──────────────────────────────────────────

async function markUserComplete(jobId: string, userId: string, totalUsers: number): Promise<void> {
  const { data: job } = await db.from("outlook_sync_jobs")
    .select("completed_users, total_users").eq("id", jobId).single();
  if (!job) return;
  const completed: string[] = job.completed_users || [];
  if (!completed.includes(userId)) completed.push(userId);
  const allDone = completed.length >= (job.total_users || totalUsers);
  await db.from("outlook_sync_jobs").update({
    completed_users: completed,
    status: allDone ? "done" : "processing",
    updated_at: new Date().toISOString(),
  }).eq("id", jobId);
}

async function logActivity(row: Record<string, unknown>): Promise<void> {
  try { await db.from("outlook_sync_log").insert(row); } catch (_) { /* never break sync over logging */ }
}

async function quarantineUser(params: {
  companyId: string; jobId: string; jobType: string; projectId: string; userId: string;
  categoryName: string; error: string;
}): Promise<void> {
  try {
    const { data: existing } = await db.from("outlook_sync_failures")
      .select("id, status").eq("job_id", params.jobId).eq("user_id", params.userId).maybeSingle();
    if (existing) {
      if (existing.status === "resolved") {
        await db.from("outlook_sync_failures").update({
          status: "pending_retry", attempts: 0, last_error: params.error,
          first_failed_at: new Date().toISOString(), last_attempted_at: new Date().toISOString(), resolved_at: null,
        }).eq("id", existing.id);
      } else {
        await db.from("outlook_sync_failures").update({
          last_error: params.error, last_attempted_at: new Date().toISOString(),
        }).eq("id", existing.id);
      }
    } else {
      await db.from("outlook_sync_failures").insert({
        company_id: params.companyId, job_id: params.jobId, job_type: params.jobType,
        project_id: params.projectId, user_id: params.userId,
        status: "pending_retry", last_error: params.error, last_attempted_at: new Date().toISOString(),
      });
    }
  } catch (_) { /* never break sync over quarantine bookkeeping */ }

  await logActivity({
    company_id: params.companyId, triggered_by: null, action: "sync_error",
    project_id: params.projectId, category_name: params.categoryName,
    target_user_id: params.userId, details: { job_type: params.jobType, error: params.error },
  });
}

function respond(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

// ── Function ──────────────────────────────────────────────────────

interface ProcessorRequest {
  jobId: string; userId: string; companyId: string; projectId: string;
  labelCode: string | null; categoryName: string; totalUsers: number;
  isRemoved: boolean; knownMessages: { internetMessageId: string }[]; fastPath: boolean;
}

Deno.serve(async (req) => {
  let body: ProcessorRequest;
  try { body = await req.json(); } catch {
    return respond({ ok: false, error: "Invalid request body" }, 400);
  }

  const { jobId, userId, companyId, projectId, categoryName, totalUsers, isRemoved, knownMessages, fastPath } = body;
  console.log(`[outlook-label-sync-processor] job=${jobId} user=${userId} category="${categoryName}"`);

  try {
    const token = await getAccessToken(userId);
    if (!token) {
      console.log(`[outlook-label-sync-processor] No token for ${userId} -- marking complete (nothing to do)`);
      await markUserComplete(jobId, userId, totalUsers);
      return respond({ ok: true, userId, skipped: "no_token" });
    }

    const { data: memberCheck } = await db.from("company_memberships")
      .select("user_id").eq("user_id", userId).eq("company_id", companyId).maybeSingle();
    if (!memberCheck) {
      console.log(`[outlook-label-sync-processor] ${userId} is not a member of ${companyId} -- skipping without marking complete`);
      return respond({ ok: true, userId, skipped: "not_member" });
    }

    if (isRemoved) {
      for (const { internetMessageId } of knownMessages) {
        const found = await findMessageByInternetMessageId(token, internetMessageId);
        if (found) await removeCategory(token, found.id, found.categories, categoryName);
      }
      await logActivity({
        company_id: companyId, triggered_by: null, action: "label_removed",
        project_id: projectId, category_name: categoryName, target_user_id: userId, details: {},
      });
      console.log(`[outlook-label-sync-processor] ✓ Removed category for ${userId}`);
    } else {
      const { data: company } = await db.from("companies")
        .select("outlook_parent_folder").eq("id", companyId).single();
      const folderName = company?.outlook_parent_folder || "Shared Emails";

      const folderId = await getOrCreateMailFolder(token, folderName);
      const categoryOk = await getOrCreateCategory(token, categoryName);
      if (!folderId || !categoryOk) throw new Error("Could not ensure folder/category exist");

      if (!fastPath) {
        let applied = 0;
        for (const { internetMessageId } of knownMessages) {
          const found = await findMessageByInternetMessageId(token, internetMessageId);
          if (!found) continue;
          if (found.categories.includes(categoryName)) continue;
          const newId = await applyCategoryAndMove(token, found.id, found.categories, categoryName, folderId);
          if (newId) {
            applied++;
            await db.from("project_outlook_emails").upsert({
              user_id: userId, company_id: companyId, project_id: projectId,
              outlook_message_id: newId, outlook_internet_message_id: internetMessageId,
              categories: [...found.categories, categoryName],
              last_synced_at: new Date().toISOString(),
            }, { onConflict: "user_id,outlook_message_id" });
          }
        }
        console.log(`[outlook-label-sync-processor] Applied ${applied}/${knownMessages.length} messages for ${userId}`);
      } else {
        console.log(`[outlook-label-sync-processor] Fast path -- folder/category ensured, nothing to backfill`);
      }

      await logActivity({
        company_id: companyId, triggered_by: null, action: "label_applied",
        project_id: projectId, category_name: categoryName, target_user_id: userId, details: { fastPath },
      });
    }

    await markUserComplete(jobId, userId, totalUsers);
    console.log(`[outlook-label-sync-processor] ✓ User ${userId} complete`);
    return respond({ ok: true, userId });

  } catch (err: any) {
    console.error(`[outlook-label-sync-processor] ✗ User ${userId} failed:`, err.message);
    await quarantineUser({
      companyId, jobId, jobType: "label_sync", projectId, userId,
      categoryName, error: err.message || "Unknown error",
    });
    return respond({ ok: false, userId, quarantined: true, error: err.message });
  }
});
