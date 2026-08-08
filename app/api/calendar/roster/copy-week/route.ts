// app/api/calendar/roster/copy-week/route.ts
// "Copy last week to this week" -- duplicates every shift from one week
// onto another, dates shifted by the same day-offset, always landing as
// 'draft' regardless of the source shift's status (a copied week always
// needs its own explicit publish, see .../publish/route.ts -- never
// silently inherits "final"). Skips shifts whose staff entity has since
// been soft-deleted. Deliberately does not dedupe against shifts already
// in the target week -- v1 is a fast "start from last week" action, not a
// merge; running it twice visibly duplicates and can be cleaned up
// manually (the button's own tooltip says so).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

// Pure date-only arithmetic via Date.UTC on both ends -- avoids any local-
// timezone contamination a plain `new Date(dateStr)` parse/getDate() round
// trip could introduce (a real pitfall: UTC midnight can render as the
// previous day in a negative-offset local timezone).
function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function dayDiffUTC(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin, hasPermission } = auth;
  if (!isAdmin && !hasPermission("roster.edit")) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const fromWeekStart: string | undefined = body?.fromWeekStart;
  const toWeekStart: string | undefined = body?.toWeekStart;
  if (!fromWeekStart || !toWeekStart || !/^\d{4}-\d{2}-\d{2}$/.test(fromWeekStart) || !/^\d{4}-\d{2}-\d{2}$/.test(toWeekStart)) {
    return NextResponse.json({ error: "fromWeekStart and toWeekStart (YYYY-MM-DD) are required" }, { status: 400 });
  }

  const fromWeekEnd = addDaysUTC(fromWeekStart, 6);
  const { data: sourceShifts, error } = await admin
    .from("roster_shifts")
    .select("staff_entity_id, shift_date, start_time, end_time, role_note")
    .eq("company_id", companyId)
    .gte("shift_date", fromWeekStart)
    .lte("shift_date", fromWeekEnd);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!sourceShifts?.length) return NextResponse.json({ copied: 0, skipped: 0 });

  const staffIds = Array.from(new Set(sourceShifts.map((s: any) => s.staff_entity_id)));
  const { data: activeStaff } = await admin.from("entities").select("id").in("id", staffIds).is("deleted_at", null);
  const activeStaffIds = new Set((activeStaff ?? []).map((s: any) => s.id));

  const rows = sourceShifts
    .filter((s: any) => activeStaffIds.has(s.staff_entity_id))
    .map((s: any) => ({
      company_id: companyId,
      staff_entity_id: s.staff_entity_id,
      shift_date: addDaysUTC(toWeekStart, dayDiffUTC(s.shift_date, fromWeekStart)),
      start_time: s.start_time,
      end_time: s.end_time,
      role_note: s.role_note,
      status: "draft",
      created_by: user.id,
    }));
  const skipped = sourceShifts.length - rows.length;

  if (rows.length) {
    const { error: insertError } = await admin.from("roster_shifts").insert(rows);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ copied: rows.length, skipped });
}
