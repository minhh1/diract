// supabase/functions/outlook-watch-renewal/index.ts
// Runs every 6 hours (vs. gmail-watch-renewal's daily) — Graph subscriptions
// on mail resources expire in ~3 days max, so this needs a much tighter
// cadence than Gmail's ~7-day watch to avoid a gap. Renews subscriptions
// expiring within 24h and flags stalled sync (no delta activity in 24h).
// Admin email alerting (which gmail-watch-renewal has) is deferred —
// out of scope for this pass, same as the admin dashboard.

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
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const NOTIFICATION_URL = `${SUPABASE_URL}/functions/v1/outlook-push`;
const SUBSCRIPTION_MINUTES = 4230;

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

// ── Renew or (re)create the subscription ─────────────────────────────

async function renewOrCreateSubscription(
  userId: string, token: string, existingSubscriptionId: string | null
): Promise<{ ok: boolean; expiry?: string; subscriptionId?: string; error?: string }> {
  const expirationDateTime = new Date(Date.now() + SUBSCRIPTION_MINUTES * 60 * 1000).toISOString();

  if (existingSubscriptionId) {
    const res = await fetch(`${GRAPH_BASE}/subscriptions/${existingSubscriptionId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expirationDateTime }),
    });
    if (res.ok) {
      const data = await res.json();
      await db.from("user_outlook_tokens").update({
        subscription_expiry: data.expirationDateTime,
        updated_at: new Date().toISOString(),
      }).eq("user_id", userId);
      return { ok: true, expiry: data.expirationDateTime, subscriptionId: existingSubscriptionId };
    }
    // Renewal can 404 if the subscription already lapsed — fall through and
    // create a fresh one instead of giving up.
    console.log(`[outlook-watch-renewal] Renew failed (${res.status}) for subscription ${existingSubscriptionId} — recreating`);
  }

  const createRes = await fetch(`${GRAPH_BASE}/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      changeType: "created,updated",
      notificationUrl: NOTIFICATION_URL,
      resource: "me/mailFolders('inbox')/messages",
      expirationDateTime,
      clientState: webhookSecret,
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    return { ok: false, error: `${createRes.status} ${err}` };
  }
  const created = await createRes.json();
  await db.from("user_outlook_tokens").update({
    subscription_id: created.id,
    subscription_expiry: created.expirationDateTime,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  return { ok: true, expiry: created.expirationDateTime, subscriptionId: created.id };
}

// ── Heartbeat ──────────────────────────────────────────────────────

async function heartbeat(name: string, durationMs: number, result: unknown): Promise<void> {
  try {
    await db.from("cron_heartbeats").upsert(
      { name, last_run_at: new Date().toISOString(), last_duration_ms: durationMs, last_result: result },
      { onConflict: "name" }
    );
  } catch (_) { /* never break the check over a heartbeat write */ }
}

// ── Main ───────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  console.log("[outlook-watch-renewal] START");
  const t0 = Date.now();
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;
  const stalledThreshold = now - 24 * 60 * 60 * 1000;

  const { data: tokens } = await db.from("user_outlook_tokens")
    .select("user_id, email, subscription_id, subscription_expiry, delta_link, updated_at");

  const renewed: string[] = [];
  const stalled: { email: string; reason: string }[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const t of (tokens || []) as any[]) {
    const { user_id: userId, email, subscription_id, subscription_expiry, delta_link, updated_at } = t;

    const lastUpdate = updated_at ? new Date(updated_at).getTime() : 0;
    const subExpiry = subscription_expiry ? new Date(subscription_expiry).getTime() : 0;

    let stalledReason = "";
    if (!subscription_id) stalledReason = "No subscription configured";
    else if (subExpiry < now) stalledReason = `Subscription expired ${new Date(subExpiry).toLocaleString("en-AU")}`;
    else if (!delta_link) stalledReason = "No delta cursor — never completed an initial sync";
    else if (lastUpdate < stalledThreshold && lastUpdate > 0) {
      stalledReason = `No activity for ${Math.round((now - lastUpdate) / 3600000)}h`;
    }
    if (stalledReason) {
      console.log(`[outlook-watch-renewal] STALLED: ${email} — ${stalledReason}`);
      stalled.push({ email, reason: stalledReason });
    }

    const needsRenewal = !subscription_expiry || subExpiry < in24h;
    if (needsRenewal || !subscription_id) {
      console.log(`[outlook-watch-renewal] Renewing subscription for ${email}`);
      const token = await getAccessToken(userId);
      if (!token) {
        failed.push({ email, error: "Cannot refresh OAuth token" });
        continue;
      }
      const result = await renewOrCreateSubscription(userId, token, subscription_id);
      if (result.ok) {
        console.log(`[outlook-watch-renewal] ✓ Renewed ${email} — expires ${result.expiry}`);
        renewed.push(email);
      } else {
        console.error(`[outlook-watch-renewal] ✗ Failed to renew ${email}: ${result.error}`);
        failed.push({ email, error: result.error || "Unknown" });
      }
    } else {
      const hoursLeft = Math.round((subExpiry - now) / 3600000);
      console.log(`[outlook-watch-renewal] ✓ ${email} subscription OK — ${hoursLeft}h remaining`);
    }
  }

  const result = { renewed, stalled, failed };
  console.log(`[outlook-watch-renewal] DONE in ${Date.now() - t0}ms —`, JSON.stringify(result));
  await heartbeat("outlook-watch-renewal", Date.now() - t0, result);
  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: { "Content-Type": "application/json" },
  });
});
