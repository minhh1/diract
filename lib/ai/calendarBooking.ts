// lib/ai/calendarBooking.ts
// Books an appointment on the firm's shared calendar -- the same stand-in
// already used for company-wide task-due-date sync (supabase/functions/
// calendar-sync/index.ts): the company's nominated source-of-truth Gmail
// account's (companies.gmail_source_emails[0]) primary Google Calendar,
// via that account's stored user_gmail_tokens. No free/busy check --
// matches how task calendar sync already works (create the event, don't
// gatekeep on availability).
//
// Event start/end are sent as *naive* local datetime strings (no UTC
// offset) paired with the company's own configured timeZone (see
// lib/companyTimezone.ts) -- confirmed against Google's Calendar API docs
// (2026-07-27): a dateTime with no offset is interpreted as wall-clock time
// IN the given timeZone. Deliberately not using `new Date(...).toISOString()`
// for the instant itself (that always produces a UTC-suffixed string, which
// would make Google ignore timeZone entirely and shift the event by the
// company's UTC offset) -- only used below for safe, timezone-agnostic
// *calendar-date* arithmetic (rolling to the next day when adding the fixed
// 1-hour duration crosses midnight).
import { getCompanyTimezone } from "@/lib/companyTimezone";

const APPOINTMENT_DURATION_MINS = 60;


export interface AppointmentParams {
  name: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM, 24-hour
  address: string | null;
  notes: string | null;
}

export interface BookedAppointment {
  eventId: string;
  htmlLink: string | null;
}

function addDuration(date: string, startTime: string, durationMins: number): { date: string; time: string } {
  const [h, m] = startTime.split(":").map(Number);
  const totalMinutes = h * 60 + m + durationMins;
  const endTime = `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  const daysToAdd = Math.floor(totalMinutes / (24 * 60));
  if (daysToAdd === 0) return { date, time: endTime };

  const rolled = new Date(`${date}T00:00:00Z`);
  rolled.setUTCDate(rolled.getUTCDate() + daysToAdd);
  return { date: rolled.toISOString().slice(0, 10), time: endTime };
}

async function getCompanyCalendarToken(admin: any, companyId: string): Promise<{ token: string; userId: string } | null> {
  const { data: company } = await admin.from("companies").select("gmail_source_emails").eq("id", companyId).maybeSingle();
  const sourceEmail = (company?.gmail_source_emails ?? [])[0];
  if (!sourceEmail) return null;

  const { data: tokenRow } = await admin
    .from("user_gmail_tokens")
    .select("user_id, access_token, refresh_token, token_expires_at")
    .eq("email", sourceEmail)
    .maybeSingle();
  if (!tokenRow) return null;

  if (new Date(tokenRow.token_expires_at).getTime() < Date.now() + 60_000) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: tokenRow.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const refreshed = await res.json();
    if (!refreshed.access_token) return null;
    await admin
      .from("user_gmail_tokens")
      .update({ access_token: refreshed.access_token, token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString() })
      .eq("user_id", tokenRow.user_id);
    return { token: refreshed.access_token, userId: tokenRow.user_id };
  }
  return { token: tokenRow.access_token, userId: tokenRow.user_id };
}

export async function bookAppointment(admin: any, companyId: string, params: AppointmentParams): Promise<BookedAppointment> {
  const [auth, timezone] = await Promise.all([getCompanyCalendarToken(admin, companyId), getCompanyTimezone(admin, companyId)]);
  if (!auth) {
    throw new Error("This company hasn't connected a Gmail account for calendar sync yet -- ask an admin to connect one in Admin -> Gmail.");
  }

  const end = addDuration(params.date, params.startTime, APPOINTMENT_DURATION_MINS);

  const event = {
    summary: params.name,
    description: params.notes ?? undefined,
    location: params.address ?? undefined,
    start: { dateTime: `${params.date}T${params.startTime}:00`, timeZone: timezone },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: timezone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 },
        { method: "popup", minutes: 30 },
      ],
    },
  };

  const res = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`Failed to create calendar event: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { eventId: data.id, htmlLink: data.htmlLink ?? null };
}
