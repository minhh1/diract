// supabase/functions/outlook-push/index.ts
// Graph change-notification webhook — the Outlook equivalent of
// supabase/functions/gmail-push. Two big differences from Gmail's Pub/Sub
// push:
//   1. Graph requires an immediate validationToken echo-back handshake on
//      subscription creation/renewal, which Gmail has no equivalent of.
//   2. The notification body only says "something changed for this
//      subscription" — no payload of *what* changed, unlike Gmail's
//      history.list which returns the actual diff. The real diff comes
//      from a delta-query pass (using the user's stored delta_link as a
//      cursor) triggered by the notification.
// Scope for this pass: detect a category matching a known project being
// manually applied (in native Outlook) to a message we don't already know
// about, and enqueue a label_sync job to propagate it to the rest of the
// team — mirroring Gmail's labelsAdded handling. Message deletion and
// category-removal detection are not handled here (out of scope for this
// phase, same as gmail-push's messagesDeleted/labelsRemoved paths would be
// for a first pass).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const microsoftClientId = Deno.env.get("MICROSOFT_CLIENT_ID")!;
const microsoftClientSecret = Deno.env.get("MICROSOFT_CLIENT_SECRET")!;
const microsoftTenant = Deno.env.get("MICROSOFT_TENANT") || "common";
const webhookSecret = Deno.env.get("OUTLOOK_WEBHOOK_SECRET")!;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ── Token refresh ──────────────────────────────────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db.from("user_outlook_tokens")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", userId).single();
  if (!data) return null;
  if (new Date(data.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch(`https://login.microsoftonline.com/${microsoftTenant}/oauth2/v2.0/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: microsoftClientId, client_secret: microsoftClientSecret,
        refresh_token: data.refresh_token, grant_type: "refresh_token",
      }),
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

async function logActivity(row: Record<string, unknown>): Promise<void> {
  try { await db.from("outlook_sync_log").insert(row); } catch (_) { /* never break sync over logging */ }
}

// ── Enqueue/reset a label_sync job, seeded with this user already done ──

async function enqueueLabelSyncJob(companyId: string, projectId: string, labelCode: string | null, categoryName: string, alreadyDoneUserId: string): Promise<void> {
  const { data: members } = await db.from("company_memberships").select("user_id").eq("company_id", companyId);
  const memberIds = (members || []).map((m: any) => m.user_id);
  const { data: connected } = memberIds.length
    ? await db.from("user_outlook_tokens").select("user_id").in("user_id", memberIds)
    : { data: [] as any[] };
  const totalUsers = (connected || []).length;
  if (!totalUsers) return;

  const { data: existing } = await db.from("outlook_sync_jobs")
    .select("id, status, completed_users")
    .eq("job_type", "label_sync").eq("company_id", companyId).eq("project_id", projectId)
    .maybeSingle();

  if (existing && existing.status !== "processing") {
    const completed = new Set(existing.completed_users || []);
    completed.add(alreadyDoneUserId);
    await db.from("outlook_sync_jobs").update({
      status: "pending", attempts: 0, error: null,
      completed_users: Array.from(completed), total_users: totalUsers,
      is_realtime: true, updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else if (!existing) {
    await db.from("outlook_sync_jobs").insert({
      job_type: "label_sync", company_id: companyId, project_id: projectId,
      label_code: labelCode, category_name: categoryName, status: "pending",
      attempts: 0, completed_users: [alreadyDoneUserId], total_users: totalUsers,
      is_realtime: true,
    });
  }
}

// ── Delta pass for one user ───────────────────────────────────────────

async function processUserDelta(userId: string): Promise<void> {
  const { data: tokenRow } = await db.from("user_outlook_tokens")
    .select("company_id, delta_link").eq("user_id", userId).single();
  if (!tokenRow?.company_id) return;

  const token = await getAccessToken(userId);
  if (!token) return;

  // Central Email: when on for this company, skip fanning the category out
  // to every other member's mailbox (enqueueLabelSyncJob below) -- same
  // treatment as gmail-push's resetJobsForNewEmail gate.
  const { data: companyRow } = await db.from("companies")
    .select("central_email_enabled").eq("id", tokenRow.company_id).single();
  const centralEmailEnabled = !!companyRow?.central_email_enabled;

  if (!tokenRow.delta_link) {
    console.log(`[outlook-push] No delta_link for ${userId} — skipping until setup-outlook-watch seeds one`);
    return;
  }

  let url: string | null = tokenRow.delta_link;
  let deltaLink: string | null = tokenRow.delta_link;
  const items: any[] = [];

  while (url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error(`[outlook-push] Delta fetch failed for ${userId}: ${res.status}`);
      break;
    }
    const page = await res.json();
    items.push(...(page.value || []));
    url = page["@odata.nextLink"] || null;
    if (page["@odata.deltaLink"]) deltaLink = page["@odata.deltaLink"];
  }

  console.log(`[outlook-push] ${items.length} changed item(s) for ${userId}`);

  for (const item of items) {
    if (item["@removed"] || !item.id) continue; // deletion handling deferred

    const categories: string[] = item.categories || [];
    if (!categories.length) continue;

    const { data: existing } = await db.from("project_outlook_emails")
      .select("id, categories").eq("user_id", userId).eq("outlook_message_id", item.id).maybeSingle();

    const prevCategories: string[] = existing?.categories || [];
    const newlyAdded = categories.filter(c => !prevCategories.includes(c));
    if (!newlyAdded.length) {
      if (existing) {
        await db.from("project_outlook_emails")
          .update({ categories, last_synced_at: new Date().toISOString() })
          .eq("id", existing.id);
      }
      continue;
    }

    for (const categoryName of newlyAdded) {
      const { data: labelRow } = await db.from("project_outlook_labels")
        .select("project_id, label_code").eq("company_id", tokenRow.company_id)
        .eq("category_name", categoryName).is("removed_at", null).maybeSingle();
      if (!labelRow) continue;

      if (existing) {
        await db.from("project_outlook_emails")
          .update({ categories, last_synced_at: new Date().toISOString() })
          .eq("id", existing.id);
      } else {
        await db.from("project_outlook_emails").insert({
          user_id: userId, company_id: tokenRow.company_id, project_id: labelRow.project_id,
          outlook_message_id: item.id, outlook_internet_message_id: item.internetMessageId || item.id,
          outlook_conversation_id: item.conversationId || null, categories,
          subject: item.subject || "(no subject)",
          from_address: item.from?.emailAddress?.address || "",
          from_name: item.from?.emailAddress?.name || "",
          date: item.receivedDateTime || null,
          snippet: item.bodyPreview || "",
        });
      }

      if (!centralEmailEnabled) {
        await enqueueLabelSyncJob(tokenRow.company_id, labelRow.project_id, labelRow.label_code, categoryName, userId);
      }
      await logActivity({
        company_id: tokenRow.company_id, triggered_by: userId, action: "label_applied",
        project_id: labelRow.project_id, outlook_message_id: item.id, category_name: categoryName,
        target_user_id: userId, details: { source: "native_outlook_detected" },
      });
      console.log(`[outlook-push] Detected native category "${categoryName}" on ${item.id} for ${userId} — job enqueued`);
    }
  }

  if (deltaLink && deltaLink !== tokenRow.delta_link) {
    await db.from("user_outlook_tokens").update({
      delta_link: deltaLink, updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
  }
}

// ── Entry point ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    console.log("[outlook-push] Echoing validationToken handshake");
    return new Response(validationToken, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid body" }), { status: 400 });
  }

  const notifications: any[] = body.value || [];
  console.log(`[outlook-push] Received ${notifications.length} notification(s)`);

  const userIds = new Set<string>();
  for (const n of notifications) {
    if (n.clientState !== webhookSecret) {
      console.warn("[outlook-push] clientState mismatch — rejecting notification");
      continue;
    }
    const { data: tokenRow } = await db.from("user_outlook_tokens")
      .select("user_id").eq("subscription_id", n.subscriptionId).maybeSingle();
    if (tokenRow?.user_id) userIds.add(tokenRow.user_id);
  }

  for (const userId of userIds) {
    try {
      await processUserDelta(userId);
    } catch (err: any) {
      console.error(`[outlook-push] Delta processing failed for ${userId}:`, err.message);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: userIds.size }), {
    status: 202, headers: { "Content-Type": "application/json" },
  });
});
