// app/api/kiosk/checkins/route.ts
// The kiosk device's own check-in/check-out surface -- GET returns today's
// rostered staff merged with today's check-in state; POST checks a staff
// entity in (creates a staff_checkins row) or out (sets checked_out_at on
// the row THIS SAME kiosk identity created earlier today -- deliberately
// NOT any check-in another kiosk device made: a staff member can only be
// checked in at one physical location at a time, so only the device that
// checked them in should be able to check them back out). Uses the
// service-role admin client and does its own companyId scoping (the
// established pattern for every API route here, e.g. app/api/calendar/
// roster/shifts/route.ts) -- RLS is the second, independent layer
// (staff_checkins_kiosk_* policies in 20260808200300_kiosk_additive_
// policies.sql), not the only one.
//
// "This kiosk identity" isn't always the caller's own auth.uid(): an admin
// previewing kiosk mode from their own session (Sidebar's "Enter kiosk
// mode", see lib/hooks/useKioskView.ts) can act AS one of the company's
// kiosk_accounts (kioskAccountId, resolved to that account's own user_id
// below) so a company with several physical kiosks still gets a distinct,
// consistent identity per device even though the admin never actually logs
// into each one -- see resolveActingUserId().
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { companyTodayStr, companyDayRangeUtc } from "@/lib/companyLocalDate";
import { verifyPin } from "@/lib/staffCheckinPin";
import type { SupabaseClient } from "@supabase/supabase-js";

// Only an admin may act as a kiosk OTHER than themselves, and only for a
// kiosk_accounts row that actually belongs to their own company -- this is
// the one place that authorizes "attribute this check-in/out to a
// different identity than whoever's actually signed in".
async function resolveActingUserId(
  admin: SupabaseClient,
  companyId: string,
  isAdmin: boolean,
  fallbackUserId: string,
  kioskAccountId: unknown
): Promise<{ actingUserId: string } | { error: NextResponse }> {
  if (typeof kioskAccountId !== "string" || !kioskAccountId) return { actingUserId: fallbackUserId };
  if (!isAdmin) return { error: NextResponse.json({ error: "Only an admin can act as a specific kiosk" }, { status: 403 }) };

  const { data: kioskAccount } = await admin.from("kiosk_accounts")
    .select("user_id").eq("id", kioskAccountId).eq("company_id", companyId).maybeSingle();
  if (!kioskAccount) return { error: NextResponse.json({ error: "Kiosk not found" }, { status: 404 }) };

  return { actingUserId: kioskAccount.user_id };
}

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, user } = auth;

  const { data: company } = await admin.from("companies").select("company_type").eq("id", companyId).maybeSingle();
  const today = companyTodayStr(company?.company_type ?? null);
  const { startUtc, endUtc } = companyDayRangeUtc(today, company?.company_type ?? null);

  const [{ data: shifts }, { data: staff }, { data: checkins }] = await Promise.all([
    admin.from("roster_shifts").select("id, staff_entity_id, start_time, end_time, role_note")
      .eq("company_id", companyId).eq("shift_date", today).eq("status", "final").order("start_time"),
    // checkin_pin_hash itself never leaves the server -- only whether one is
    // set, so CheckInPanel.tsx knows whether to show a PIN pad before
    // toggling this person (see the migration's own comment: staff who've
    // never logged in have no PIN and keep the old plain-tap behaviour).
    admin.from("entities").select("id, name, checkin_pin_hash").eq("company_id", companyId).eq("entity_type", "Staff").is("deleted_at", null).order("name"),
    admin.from("staff_checkins").select("id, roster_shift_id, staff_entity_id, checked_in_at, checked_out_at")
      .eq("company_id", companyId).gte("checked_in_at", startUtc).lt("checked_in_at", endUtc),
  ]);

  const staffWithPinFlag = (staff ?? []).map(s => ({ id: s.id, name: s.name, hasPin: !!s.checkin_pin_hash }));

  return NextResponse.json({ today, shifts: shifts ?? [], staff: staffWithPinFlag, checkins: checkins ?? [], kioskUserId: user.id });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;

  const body = await req.json().catch(() => ({}));
  const action = body.action === "check_out" ? "check_out" : "check_in";
  const staffEntityId = typeof body.staff_entity_id === "string" ? body.staff_entity_id : null;
  const rosterShiftId = typeof body.roster_shift_id === "string" ? body.roster_shift_id : null;
  const pin = typeof body.pin === "string" ? body.pin.trim() : "";
  if (!staffEntityId) return NextResponse.json({ error: "staff_entity_id is required" }, { status: 400 });

  const resolved = await resolveActingUserId(admin, companyId, isAdmin, user.id, body.kioskAccountId);
  if ("error" in resolved) return resolved.error;
  const { actingUserId } = resolved;

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
      .insert({ company_id: companyId, roster_shift_id: rosterShiftId, staff_entity_id: staffEntityId, checked_in_by: actingUserId })
      .select("id, roster_shift_id, staff_entity_id, checked_in_at, checked_out_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ checkin: created });
  }

  // Check out: the most recent open (not yet checked out) check-in THIS
  // kiosk identity made for this staff member today -- not any check-in
  // another kiosk device made (a staff member can only be in one place at
  // a time, see this file's top comment).
  const { data: company } = await admin.from("companies").select("company_type").eq("id", companyId).maybeSingle();
  const today = companyTodayStr(company?.company_type ?? null);
  const { startUtc } = companyDayRangeUtc(today, company?.company_type ?? null);
  const { data: openCheckin } = await admin.from("staff_checkins").select("id")
    .eq("company_id", companyId).eq("staff_entity_id", staffEntityId).eq("checked_in_by", actingUserId)
    .is("checked_out_at", null).gte("checked_in_at", startUtc)
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
