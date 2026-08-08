// supabase/functions/calendar-watch-renewal/index.ts
// Daily cron -- registers/renews a Google Calendar push-notification watch
// channel for every user who's opted into two-way sync
// (user_gmail_tokens.calendar_sync_enabled = true). Mirrors
// gmail-watch-renewal/index.ts's shape (same token-refresh helper, same
// heartbeat), but Calendar's watch API is channel-based (POST .../watch
// with a channel id + webhook URL) rather than Gmail's Pub/Sub-topic model
// -- there's no separate "renewal keeps the same subscription" concept,
// registering a fresh channel each time (a new channel_id) is how Calendar
// watches work; the old channel is simply left to expire on its own
// (Google doesn't require an explicit stop for a channel that's about to
// lapse anyway).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const WEBHOOK_URL = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/calendar-push`;

async function getAccessToken(userId: string, refreshToken: string, expiresAt: string): Promise<string | null> {
  if (new Date(expiresAt).getTime() >= Date.now() + 60_000) {
    const { data } = await db.from("user_gmail_tokens").select("access_token").eq("user_id", userId).single();
    return data?.access_token ?? null;
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: googleClientId, client_secret: googleClientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const r = await res.json();
  if (!r.access_token) return null;
  await db.from("user_gmail_tokens").update({
    access_token: r.access_token, token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
  }).eq("user_id", userId);
  return r.access_token;
}

async function renewCalendarWatch(userId: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const channelId = crypto.randomUUID();
  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/watch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: channelId, type: "web_hook", address: WEBHOOK_URL }),
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
  const data = await res.json();
  // Channel registered but no sync token yet -- calendar-push's first
  // notification will trigger an initial (syncToken-less) fetch that
  // returns one, see that function's own comment.
  await db.from("user_gmail_tokens").update({
    calendar_channel_id: channelId,
    calendar_resource_id: data.resourceId,
    calendar_channel_expiry: new Date(parseInt(data.expiration)).toISOString(),
  }).eq("user_id", userId);
  return { ok: true };
}

Deno.serve(async (_req) => {
  const started = Date.now();
  let renewed = 0, failed = 0;
  try {
    const in24h = Date.now() + 24 * 60 * 60 * 1000; // Calendar channels max out at 7 days -- renew well before that
    const { data: tokens } = await db.from("user_gmail_tokens")
      .select("user_id, refresh_token, token_expires_at, calendar_channel_expiry")
      .eq("calendar_sync_enabled", true);

    for (const t of (tokens ?? []) as any[]) {
      const expiry = t.calendar_channel_expiry ? new Date(t.calendar_channel_expiry).getTime() : 0;
      if (expiry > in24h) continue; // still healthy

      const token = await getAccessToken(t.user_id, t.refresh_token, t.token_expires_at);
      if (!token) { failed++; continue; }
      const result = await renewCalendarWatch(t.user_id, token);
      if (result.ok) renewed++; else { failed++; console.error("[calendar-watch-renewal] failed for", t.user_id, result.error); }
    }

    await db.from("cron_heartbeats").upsert(
      { name: "calendar-watch-renewal", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: { renewed, failed } },
      { onConflict: "name" }
    );
    return new Response(JSON.stringify({ ok: true, renewed, failed }), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    await db.from("cron_heartbeats").upsert(
      { name: "calendar-watch-renewal", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: { ok: false, error: err.message } },
      { onConflict: "name" }
    );
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
