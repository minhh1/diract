// app/api/admin/costs/refresh/route.ts
// Pulls live cost data from every provider with a real billing API and
// upserts a snapshot for today. Reused two ways: called by the Platform
// Health tab's "Refresh now" button (site-admin session) and by a daily
// scheduled trigger (CRON_SECRET bearer, same pattern as
// app/api/virtual-computers/sweep and app/api/ai/usage/sweep) -- add this
// route to the Vercel Cron Jobs schedule (e.g. once daily) to keep costs
// current without a manual click.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSiteAdmin } from "@/lib/requireSiteAdmin";
import { fetchDigitalOceanCost } from "@/lib/costs/digitalocean";
import { fetchStripeFeesCost } from "@/lib/costs/stripe";
import { fetchAwsCost } from "@/lib/costs/aws";
import { fetchVercelCost } from "@/lib/costs/vercel";
import type { CostSnapshot } from "@/lib/costs/types";

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isAuthorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

const FETCHERS: Record<string, () => Promise<CostSnapshot>> = {
  digitalocean: fetchDigitalOceanCost,
  stripe_fees: fetchStripeFeesCost,
  aws: fetchAwsCost,
  vercel: fetchVercelCost,
};

export async function POST(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    const guard = await requireSiteAdmin();
    if (!guard.ok) return guard.response;
  }

  const admin = adminClient();
  const results: Record<string, { ok: boolean; detail?: string }> = {};

  for (const [service, fetcher] of Object.entries(FETCHERS)) {
    try {
      const snapshot = await fetcher();
      const { error } = await admin.from("platform_cost_snapshots").insert({
        service,
        period_start: snapshot.periodStart,
        period_end: snapshot.periodEnd,
        amount_usd: snapshot.amountUsd,
        source: "live",
      });
      if (error) throw new Error(error.message);
      results[service] = { ok: true };
    } catch (err) {
      results[service] = { ok: false, detail: err instanceof Error ? err.message : "failed" };
    }
  }

  await admin.from("cron_heartbeats").upsert(
    { name: "platform-cost-refresh", last_run_at: new Date().toISOString(), last_result: results },
    { onConflict: "name" }
  );

  return NextResponse.json({ results });
}
