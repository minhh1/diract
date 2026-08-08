// app/api/calendar/roster/publish/route.ts
// "Publish week" -- bulk flips every draft shift in a week to 'final' in
// one update, making it visible to non-admin staff for the first time (see
// roster_shifts' RLS: a non-admin only ever sees status='final'). No
// separate "roster" row to flip -- status lives per shift (see the
// migration's own comment), so publishing a week is just this one query.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

function addDaysUTC(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const weekStart: string | undefined = body?.weekStart;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return NextResponse.json({ error: "weekStart (YYYY-MM-DD) is required" }, { status: 400 });
  }
  const weekEnd = addDaysUTC(weekStart, 6);

  const { data: published, error } = await admin
    .from("roster_shifts")
    .update({ status: "final", updated_at: new Date().toISOString() })
    .eq("company_id", companyId)
    .eq("status", "draft")
    .gte("shift_date", weekStart)
    .lte("shift_date", weekEnd)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ published: published?.length ?? 0 });
}
