// app/api/admin/costs/route.ts
// GET returns the latest snapshot per service (live + manual) plus a 6-month
// trend per service. POST records a manual entry -- for Fly.io, Supabase,
// and Together AI, confirmed to have no public billing API as of when this
// was built, so a site admin enters their monthly spend by hand instead.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSiteAdmin } from "@/lib/requireSiteAdmin";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guard.response;

  const admin = adminClient();
  const sixMonthsAgo = new Date(Date.now() - 183 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("platform_cost_snapshots")
    .select("*")
    .gte("period_start", sixMonthsAgo)
    .order("period_start", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byService = new Map<string, typeof data>();
  for (const row of data || []) {
    if (!byService.has(row.service)) byService.set(row.service, []);
    byService.get(row.service)!.push(row);
  }

  const services = Array.from(byService.entries()).map(([service, snapshots]) => ({
    service,
    latest: snapshots[snapshots.length - 1],
    history: snapshots,
  }));

  return NextResponse.json({ services });
}

export async function POST(req: NextRequest) {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  if (!body?.service || body?.amount_usd == null || !body?.period_start || !body?.period_end) {
    return NextResponse.json({ error: "service, amount_usd, period_start, and period_end are required" }, { status: 400 });
  }

  const admin = adminClient();
  const { data, error } = await admin.from("platform_cost_snapshots").insert({
    service: body.service,
    period_start: body.period_start,
    period_end: body.period_end,
    amount_usd: body.amount_usd,
    source: "manual",
    notes: body.notes || null,
    created_by: guard.userId,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshot: data });
}
