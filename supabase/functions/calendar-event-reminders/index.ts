// supabase/functions/calendar-event-reminders/index.ts
// Sends "this is happening today" reminder emails to EXTERNAL calendar
// event invitees. Internal invitees are handled entirely in SQL
// (sweep_calendar_event_reminders(), see supabase/migrations/
// 20260808220000_calendar_events.sql) via create_notification -- external
// invitees aren't real users (no recipient_user_id create_notification
// could target) and sending an email is a fetch call a SQL function can't
// make directly, so this function owns that half on its own: its own
// query for today's confirmed events, its own dedup insert into the SAME
// calendar_event_reminders_sent table SQL's sweep already uses (safe --
// this only ever touches invite_type='external' rows, SQL's sweep only
// ever touches 'internal' ones, so there's no collision), then a direct
// Resend send. Cron'd once daily in the same SQL migration's schedule,
// called via net.http_post right after the two SQL sweeps -- see that
// migration for the exact cron entry.
//
// Email-sending logic (resolveSender/company_email_domains, the Resend
// call shape, email_log write) is a direct Deno port of lib/email/
// sendEmail.ts + lib/email/resend.ts, which are Next.js/Node-only and
// can't be imported into a Deno edge function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const DEFAULT_FROM = Deno.env.get("EMAIL_FROM_DEFAULT") || "Diract <notifications@diract.io>";
const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://diract.io";

async function resolveSender(companyId: string): Promise<string> {
  const { data } = await db.from("company_email_domains").select("domain, from_name, from_local_part").eq("company_id", companyId).eq("status", "verified").maybeSingle();
  if (!data) return DEFAULT_FROM;
  return `${data.from_name} <${data.from_local_part}@${data.domain}>`;
}

async function sendResendEmail(from: string, to: string, subject: string, html: string): Promise<{ id: string | null; error: string | null }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { id: null, error: `Resend failed: ${res.status} ${json?.message ?? JSON.stringify(json)}` };
  return { id: json.id ?? null, error: null };
}

function formatEventTime(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleString("en-AU", opts)} - ${end.toLocaleString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
}

Deno.serve(async (_req) => {
  const started = Date.now();
  let heartbeatResult: Record<string, unknown> = { ok: true };
  try {
    // "Today" pinned to Australia/Sydney, matching sweep_calendar_reminders'
    // own AEST convention -- every company using this today is AU-based.
    const todayAEST = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
    const today = todayAEST.toISOString().slice(0, 10);

    const { data: events } = await db.from("calendar_events")
      .select("id, company_id, title, description, location, start_at, end_at")
      .eq("status", "confirmed").gte("start_at", `${today}T00:00:00`).lt("start_at", `${today}T23:59:59.999`);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of events ?? []) {
      const { data: invites } = await db.from("calendar_event_invites")
        .select("id, external_name, external_email, slug").eq("event_id", event.id).eq("invite_type", "external");

      for (const invite of invites ?? []) {
        const { error: dedupError } = await db.from("calendar_event_reminders_sent")
          .insert({ event_id: event.id, invite_id: invite.id, reminded_for_date: today });
        if (dedupError) { skipped++; continue; } // unique_violation -- already reminded today

        const from = await resolveSender(event.company_id);
        const when = formatEventTime(event.start_at, event.end_at);
        const rsvpUrl = `${APP_URL}/public/events/${invite.slug}`;
        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <h2 style="color:#0f172a;margin:0 0 8px;">Reminder: ${event.title}</h2>
            <p style="color:#64748b;margin:0 0 4px;">${when}</p>
            ${event.location ? `<p style="color:#64748b;margin:0 0 16px;">${event.location}</p>` : ""}
            <a href="${rsvpUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:13px;">View invite</a>
          </div>`;

        const result = await sendResendEmail(from, invite.external_email, `Reminder: ${event.title} is today`, html);
        await db.from("email_log").insert({
          company_id: event.company_id, event_type: "calendar_event_reminder", to_email: invite.external_email,
          subject: `Reminder: ${event.title} is today`, from_address: from,
          resend_message_id: result.id, status: result.error ? "failed" : "sent", error: result.error,
        });
        if (result.error) { failed++; console.error("[calendar-event-reminders] send failed:", result.error); }
        else sent++;
      }
    }

    heartbeatResult = { ok: true, events: events?.length ?? 0, sent, skipped, failed };
    return new Response(JSON.stringify(heartbeatResult), { headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    heartbeatResult = { ok: false, error: err.message };
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  } finally {
    await db.from("cron_heartbeats").upsert(
      { name: "calendar-event-reminders", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: heartbeatResult },
      { onConflict: "name" }
    );
  }
});
