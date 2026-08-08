// app/api/calendar/settings/route.ts
// Admin-only read/write for calendar_settings -- the three toggles
// (calendar itself, staff rostering, event booking) gating
// /dashboard/calendar and the roster/event routes. Mirrors
// app/api/time-tracking/settings/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("calendar_settings")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data ?? { company_id: companyId, enabled: false, rostering_enabled: false, booking_enabled: false } });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean" || typeof body?.rostering_enabled !== "boolean" || typeof body?.booking_enabled !== "boolean") {
    return NextResponse.json({ error: "enabled, rostering_enabled, and booking_enabled (booleans) are required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("calendar_settings")
    .upsert(
      { company_id: companyId, enabled: body.enabled, rostering_enabled: body.rostering_enabled, booking_enabled: body.booking_enabled, updated_at: new Date().toISOString() },
      { onConflict: "company_id" }
    )
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ settings: data });
}
