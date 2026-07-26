// app/api/gotenberg/heartbeat/route.ts
// Cron-only — pings the docservice/Gotenberg doc-conversion host's /health
// endpoint and records a cron_heartbeats row, same CRON_SECRET bearer-auth
// pattern as app/api/ai/usage/sweep/route.ts and
// app/api/virtual-computers/sweep/route.ts. Distinct from the live,
// on-demand check in app/api/admin/health/check/route.ts (checkGotenberg) —
// that one only runs when an admin has the Platform Health tab open; this
// one runs on a schedule (see .github/workflows/gotenberg-heartbeat.yml,
// every 10 minutes — Vercel Cron on the Hobby plan only supports once-daily
// jobs) so an outage shows up in the Services sub-tab even if nobody's
// looking, and a stale/never-run row is itself a signal something's wrong.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = adminClient();
  const started = Date.now();
  const url = process.env.GOTENBERG_URL || "http://localhost:3033";

  let ok = true;
  let detail: string;
  try {
    const res = await fetch(`${url}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    detail = "reachable";
  } catch (err) {
    ok = false;
    detail = err instanceof Error ? err.message : "unreachable";
  }

  await admin.from("cron_heartbeats").upsert(
    { name: "gotenberg-heartbeat", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: { ok, detail } },
    { onConflict: "name" }
  );

  return NextResponse.json({ ok, detail });
}
