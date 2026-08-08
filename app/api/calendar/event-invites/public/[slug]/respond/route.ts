// app/api/calendar/event-invites/public/[slug]/respond/route.ts
// GENUINELY UNAUTHENTICATED -- an external invitee accepting/declining. Same
// gate as the parent GET route; re-resolves the slug on this call too
// (never trusts a client-supplied invite id) so one link can only ever
// touch its own row.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActiveInviteBySlug } from "@/lib/eventInvitePageGate";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const response = body?.response;
  if (response !== "accepted" && response !== "declined") {
    return NextResponse.json({ error: "response must be 'accepted' or 'declined'" }, { status: 400 });
  }

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const gate = await loadActiveInviteBySlug(admin, slug);
  if (gate.error) return gate.error;
  const { invite } = gate;

  const { error } = await admin
    .from("calendar_event_invites")
    .update({ rsvp_status: response, responded_at: new Date().toISOString() })
    .eq("id", invite.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
