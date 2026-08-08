// app/api/kiosk/checkins/route.ts
// The kiosk device's own check-in/check-out surface -- GET returns today's
// rostered staff merged with today's check-in state; POST checks a staff
// entity in (creates a staff_checkins row) or out (sets checked_out_at on
// the row this same kiosk created earlier today). Uses the service-role
// admin client and does its own companyId scoping (the established pattern
// for every API route here, e.g. app/api/calendar/roster/shifts/route.ts) --
// RLS is the second, independent layer (staff_checkins_kiosk_* policies in
// 20260808200300_kiosk_additive_policies.sql), not the only one.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { companyTodayStr } from "@/lib/companyLocalDate";
import { verifyPin } from "@/lib/staffCheckinPin";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, user } = auth;

  const { data: company } = await admin.from("companies").select("company_type").eq("id", companyId).maybeSingle();
  const today = companyTodayStr(company?.company_type ?? null);

  const [{ data: shifts }, { data: staff }, { data: checkins }] = await Promise.all([
    admin.from("roster_shifts").select("id, staff_entity_id, start_time, end_time, role_note")
      .eq("company_id", companyId).eq("shift_date", today).eq("status", "final").order("start_time"),
    // checkin_pin_hash itself never leaves the server -- only whether one is
    // set, so CheckInPanel.tsx knows whether to show a PIN pad before
    // toggling this person (see the migration's own comment: staff who've
    // never logged in have no PIN and keep the old plain-tap behaviour).
    admin.from("entities").select("id, name, checkin_pin_hash").eq("company_id", companyId).eq("entity_type", "Staff").is("deleted_at", null).order("name"),
    admin.from("staff_checkins").select("id, roster_shift_id, staff_entity_id, checked_in_at, checked_out_at")
      .eq("company_id", companyId).gte("checked_in_at", `${today}T00:00:00`).lte("checked_in_at", `${today}T23:59:59.999`),
  ]);

  const staffWithPinFlag = (staff ?? []).map(s => ({ id: s.id, name: s.name, hasPin: !!s.checkin_pin_hash }));

  return NextResponse.json({ today, shifts: shifts ?? [], staff: staffWithPinFlag, checkins: checkins ?? [], kioskUserId: user.id });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => ({}));
  const action = body.action === "check_out" ? "check_out" : "check_in";
  const staffEntityId = typeof body.staff_entity_id === "string" ? body.staff_entity_id : null;
  const rosterShiftId = typeof body.roster_shift_id === "string" ? body.roster_shift_id : null;
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!staffEntityId) return NextResponse.json({ error: "staff_entity_id is required" }, { status: 400 });

  const { data: staffEntity } = await admin.from("entities").select("id, checkin_pin_hash")
    .eq("id", staffEntityId).eq("company_id", companyId).eq("entity_type", "Staff").is("deleted_at", null).maybeSingle();
  if (!staffEntity) return NextResponse.json({ error: "Staff member not found" }, { status: 404 });

  // A staff member who's set a PIN (see entities.checkin_pin_hash) must
  // enter it to check in/out -- someone with no PIN (never logged in, the
  // "zero login" design this whole feature is built around) keeps today's
  // plain tap-to-toggle behaviour, unchanged.
  if (staffEntity.checkin_pin_hash) {
    if (!pin) return NextResponse.json({ error: "PIN required", pinRequired: true }, { status: 400 });
    if (!verifyPin(pin, staffEntity.checkin_pin_hash)) {
      return NextResponse.json({ error: "Incorrect PIN", pinRequired: true }, { status: 403 });
    }
  }

  if (action === "check_in") {
    const { data: created, error } = await admin.from("staff_checkins")
      .insert({ company_id: companyId, roster_shift_id: rosterShiftId, staff_entity_id: staffEntityId, checked_in_by: user.id })
      .select("id, roster_shift_id, staff_entity_id, checked_in_at, checked_out_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ checkin: created });
  }

  // Check out: the most recent open (not yet checked out) check-in this
  // kiosk itself made for this staff member today, not any check-in from
  // another device -- matches the RLS policy's own `checked_in_by =
  // auth.uid()` scoping.
  const { data: company } = await admin.from("companies").select("company_type").eq("id", companyId).maybeSingle();
  const today = companyTodayStr(company?.company_type ?? null);
  const { data: openCheckin } = await admin.from("staff_checkins").select("id")
    .eq("company_id", companyId).eq("staff_entity_id", staffEntityId).eq("checked_in_by", user.id)
    .is("checked_out_at", null).gte("checked_in_at", `${today}T00:00:00`)
    .order("checked_in_at", { ascending: false }).limit(1).maybeSingle();
  if (!openCheckin) return NextResponse.json({ error: "No open check-in found for today" }, { status: 404 });

  const { data: updated, error } = await admin.from("staff_checkins")
    .update({ checked_out_at: new Date().toISOString() })
    .eq("id", openCheckin.id)
    .select("id, roster_shift_id, staff_entity_id, checked_in_at, checked_out_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checkin: updated });
}
