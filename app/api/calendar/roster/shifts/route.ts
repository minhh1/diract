// app/api/calendar/roster/shifts/route.ts
// List/create roster shifts. GET returns shifts in a date range plus the
// company's Staff entities (entity_type='Staff', same scope
// RelationPicker.tsx's $team_scope sentinel already uses for Time & Fee
// Entries' Staff field -- see lib/services/staffEntityService.ts) so the
// client can render the staff x day grid without a second round trip.
// Non-admins only ever see 'final' shifts -- draft/unconfirmed shifts
// aren't "their schedule" yet (also enforced in RLS, this is defense in
// depth since the admin client bypasses RLS). New shifts always start as
// 'draft' regardless of what the caller sends -- publishing is its own
// explicit action (see .../publish/route.ts), never implicit on create.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });

  let query = admin.from("roster_shifts").select("*").eq("company_id", companyId).gte("shift_date", start).lte("shift_date", end);
  if (!isAdmin) query = query.eq("status", "final");
  const { data: shifts, error } = await query.order("shift_date").order("start_time");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: staff } = await admin
    .from("entities")
    .select("id, name")
    .eq("company_id", companyId)
    .eq("entity_type", "Staff")
    .is("deleted_at", null)
    .order("name");

  return NextResponse.json({ shifts: shifts ?? [], staff: staff ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { staff_entity_id, shift_date, start_time, end_time, role_note } = body ?? {};
  if (!staff_entity_id || !shift_date || !start_time || !end_time) {
    return NextResponse.json({ error: "staff_entity_id, shift_date, start_time, and end_time are required" }, { status: 400 });
  }

  const { data: staffEntity } = await admin.from("entities").select("id").eq("id", staff_entity_id).eq("company_id", companyId).eq("entity_type", "Staff").is("deleted_at", null).maybeSingle();
  if (!staffEntity) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  const { data: created, error } = await admin
    .from("roster_shifts")
    .insert({
      company_id: companyId, staff_entity_id, shift_date, start_time, end_time,
      role_note: role_note ? String(role_note) : null, status: "draft", created_by: user.id,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ shift: created });
}
