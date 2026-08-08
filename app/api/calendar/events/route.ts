// app/api/calendar/events/route.ts
// List/create bookable calendar events. Uses the admin (service-role)
// client throughout like every other route in this app -- visibility for
// GET is replicated explicitly here rather than relied on from RLS (RLS on
// calendar_events/calendar_event_invites is still real, defense-in-depth
// for any other access path, see the migration's own comments).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createEventInvites, type InviteeInput } from "@/lib/calendarEventInvites";
import { triggerCalendarEventSync } from "@/lib/triggerCalendarEventSync";

function canManage(isAdmin: boolean, hasPermission: (slug: string) => boolean): boolean {
  return isAdmin || hasPermission("calendar.book_events");
}

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin, hasPermission } = auth;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end (ISO dates) are required" }, { status: 400 });

  let query = admin.from("calendar_events").select("*").eq("company_id", companyId)
    .lt("start_at", `${end}T23:59:59`).gt("end_at", `${start}T00:00:00`);

  if (!canManage(isAdmin, hasPermission)) {
    const { data: myInvites } = await admin.from("calendar_event_invites").select("event_id").eq("internal_user_id", user.id);
    const invitedEventIds = (myInvites ?? []).map((r: any) => r.event_id);
    query = invitedEventIds.length
      ? query.or(`created_by.eq.${user.id},id.in.(${invitedEventIds.join(",")})`)
      : query.eq("created_by", user.id);
  }

  const { data: events, error } = await query.order("start_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const eventIds = (events ?? []).map((e: any) => e.id);
  const { data: invites } = eventIds.length
    ? await admin.from("calendar_event_invites").select("*").in("event_id", eventIds)
    : { data: [] };

  // Staff with a real linked login -- the only ones eligible as "internal"
  // invitees (calendar_event_invites.internal_user_id needs a real profile
  // id). Returned alongside events so the booking UI's invitee picker
  // doesn't need its own round trip, same reasoning as the roster shifts
  // route already bundling its own staff list.
  const { data: staff } = await admin.from("entities").select("id, name, linked_profile_id")
    .eq("company_id", companyId).eq("entity_type", "Staff").is("deleted_at", null).not("linked_profile_id", "is", null).order("name");

  return NextResponse.json({ events: events ?? [], invites: invites ?? [], staff: staff ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin, hasPermission } = auth;
  if (!canManage(isAdmin, hasPermission)) return NextResponse.json({ error: "You don't have permission to book events" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { title, description, location, start_at, end_at, all_day } = body ?? {};
  if (!title || !String(title).trim() || !start_at || !end_at) {
    return NextResponse.json({ error: "title, start_at, and end_at are required" }, { status: 400 });
  }
  if (new Date(end_at) <= new Date(start_at)) return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });

  const invitees: InviteeInput[] = Array.isArray(body?.invitees) ? body.invitees : [];

  const { data: created, error } = await admin.from("calendar_events").insert({
    company_id: companyId, created_by: user.id, title: String(title).trim(),
    description: description ? String(description) : null, location: location ? String(location) : null,
    start_at, end_at, all_day: !!all_day,
  }).select("*").single();
  if (error || !created) return NextResponse.json({ error: error?.message || "Could not create event" }, { status: 500 });

  await createEventInvites(admin, created, invitees);
  triggerCalendarEventSync(created.id, "upsert");

  return NextResponse.json({ event: created });
}
