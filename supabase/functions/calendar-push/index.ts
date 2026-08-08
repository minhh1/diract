// supabase/functions/calendar-push/index.ts
// Incoming webhook for Google Calendar push notifications -- registered by
// calendar-watch-renewal/index.ts. Mirrors gmail-push/index.ts's overall
// shape (always 200, routes by a token-row lookup, fetches only the diff
// since last time) but Calendar's push has no Pub/Sub envelope -- just
// X-Goog-Channel-ID / X-Goog-Resource-ID / X-Goog-Resource-State headers,
// empty body -- so routing looks up user_gmail_tokens by calendar_resource_id
// instead of an email address, and the actual diff comes from Calendar's
// own incremental sync (syncToken), not a history id.
//
// Deliberately only updates calendar_events rows that already have a
// matching google_event_id (i.e. originated in Diract) -- an event created
// directly in Google Calendar with no Diract counterpart is not imported.
// This keeps a user's own Diract-booked events in sync both ways without
// turning into a full external-calendar importer.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db.from("user_gmail_tokens").select("access_token, refresh_token, token_expires_at").eq("user_id", userId).single();
  if (!data) return null;
  if (new Date(data.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: googleClientId, client_secret: googleClientSecret, refresh_token: data.refresh_token, grant_type: "refresh_token" }),
    });
    const r = await res.json();
    if (!r.access_token) return null;
    await db.from("user_gmail_tokens").update({ access_token: r.access_token, token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() }).eq("user_id", userId);
    return r.access_token;
  }
  return data.access_token;
}

async function fetchChanges(token: string, syncToken: string | null): Promise<{ items: any[]; nextSyncToken: string | null; invalidToken: boolean }> {
  const params = new URLSearchParams({ singleEvents: "true" });
  if (syncToken) params.set("syncToken", syncToken);
  else params.set("timeMin", new Date().toISOString()); // bootstrap: only need going forward, not full history

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 410) return { items: [], nextSyncToken: null, invalidToken: true }; // expired/invalid syncToken -- caller re-bootstraps
  if (!res.ok) { console.error("[calendar-push] list error:", await res.text()); return { items: [], nextSyncToken: syncToken, invalidToken: false }; }
  const data = await res.json();
  return { items: data.items ?? [], nextSyncToken: data.nextSyncToken ?? syncToken, invalidToken: false };
}

Deno.serve(async (req) => {
  const started = Date.now();
  let heartbeatResult: Record<string, unknown> = { ok: true };
  try {
    const resourceId = req.headers.get("X-Goog-Resource-ID");
    const resourceState = req.headers.get("X-Goog-Resource-State");
    if (!resourceId) return new Response("ok", { status: 200 }); // nothing to route on

    // 'sync' is Calendar's initial confirmation right after watch
    // registration -- no real change to process yet.
    if (resourceState === "sync") return new Response("ok", { status: 200 });

    const { data: tokenRow } = await db.from("user_gmail_tokens")
      .select("user_id, calendar_sync_token, calendar_sync_enabled").eq("calendar_resource_id", resourceId).maybeSingle();
    if (!tokenRow || !tokenRow.calendar_sync_enabled) return new Response("ok", { status: 200 });

    const token = await getAccessToken(tokenRow.user_id);
    if (!token) return new Response("ok", { status: 200 });

    let result = await fetchChanges(token, tokenRow.calendar_sync_token);
    if (result.invalidToken) result = await fetchChanges(token, null); // re-bootstrap once

    let updated = 0;
    for (const item of result.items) {
      if (!item.id) continue;
      const { data: existing } = await db.from("calendar_events").select("id").eq("google_event_id", item.id).maybeSingle();
      if (!existing) continue; // not a Diract-originated event -- ignore per this function's own scope (see header comment)

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (item.status === "cancelled") {
        updates.status = "cancelled";
      } else {
        if (item.summary) updates.title = item.summary;
        updates.description = item.description ?? null;
        updates.location = item.location ?? null;
        if (item.start?.dateTime) { updates.start_at = item.start.dateTime; updates.all_day = false; }
        else if (item.start?.date) { updates.start_at = `${item.start.date}T00:00:00`; updates.all_day = true; }
        if (item.end?.dateTime) updates.end_at = item.end.dateTime;
        else if (item.end?.date) updates.end_at = `${item.end.date}T00:00:00`;
        updates.status = "confirmed";
      }
      await db.from("calendar_events").update(updates).eq("id", existing.id);
      updated++;
    }

    if (result.nextSyncToken) await db.from("user_gmail_tokens").update({ calendar_sync_token: result.nextSyncToken }).eq("user_id", tokenRow.user_id);

    heartbeatResult = { ok: true, updated };
    return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("[calendar-push] error:", err.message);
    heartbeatResult = { ok: false, error: err.message };
    return new Response("ok", { status: 200 }); // still 200 -- Google retries/backs off on non-200, never want that for a real bug on our side
  } finally {
    await db.from("cron_heartbeats").upsert(
      { name: "calendar-push", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: heartbeatResult },
      { onConflict: "name" }
    );
  }
});
