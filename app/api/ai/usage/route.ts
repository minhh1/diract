// app/api/ai/usage/route.ts
// Current-period usage summary for the meter in app/dashboard/ai/page.tsx.
// Period is always the calendar month (see lib/billing/aiUsagePeriod.ts),
// matching lib/billing/aiUsageCap.ts's enforcement window exactly -- this
// used to diverge (following the Stripe subscription billing cycle instead,
// when one existed), which could make what's shown here disagree with what
// actually gets blocked. Either way this is just a display/cap window, not
// what's actually billed (Stripe's own meter aggregation is the source of
// truth for that, see lib/billing/aiUsageReporting.ts).
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { currentPeriodStart } from "@/lib/billing/aiUsagePeriod";
import { getCreditTokensForPeriod } from "@/lib/billing/aiCredit";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: settings } = await admin
    .from("ai_chat_settings")
    .select("monthly_token_cap")
    .eq("company_id", companyId)
    .maybeSingle();
  const tokenCap = settings?.monthly_token_cap ?? 2000000;

  const periodStart = currentPeriodStart();
  const periodEnd = new Date(periodStart);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const [{ data: events }, creditTokensThisPeriod] = await Promise.all([
    admin
      .from("ai_usage_events")
      .select("input_tokens, output_tokens, cost_usd")
      .eq("company_id", companyId)
      .gte("created_at", periodStart.toISOString()),
    getCreditTokensForPeriod(admin, companyId),
  ]);

  const tokensUsed = (events ?? []).reduce((sum, e) => sum + e.input_tokens + e.output_tokens, 0);
  const estimatedCostUsd = (events ?? []).reduce((sum, e) => sum + Number(e.cost_usd), 0);

  return NextResponse.json({
    tokensUsed,
    tokenCap,
    creditTokensThisPeriod,
    effectiveTokenCap: tokenCap + creditTokensThisPeriod,
    estimatedCostUsd,
    periodEnd: periodEnd.toISOString(),
  });
}
