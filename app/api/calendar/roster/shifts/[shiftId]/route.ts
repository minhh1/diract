// app/api/calendar/roster/shifts/[shiftId]/route.ts
// Edit/delete one roster shift -- admin-only. Editing does not reset an
// already-final shift back to draft (a small time correction on a
// published shift shouldn't hide it from staff again); only .../publish
// and .../copy-week ever change status themselves.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { shiftId } = await params;

  const body = await req.json().catch(() => null);
  const updates: Record<string, unknown> = {};
  if (body?.staff_entity_id) updates.staff_entity_id = body.staff_entity_id;
  if (body?.shift_date) updates.shift_date = body.shift_date;
  if (body?.start_time) updates.start_time = body.start_time;
  if (body?.end_time) updates.end_time = body.end_time;
  if (typeof body?.role_note === "string" || body?.role_note === null) updates.role_note = body.role_note || null;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await admin
    .from("roster_shifts")
    .update(updates)
    .eq("id", shiftId)
    .eq("company_id", companyId)
    .select("*")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Shift not found" }, { status: 404 });

  return NextResponse.json({ shift: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  const { shiftId } = await params;

  const { error } = await admin.from("roster_shifts").delete().eq("id", shiftId).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
