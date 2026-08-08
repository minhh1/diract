// lib/calendarEventInvites.ts
// Shared invite-creation logic between app/api/calendar/events/route.ts
// (POST, initial invitees) and .../events/[eventId]/route.ts (PATCH,
// adding invitees to an existing event) -- one place that inserts
// calendar_event_invites rows AND actually notifies each invitee, so the
// two call sites can't drift into notifying differently.
//
// Internal invitees go through create_notification (the same in-app/email/
// push fan-out every other event in this app uses). External invitees
// aren't real users -- create_notification requires a real recipient_user_id
// -- so they get a direct email via lib/email/sendEmail.ts, to a generated,
// high-entropy slug-gated public RSVP page (crypto.randomUUID() is the
// secret itself here, no separate PIN the way client_update_pages uses one;
// an invite link is lower-stakes/shorter-lived than an ongoing client
// portal).
import { sendEmail } from "@/lib/email/sendEmail";

export interface InviteeInput {
  type: "internal" | "external";
  user_id?: string; // internal
  name?: string; // external
  email?: string; // external
}

export interface EventForInvite {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://diract.io";

function formatEventTime(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit" };
  return `${start.toLocaleString("en-AU", opts)} - ${end.toLocaleString("en-AU", { hour: "numeric", minute: "2-digit" })}`;
}

// Inserts one calendar_event_invites row per invitee and sends the actual
// invite (in-app notification or email) -- skips anyone already invited to
// this event (matched by internal_user_id, or external_email) so re-adding
// the same person twice from the UI is a harmless no-op rather than a
// second email.
export async function createEventInvites(admin: any, event: EventForInvite, invitees: InviteeInput[]): Promise<void> {
  if (!invitees.length) return;

  const { data: existing } = await admin.from("calendar_event_invites").select("internal_user_id, external_email").eq("event_id", event.id);
  const existingUserIds = new Set((existing ?? []).map((r: any) => r.internal_user_id).filter(Boolean));
  const existingEmails = new Set((existing ?? []).map((r: any) => r.external_email?.toLowerCase()).filter(Boolean));

  const rows = invitees
    .filter((inv) => {
      if (inv.type === "internal") return inv.user_id && !existingUserIds.has(inv.user_id);
      return inv.email && !existingEmails.has(inv.email.toLowerCase());
    })
    .map((inv) =>
      inv.type === "internal"
        ? { event_id: event.id, invite_type: "internal", internal_user_id: inv.user_id }
        : { event_id: event.id, invite_type: "external", external_name: inv.name || inv.email, external_email: inv.email, slug: crypto.randomUUID() }
    );
  if (!rows.length) return;

  const { data: created, error } = await admin.from("calendar_event_invites").insert(rows).select("id, invite_type, internal_user_id, external_name, external_email, slug");
  if (error || !created) { console.error("[calendarEventInvites] insert failed:", error); return; }

  const when = formatEventTime(event.start_at, event.end_at);

  await Promise.all(created.map(async (invite: any) => {
    if (invite.invite_type === "internal") {
      await admin.rpc("create_notification", {
        p_company_id: event.company_id,
        p_recipient_user_id: invite.internal_user_id,
        p_event_type: "calendar_event_invite",
        p_title: `You're invited: ${event.title}`,
        p_body: when,
        p_link_url: `/dashboard/calendar?event=${event.id}`,
      });
      return;
    }

    const rsvpUrl = `${APP_URL}/public/events/${invite.slug}`;
    await sendEmail({
      admin, companyId: event.company_id, eventType: "calendar_event_invite",
      to: invite.external_email, subject: `You're invited: ${event.title}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;">
          <h2 style="color:#0f172a;margin:0 0 8px;">${event.title}</h2>
          <p style="color:#64748b;margin:0 0 4px;">${when}</p>
          ${event.location ? `<p style="color:#64748b;margin:0 0 16px;">${event.location}</p>` : ""}
          ${event.description ? `<p style="color:#334155;margin:16px 0;">${event.description}</p>` : ""}
          <a href="${rsvpUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#4f46e5;color:#fff;text-decoration:none;border-radius:999px;font-weight:600;font-size:13px;">View invite &amp; RSVP</a>
        </div>`,
    });
  }));
}
