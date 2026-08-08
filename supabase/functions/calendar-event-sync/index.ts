// supabase/functions/calendar-event-sync/index.ts
// One-way push: creates/updates/cancels a Google Calendar event for a
// bookable calendar_events row, on the ORGANIZER's own primary calendar
// only -- gated on user_gmail_tokens.calendar_sync_enabled (opt-in, off by
// default). Called with: { action: 'upsert' | 'cancel', eventId }, same
// shape as the existing task sync (supabase/functions/calendar-sync,
// lib/triggerCalendarSync.ts) -- kept as its own function rather than
// folded into that one since calendar_events and tasks are different
// enough shapes (no title-format tokens, no dual assignee/company sync
// targets, just one organizer) that branching one handler on which id was
// passed would be messier than two small focused functions.
//
// Deliberately does NOT add invitees as Google Calendar attendees -- this
// app's own invite/RSVP system (calendar_event_invites, the emailed public
// RSVP page) is the single source of truth for who's invited and whether
// they've responded; adding Google attendees too would have Google send
// its own separate invite emails, doubling up confusingly. This only
// blocks time on the organizer's own calendar so what's booked in Diract
// shows up there too.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db.from("user_gmail_tokens")
    .select("access_token, refresh_token, token_expires_at, calendar_sync_enabled")
    .eq("user_id", userId).single();
  if (!data || !data.calendar_sync_enabled) return null;
  if (new Date(data.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: googleClientId, client_secret: googleClientSecret,
        refresh_token: data.refresh_token, grant_type: "refresh_token" }),
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

function buildEvent(event: { title: string; description: string | null; location: string | null; start_at: string; end_at: string; all_day: boolean; status: string }): any {
  const start = event.all_day
    ? { date: event.start_at.slice(0, 10) }
    : { dateTime: event.start_at };
  const end = event.all_day
    ? { date: event.end_at.slice(0, 10) }
    : { dateTime: event.end_at };
  return {
    summary: event.title,
    description: event.description || undefined,
    location: event.location || undefined,
    start, end,
    status: event.status === "cancelled" ? "cancelled" : "confirmed",
  };
}

Deno.serve(async (req) => {
  const corsHeaders = { "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const started = Date.now();
  let heartbeatResult: Record<string, unknown> = { ok: true };
  try {
    const { action, eventId } = await req.json();
    if (!eventId) return new Response(JSON.stringify({ error: "Missing eventId" }), { status: 400, headers: corsHeaders });

    const { data: event, error: eventErr } = await db.from("calendar_events")
      .select("id, created_by, title, description, location, start_at, end_at, all_day, status, google_event_id")
      .eq("id", eventId).single();
    if (eventErr || !event) return new Response(JSON.stringify({ error: "Event not found" }), { status: 404, headers: corsHeaders });

    if (!event.created_by) {
      return new Response(JSON.stringify({ ok: true, skipped: "no organizer" }), { headers: corsHeaders });
    }
    const token = await getAccessToken(event.created_by);
    if (!token) {
      return new Response(JSON.stringify({ ok: true, skipped: "organizer hasn't opted into calendar sync" }), { headers: corsHeaders });
    }

    if (action === "cancel" && event.google_event_id) {
      await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.google_event_id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` },
      });
      await db.from("calendar_events").update({ google_event_id: null }).eq("id", eventId);
      return new Response(JSON.stringify({ ok: true, action: "cancel" }), { headers: corsHeaders });
    }

    const body = buildEvent(event);
    let googleEventId = event.google_event_id;

    if (googleEventId) {
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${googleEventId}`, {
        method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok && res.status === 404) googleEventId = null; // gone -- recreate below
      else if (!res.ok) {
        const err = await res.text();
        console.error("[calendar-event-sync] update error:", err);
        return new Response(JSON.stringify({ error: err }), { status: 500, headers: corsHeaders });
      }
    }

    if (!googleEventId) {
      const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.text();
        console.error("[calendar-event-sync] create error:", err);
        return new Response(JSON.stringify({ error: err }), { status: 500, headers: corsHeaders });
      }
      const data = await res.json();
      googleEventId = data.id;
      await db.from("calendar_events").update({ google_event_id: googleEventId }).eq("id", eventId);
    }

    return new Response(JSON.stringify({ ok: true, googleEventId }), { headers: corsHeaders });
  } catch (err: any) {
    console.error("[calendar-event-sync] error:", err.message);
    heartbeatResult = { ok: false, error: err.message };
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  } finally {
    await db.from("cron_heartbeats").upsert(
      { name: "calendar-event-sync", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: heartbeatResult },
      { onConflict: "name" }
    );
  }
});
