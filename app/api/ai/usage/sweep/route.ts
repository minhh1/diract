// app/api/ai/usage/sweep/route.ts
// Cron-only -- reports every company's unreported ai_usage_events to Stripe.
// Mirrors app/api/virtual-computers/sweep/route.ts's CRON_SECRET bearer-auth
// pattern (Vercel Cron signs its own requests with that secret; add this
// route to the Vercel Cron Jobs schedule, running every 5-10 minutes,
// same as the VM sweep).
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { reportAiUsageForCustomer } from "@/lib/billing/aiUsageReporting";
import { currentPeriodStart } from "@/lib/billing/aiUsagePeriod";
import { getCreditTokensForPeriod, splitCreditFundedEvents } from "@/lib/billing/aiCredit";

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
    .select("id, company_id")
    .is("reported_to_stripe_at", null);

  const unreportedByCompany = new Map<string, Set<string>>();
  for (const row of unreported ?? []) {
    const ids = unreportedByCompany.get(row.company_id) ?? new Set<string>();
    ids.add(row.id);
    unreportedByCompany.set(row.company_id, ids);
  }

  let reported = 0;
  for (const [companyId, unreportedIds] of unreportedByCompany) {
    const { data: sub } = await admin
      .from("company_subscriptions")
      .select("stripe_customer_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!sub?.stripe_customer_id) continue; // no Stripe customer yet (e.g. never checked out) -- nothing to report to

    // Determine which of this company's unreported events fall past
    // monthly_token_cap and within purchased credit (see
    // lib/billing/aiCredit.ts) -- those were already paid for via a
    // one-time credit-pack Checkout and must NOT also go to the metered
    // Stripe invoice, or the company is charged twice for the same tokens.
    // Requires the full period's events (any report status), not just the
    // unreported ones, since correct attribution depends on the cumulative
    // token position built up by earlier, already-reported events too --
    // the same query shape lib/billing/aiUsageCap.ts's isTokenCapReached
    // already runs on every single AI request, just here on a cron cadence.
    const [{ data: settings }, creditTokens, { data: periodEvents }] = await Promise.all([
      admin.from("ai_chat_settings").select("monthly_token_cap").eq("company_id", companyId).maybeSingle(),
      getCreditTokensForPeriod(admin, companyId),
      admin
        .from("ai_usage_events")
        .select("id, created_at, input_tokens, output_tokens, cost_usd")
        .eq("company_id", companyId)
        .gte("created_at", currentPeriodStart().toISOString()),
    ]);
    const monthlyTokenCap = settings?.monthly_token_cap ?? 1000000;

    const { billable, creditFunded } = splitCreditFundedEvents(periodEvents ?? [], monthlyTokenCap, creditTokens);
    const billableUnreported = billable
      .filter((e) => unreportedIds.has(e.id))
      .map((e) => ({ id: e.id, cost_usd: e.cost_usd }));
    const creditFundedUnreportedIds = creditFunded.filter((e) => unreportedIds.has(e.id)).map((e) => e.id);

    await reportAiUsageForCustomer(admin, sub.stripe_customer_id, billableUnreported);
    if (creditFundedUnreportedIds.length) {
      await admin
        .from("ai_usage_events")
        .update({ reported_to_stripe_at: new Date().toISOString() })
        .in("id", creditFundedUnreportedIds);
    }
    reported += unreportedIds.size;
  }

  await admin.from("cron_heartbeats").upsert(
    { name: "ai-usage-sweep", last_run_at: new Date().toISOString(), last_duration_ms: Date.now() - started, last_result: { companies: unreportedByCompany.size, eventsReported: reported } },
    { onConflict: "name" }
  );

  return NextResponse.json({ companies: unreportedByCompany.size, eventsReported: reported });
}
