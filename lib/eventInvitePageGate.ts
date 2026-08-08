// lib/eventInvitePageGate.ts
// Gating for the GENUINELY UNAUTHENTICATED external event-invite RSVP page
// -- no session, access granted purely by the slug resolving to a real
// invite row, using the service-role admin client throughout. Modelled
// directly on lib/clientUpdatePageGate.ts's loadActivePageBySlug(), same
// single-generic-404 shape so a revoked/nonexistent slug can't be told
// apart. No PIN here (unlike Client Update Pages) -- the slug itself
// (crypto.randomUUID(), see lib/calendarEventInvites.ts) is the whole
// secret; an invite link is a one-time, short-lived thing, not an ongoing
// portal.
import { NextResponse } from "next/server";

export async function loadActiveInviteBySlug(admin: any, slug: string) {
  const { data: invite } = await admin
    .from("calendar_event_invites")
    .select("id, event_id, external_name, external_email, rsvp_status, responded_at")
    .eq("slug", slug).eq("invite_type", "external").maybeSingle();

  const notFound = { error: NextResponse.json({ error: "This invite is not available" }, { status: 404 }), invite: null, event: null };
  if (!invite) return notFound;

  const { data: event } = await admin
    .from("calendar_events")
    .select("id, title, description, location, start_at, end_at, status")
    .eq("id", invite.event_id).maybeSingle();
  if (!event) return notFound;

  return { error: null as null, invite, event };
}
