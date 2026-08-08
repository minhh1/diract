// app/api/calendar/events/[eventId]/respond/route.ts
// An INTERNAL invitee accepting/declining, using their own real session --
// the external-invitee equivalent is
// app/api/calendar/event-invites/public/[slug]/respond/route.ts (no
// session, slug-gated). Any company member can call this; the explicit
// .eq("internal_user_id", user.id) below is what actually restricts it to
// their own invite row, same as RLS's calendar_event_invites_respond
// policy enforces independently.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user } = auth;
  const { eventId } = await params;

  const body = await req.json().catch(() => null);
  const response = body?.response;
  if (response !== "accepted" && response !== "declined") {
    return NextResponse.json({ error: "response must be 'accepted' or 'declined'" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("calendar_event_invites")
    .update({ rsvp_status: response, responded_at: new Date().toISOString() })
    .eq("event_id", eventId)
    .eq("internal_user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "You're not invited to this event" }, { status: 404 });

  return NextResponse.json({ success: true });
}
