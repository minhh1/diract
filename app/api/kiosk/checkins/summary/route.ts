// app/api/kiosk/checkins/summary/route.ts
// Per-staff total hours worked over a date range, computed from
// staff_checkins (../route.ts handles the actual check-in/check-out
// action -- this is read-only, for the kiosk's Weekly/Monthly views so
// whoever's looking at the wall iPad can see hours worked at a glance,
// not just today's check-in state). Still-open check-ins (checked_out_at
// null) count elapsed time up to now, same as a live timesheet would.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const { searchParams } = new URL(req.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  if (!start || !end) return NextResponse.json({ error: "start and end (YYYY-MM-DD) are required" }, { status: 400 });

  const [{ data: checkins }, { data: staff }] = await Promise.all([
    admin.from("staff_checkins").select("staff_entity_id, checked_in_at, checked_out_at")
      .eq("company_id", companyId)
      .gte("checked_in_at", `${start}T00:00:00`)
      .lte("checked_in_at", `${end}T23:59:59.999`),
    admin.from("entities").select("id, name").eq("company_id", companyId).eq("entity_type", "Staff").is("deleted_at", null).order("name"),
  ]);

  const now = Date.now();
  const hoursByStaff = new Map<string, number>();
  for (const c of checkins ?? []) {
    const startMs = new Date(c.checked_in_at).getTime();
    const endMs = c.checked_out_at ? new Date(c.checked_out_at).getTime() : now;
    const hours = Math.max(0, endMs - startMs) / 3_600_000;
    hoursByStaff.set(c.staff_entity_id, (hoursByStaff.get(c.staff_entity_id) ?? 0) + hours);
  }

  const summary = (staff ?? [])
    .map((s) => ({ staff_entity_id: s.id, name: s.name, hours: Math.round((hoursByStaff.get(s.id) ?? 0) * 100) / 100 }))
    .filter((s) => s.hours > 0)
    .sort((a, b) => b.hours - a.hours);

  return NextResponse.json({ summary });
}
