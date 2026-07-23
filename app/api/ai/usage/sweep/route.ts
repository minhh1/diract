// app/api/ai/usage/sweep/route.ts
// Cron-only -- reports every company's unreported ai_usage_events to Stripe.
// Mirrors app/api/virtual-computers/sweep/route.ts's CRON_SECRET bearer-auth
// pattern (Vercel Cron signs its own requests with that secret; add this
// route to the Vercel Cron Jobs schedule, running every 5-10 minutes,
// same as the VM sweep).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { reportAiUsageForCustomer } from "@/lib/billing/aiUsageReporting";

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

  const { data: unreported } = await admin
    .from("ai_usage_events")
    .select("id, company_id, cost_usd")
    .is("reported_to_stripe_at", null);

  const byCompany = new Map<string, { id: string; cost_usd: number }[]>();
  for (const row of unreported ?? []) {
    const list = byCompany.get(row.company_id) ?? [];
    list.push({ id: row.id, cost_usd: row.cost_usd });
    byCompany.set(row.company_id, list);
  }

  let reported = 0;
  for (const [companyId, events] of byCompany) {
    const { data: sub } = await admin
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) continue; // no Stripe customer yet (e.g. never checked out) -- nothing to report to
    await reportAiUsageForCustomer(admin, sub.stripe_customer_id, events);
    reported += events.length;
  }

  await admin.from("cron_heartbeats").upsert(
    { name: "ai-usage-sweep", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: { companies: byCompany.size, eventsReported: reported } },
    { onConflict: "name" }
  );

  return NextResponse.json({ companies: byCompany.size, eventsReported: reported });
}
