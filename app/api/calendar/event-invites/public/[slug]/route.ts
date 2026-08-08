// app/api/calendar/event-invites/public/[slug]/route.ts
// GENUINELY UNAUTHENTICATED -- see lib/eventInvitePageGate.ts. Read-only;
// the actual RSVP write is .../respond/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loadActiveInviteBySlug } from "@/lib/eventInvitePageGate";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const gate = await loadActiveInviteBySlug(admin, slug);
  if (gate.error) return gate.error;
  const { invite, event } = gate;

  return NextResponse.json({
    event: { title: event.title, description: event.description, location: event.location, start_at: event.start_at, end_at: event.end_at, status: event.status },
    invite: { name: invite.external_name, rsvp_status: invite.rsvp_status, responded_at: invite.responded_at },
  });
}
