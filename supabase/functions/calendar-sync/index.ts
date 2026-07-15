// supabase/functions/calendar-sync/index.ts
// Creates / updates / deletes Google Calendar events for tasks
// Called with: { action: 'upsert' | 'delete' | 'complete', taskId }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);
const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID")!;
const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

// ── Token ──────────────────────────────────────────────────────────

async function getAccessToken(userId: string): Promise<string | null> {
  const { data } = await db.from("user_gmail_tokens")
    .select("access_token, refresh_token, token_expires_at, email")
    .eq("user_id", userId).single();
  if (!data) return null;
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

async function getTokenByEmail(email: string): Promise<{ token: string; userId: string } | null> {
  const { data } = await db.from("user_gmail_tokens")
    .select("user_id, access_token, refresh_token, token_expires_at")
    .eq("email", email).maybeSingle();
  if (!data) return null;
  const token = await getAccessToken(data.user_id);
  return token ? { token, userId: data.user_id } : null;
}

// ── Calendar API ───────────────────────────────────────────────────

async function createCalendarEvent(
  token: string,
  calendarId: string,
  event: any
): Promise<string | null> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event) }
  );
  if (!res.ok) {
    console.error("[calendar] create error:", await res.text());
    return null;
  }
  const data = await res.json();
  return data.id || null;
}

async function updateCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string,
  event: any
): Promise<boolean> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event) }
  );
  if (!res.ok) {
    const err = await res.text();
    // Event might not exist on this calendar — try create instead
    if (res.status === 404) return false;
    console.error("[calendar] update error:", err);
    return false;
  }
  return true;
}

async function deleteCalendarEvent(
  token: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );
}

// ── Build event object ─────────────────────────────────────────────

function buildEventTitle(format: string, taskName: string, matterNumber: string, projectName: string): string {
  return format
    .replace("{task_name}", taskName)
    .replace("{matter_number}", matterNumber || "")
    .replace("{project_name}", projectName || "")
    .trim().replace(/^[\s—\-]+|[\s—\-]+$/g, ""); // strip leading/trailing separators
}

function buildEvent(params: {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string | null;
  durationMins: number;
  attendees: string[];
  isCompleted: boolean;
  existingEventId?: string;
}): any {
  const { title, description, dueDate, dueTime, durationMins, attendees, isCompleted } = params;

  let start: any, end: any;
  const datePart = dueDate.substring(0, 10); // dueDate may be a full timestamp — keep just YYYY-MM-DD

  if (dueTime) {
    // Timed event — dueTime is HH:MM:SS, already includes seconds
    const startDt = new Date(`${datePart}T${dueTime}`);
    const endDt = new Date(startDt.getTime() + durationMins * 60 * 1000);
    start = { dateTime: startDt.toISOString(), timeZone: "Australia/Sydney" };
    end = { dateTime: endDt.toISOString(), timeZone: "Australia/Sydney" };
  } else {
    // All-day event
    start = { date: datePart };
    end = { date: datePart };
  }

  return {
    summary: title,
    description,
    start, end,
    status: isCompleted ? "cancelled" : "confirmed",
    attendees: attendees.map(email => ({ email })),
    reminders: {
      useDefault: false,
      overrides: isCompleted ? [] : [
        { method: "email", minutes: 24 * 60 }, // 1 day before
        { method: "popup", minutes: 30 },
      ],
    },
  };
}

// ── Main handler ───────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = { "Content-Type": "application/json" };

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, taskId } = await req.json();
    if (!taskId) return new Response(JSON.stringify({ error: "Missing taskId" }), { status: 400, headers: corsHeaders });

    console.log(`[calendar] action=${action} taskId=${taskId}`);

    // Fetch task with all related data
    const { data: task, error: taskErr } = await db.from("tasks")
      .select(`
        id, name, due_date, due_time, is_completed, calendar_event_id,
        company_id, project_id,
        assignee:assignee_id(id, email, full_name),
        project:project_id(id, name)
      `)
      .eq("id", taskId).single();

    if (taskErr || !task) {
      console.error("[calendar] task not found:", taskErr?.message);
      return new Response(JSON.stringify({ error: "Task not found" }), { status: 404, headers: corsHeaders });
    }

    const companyId = task.company_id;

    // Fetch company settings
    const { data: company } = await db.from("companies")
      .select("gmail_source_emails, calendar_event_title_format, calendar_event_duration_mins")
      .eq("id", companyId).single();

    if (!company?.gmail_source_emails?.length) {
      console.log("[calendar] no source email configured");
      return new Response(JSON.stringify({ ok: true, skipped: "no source email" }), { headers: corsHeaders });
    }

    const companyEmail = company.gmail_source_emails[0];
    const titleFormat = company.calendar_event_title_format || "{matter_number} — {task_name}";
    const durationMins = company.calendar_event_duration_mins || 30;

    // Get company calendar token (source email's OAuth)
    const companyAuth = await getTokenByEmail(companyEmail);
    if (!companyAuth) {
      console.error("[calendar] no token for company email:", companyEmail);
      return new Response(JSON.stringify({ error: "No token for company email" }), { status: 400, headers: corsHeaders });
    }

    // Get matter number for this project
    let matterNumber = "";
    if (task.project_id) {
      const { data: matterField } = await db.from("company_custom_fields")
        .select("id").eq("company_id", companyId).eq("field_key", "matter_number").maybeSingle();
      if (matterField) {
        const { data: cfv } = await db.from("company_custom_field_values")
          .select("value_text").eq("field_id", matterField.id).eq("record_id", task.project_id).maybeSingle();
        matterNumber = cfv?.value_text || "";
      }
    }

    const projectName = (task.project as any)?.name || "";
    const title = buildEventTitle(titleFormat, task.name, matterNumber, projectName);
    const assigneeEmail = (task.assignee as any)?.email || null;

    const description = [
      projectName ? `Project: ${projectName}` : null,
      matterNumber ? `Matter: ${matterNumber}` : null,
      (task.assignee as any)?.full_name ? `Assigned to: ${(task.assignee as any).full_name}` : null,
    ].filter(Boolean).join("\n");

    // ── Handle delete / complete ───────────────────────────────────
    if ((action === "delete" || action === "complete") && task.calendar_event_id) {
      console.log(`[calendar] ${action} event ${task.calendar_event_id}`);

      if (action === "delete") {
        // Hard delete from both calendars
        await deleteCalendarEvent(companyAuth.token, "primary", task.calendar_event_id);
        if (assigneeEmail) {
          const assigneeAuth = await getTokenByEmail(assigneeEmail);
          if (assigneeAuth) await deleteCalendarEvent(assigneeAuth.token, "primary", task.calendar_event_id);
        }
        await db.from("tasks").update({ calendar_event_id: null, calendar_synced_at: null }).eq("id", taskId);
      } else {
        // Mark as cancelled (keeps in history)
        const event = buildEvent({ title, description, dueDate: task.due_date, dueTime: task.due_time,
          durationMins, attendees: assigneeEmail ? [companyEmail, assigneeEmail] : [companyEmail], isCompleted: true });
        await updateCalendarEvent(companyAuth.token, "primary", task.calendar_event_id, event);
        await db.from("tasks").update({ calendar_synced_at: new Date().toISOString() }).eq("id", taskId);
      }

      return new Response(JSON.stringify({ ok: true, action }), { headers: corsHeaders });
    }

    // ── Handle upsert ──────────────────────────────────────────────
    if (!task.due_date) {
      console.log("[calendar] no due date — skipping");
      return new Response(JSON.stringify({ ok: true, skipped: "no due date" }), { headers: corsHeaders });
    }

    const attendees = [companyEmail, assigneeEmail].filter(Boolean) as string[];
    const event = buildEvent({ title, description, dueDate: task.due_date, dueTime: task.due_time,
      durationMins, attendees, isCompleted: false });

    let eventId = task.calendar_event_id;

    if (eventId) {
      // Try to update existing event
      const updated = await updateCalendarEvent(companyAuth.token, "primary", eventId, event);
      if (!updated) {
        // Event gone — create new
        console.log("[calendar] event not found, creating new");
        eventId = null;
      } else {
        console.log(`[calendar] updated event ${eventId}`);
      }
    }

    if (!eventId) {
      // Create new event
      eventId = await createCalendarEvent(companyAuth.token, "primary", event);
      console.log(`[calendar] created event ${eventId}`);
    }

    if (!eventId) {
      return new Response(JSON.stringify({ error: "Failed to create event" }), { status: 500, headers: corsHeaders });
    }

    // Also add to assignee's calendar if different from company email
    if (assigneeEmail && assigneeEmail !== companyEmail) {
      const assigneeAuth = await getTokenByEmail(assigneeEmail);
      if (assigneeAuth) {
        // Check if assignee already has this event (as attendee)
        // Try to update their copy if they have a token
        const assigneeEvent = { ...event, attendees: [{ email: assigneeEmail }] };
        if (task.calendar_event_id) {
          const updated = await updateCalendarEvent(assigneeAuth.token, "primary", task.calendar_event_id, assigneeEvent);
          if (!updated) await createCalendarEvent(assigneeAuth.token, "primary", assigneeEvent);
        } else {
          await createCalendarEvent(assigneeAuth.token, "primary", assigneeEvent);
        }
        console.log(`[calendar] synced to assignee ${assigneeEmail}`);
      }
    }

    // Save event ID back to task
    await db.from("tasks").update({
      calendar_event_id: eventId,
      calendar_synced_at: new Date().toISOString(),
    }).eq("id", taskId);

    return new Response(JSON.stringify({ ok: true, eventId }), { headers: corsHeaders });

  } catch (err: any) {
    console.error("[calendar] error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
});