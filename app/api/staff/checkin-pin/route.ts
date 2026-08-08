// app/api/staff/checkin-pin/route.ts
// Self-service set/check of the caller's own kiosk check-in PIN (see
// entities.checkin_pin_hash, supabase/migrations/20260808230000_staff_
// checkin_pin.sql). Always targets the CALLER's own linked Staff entity in
// their active company -- there's no admin-set-for-someone-else path here,
// same reasoning Two-factor auth on the Profile page is self-service only.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { findOwnStaffEntity } from "@/lib/services/staffEntityService";
import { hashPin, isValidPin } from "@/lib/staffCheckinPin";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const entity = await findOwnStaffEntity(admin, companyId, user.id);
  if (!entity) return NextResponse.json({ hasStaffEntity: false, hasPin: false });

  return NextResponse.json({ hasStaffEntity: true, hasPin: !!entity.checkin_pin_hash });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => null);
  const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
  if (!isValidPin(pin)) return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });

  const entity = await findOwnStaffEntity(admin, companyId, user.id);
  if (!entity) return NextResponse.json({ error: "No staff profile found for your account" }, { status: 404 });

  const { error } = await admin
    .from("entities")
    .update({ checkin_pin_hash: hashPin(pin) })
    .eq("id", entity.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
