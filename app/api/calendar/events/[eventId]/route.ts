// app/api/calendar/events/[eventId]/route.ts
// GET one event + its invites; PATCH edits it (title/time/etc, cancelling
// via status, and/or adding new invitees) -- organizer, admin, or a
// calendar.book_events holder only. No DELETE -- cancelling (status
// change, keeps history and still notifies invitees) is the real action,
// not row deletion.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { createEventInvites, type InviteeInput } from "@/lib/calendarEventInvites";
import { triggerCalendarEventSync } from "@/lib/triggerCalendarEventSync";

export async function GET(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin, hasPermission } = auth;
  const { eventId } = await params;

  const { data: event } = await admin.from("calendar_events").select("*").eq("id", eventId).eq("company_id", companyId).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: invites } = await admin.from("calendar_event_invites").select("*").eq("event_id", eventId);

  const canManage = isAdmin || hasPermission("calendar.book_events") || event.created_by === user.id;
  const isInvitee = (invites ?? []).some((i: any) => i.internal_user_id === user.id);
  if (!canManage && !isInvitee) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  return NextResponse.json({ event, invites: invites ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin, hasPermission } = auth;
  const { eventId } = await params;

  const { data: event } = await admin.from("calendar_events").select("*").eq("id", eventId).eq("company_id", companyId).maybeSingle();
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const canManage = isAdmin || hasPermission("calendar.book_events") || event.created_by === user.id;
  if (!canManage) return NextResponse.json({ error: "You don't have permission to edit this event" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  if (typeof body?.title === "string" && body.title.trim()) updates.title = body.title.trim();
  if (typeof body?.description === "string" || body?.description === null) updates.description = body.description || null;
  if (typeof body?.location === "string" || body?.location === null) updates.location = body.location || null;
  if (body?.start_at) updates.start_at = body.start_at;
  if (body?.end_at) updates.end_at = body.end_at;
  if (typeof body?.all_day === "boolean") updates.all_day = body.all_day;
  if (body?.status === "confirmed" || body?.status === "cancelled") updates.status = body.status;

  let updated = event;
  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString();
    const { data, error } = await admin.from("calendar_events").update(updates).eq("id", eventId).select("*").single();
    if (error || !data) return NextResponse.json({ error: error?.message || "Could not update event" }, { status: 500 });
    updated = data;
    triggerCalendarEventSync(updated.id, updates.status === "cancelled" ? "cancel" : "upsert");
  }

  const addInvitees: InviteeInput[] = Array.isArray(body?.add_invitees) ? body.add_invitees : [];
  if (addInvitees.length) await createEventInvites(admin, updated, addInvitees);

  return NextResponse.json({ event: updated });
}
