// app/api/admin/analytics/route.ts
// Aggregates page_visits + api_invocations for the Platform Health tab's
// Analytics sub-tab. Aggregation happens here in JS rather than a SQL
// view/RPC — simplest option for this app's traffic volume; revisit with a
// real grouped query if these tables get large enough for that to matter.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSiteAdmin } from "@/lib/requireSiteAdmin";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function countByDay(rows: { created_at: string }[], days: number): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(dayKey(row.created_at), (counts.get(dayKey(row.created_at)) || 0) + 1);
  const result: { date: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    result.push({ date: key, count: counts.get(key) || 0 });
  }
  return result;
}

function topBy<T extends Record<string, string | null>>(rows: T[], key: string, limit: number): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = row[key];
    if (value == null) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export async function GET() {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guard.response;

  const admin = adminClient();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: visits, error: visitsErr }, { data: invocations, error: invocationsErr }] = await Promise.all([
    admin.from("page_visits").select("path, country, created_at").gte("created_at", since).limit(50000),
    admin.from("api_invocations").select("path, method, created_at").gte("created_at", since).limit(50000),
  ]);
  if (visitsErr) return NextResponse.json({ error: visitsErr.message }, { status: 500 });
  if (invocationsErr) return NextResponse.json({ error: invocationsErr.message }, { status: 500 });

  const invocationRows = (invocations || []).map(r => ({ ...r, key: `${r.method} ${r.path}` }));

  return NextResponse.json({
    visitsByDay: countByDay(visits || [], 30),
    // Full ranked lists (not just a top-N slice) -- the Analytics sub-tab
    // shows a top-10 preview with a "show all" expand + search over the
    // complete set, so the client needs every distinct path/endpoint here.
    topPaths: topBy(visits || [], "path", Infinity),
    topCountries: topBy((visits || []).filter(v => v.country), "country", 10),
    invocationsByDay: countByDay(invocations || [], 30),
    topApiEndpoints: topBy(invocationRows, "key", Infinity),
    totals: { visits: (visits || []).length, invocations: (invocations || []).length },
  });
}
