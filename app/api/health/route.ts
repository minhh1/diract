// app/api/health/route.ts
// Baseline self-check for this Next.js deployment itself — used as the
// "internal" target by the Platform Health tab's live heartbeat check
// (app/api/admin/health/check/route.ts). Deliberately returns no sensitive
// data (no auth required) so it can double as an external uptime-monitor
// target later if needed.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const startedAt = Date.now();

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let dbOk = false;
  const dbStarted = Date.now();
  if (supabaseUrl && serviceKey) {
    try {
      const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
      const { error } = await admin.from("cron_heartbeats").select("name", { head: true, count: "exact" }).limit(1);
      dbOk = !error;
    } catch {
      dbOk = false;
    }
  }

  return NextResponse.json({
    ok: dbOk,
    dbLatencyMs: Date.now() - dbStarted,
    uptimeMs: Date.now() - startedAt,
  }, { status: dbOk ? 200 : 503 });
}
