// app/api/calendar/google-sync/route.ts
// Per-USER (not company-wide) opt-in for two-way Google Calendar sync --
// GET reports whether the caller has a Gmail connection at all (calendar
// sync piggybacks on that same OAuth token, see user_gmail_tokens) and
// whether they've turned two-way sync on; POST toggles it on their own
// row only. Off by default even once connected -- this is a deliberate
// second opt-in step, not implied by just having Gmail connected.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user } = auth;

  const { data } = await admin.from("user_gmail_tokens").select("calendar_sync_enabled").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ connected: !!data, enabled: !!data?.calendar_sync_enabled });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user } = auth;

  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") return NextResponse.json({ error: "enabled (boolean) is required" }, { status: 400 });

  const { data: existing } = await admin.from("user_gmail_tokens").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Connect Gmail first" }, { status: 400 });

  const { error } = await admin.from("user_gmail_tokens").update({ calendar_sync_enabled: body.enabled }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ enabled: body.enabled });
}
