// lib/billing/aiCredit.ts
// Prepaid AI credit packs -- a company admin buys one via
// app/api/ai/credit/checkout/route.ts once they've hit monthly_token_cap,
// raising their effective cap for the current and following calendar month
// (see lib/billing/aiUsagePeriod.ts). Granted by
// app/api/webhooks/stripe/route.ts after payment confirms, tracked in
// ai_credit_purchases (supabase/migrations/20260808100000_ai_credit_purchases.sql).
import { creditValidPeriodStarts, periodStartDateString } from "@/lib/billing/aiUsagePeriod";

export interface AiCreditPack {
  id: string;
  label: string;
  tokensGranted: number;
  amountUsdCents: number;
}

// Flat published rate: $5 per 1,000,000 tokens. Chosen to comfortably clear
// the marked-up (see AI_COST_MARKUP_MULTIPLIER in lib/billing/aiModels.ts)
// blended cost of the hosted-model catalog regardless of which model the
// credit ends up paying for -- same flat-token-count simplification
// monthly_token_cap itself already makes (it also ignores per-model cost
// variance). Accepted, monitorable risk: usage that lands on the pricier
// direct-Anthropic branch (invoice parsing only, low volume) can erode this
// specific margin -- not worth gating credit by provider for v1.
//
// Never trust a client-supplied amount/token pair -- API routes must look
// packs up by id from this list, not accept arbitrary values from the body.
export const AI_CREDIT_PACKS: AiCreditPack[] = [
  { id: "small", label: "5,000,000 tokens", tokensGranted: 5_000_000, amountUsdCents: 2500 },
  { id: "medium", label: "10,000,000 tokens", tokensGranted: 10_000_000, amountUsdCents: 5000 },
  { id: "large", label: "20,000,000 tokens", tokensGranted: 20_000_000, amountUsdCents: 10000 },
];

export function findCreditPack(id: string): AiCreditPack | undefined {
  return AI_CREDIT_PACKS.find((p) => p.id === id);
}

// Sums tokens_granted from every still-valid purchase (this month and last
// month's, see creditValidPeriodStarts) for one company.
export async function getCreditTokensForPeriod(admin: any, companyId: string): Promise<number> {
  const periodStarts = creditValidPeriodStarts().map(periodStartDateString);
  const { data } = await admin
    .from("ai_credit_purchases")
    .select("tokens_granted")
    .eq("company_id", companyId)
    .in("period_start", periodStarts);
  return (data ?? []).reduce((sum: number, row: any) => sum + Number(row.tokens_granted), 0);
}

export interface UsageEventForAttribution {
  id: string;
  created_at: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

// Given every ai_usage_events row for one company+period (any report
// status), sorted oldest-first, buckets each event as billable (falls
// entirely under monthlyTokenCap) or creditFunded (falls entirely past
// monthlyTokenCap and within the purchased credit) by walking a cumulative
// token counter. Whole-event attribution, not prorated per token -- at most
// one event per company per period can straddle the cap/credit boundary and
// land on the "wrong" side by its own token count, an accepted rounding
// cost in exchange for not prorating cost_usd. See
// app/api/ai/usage/sweep/route.ts, which is the only caller: it must not
// report creditFunded events' cost to the Stripe meter, since that cost was
// already collected via the one-time credit-pack Checkout payment.
export function splitCreditFundedEvents(
  periodEvents: UsageEventForAttribution[],
  monthlyTokenCap: number,
  creditTokens: number
): { billable: UsageEventForAttribution[]; creditFunded: UsageEventForAttribution[] } {
  const sorted = [...periodEvents].sort((a, b) => a.created_at.localeCompare(b.created_at));
  let cumulative = 0;
  const billable: UsageEventForAttribution[] = [];
  const creditFunded: UsageEventForAttribution[] = [];
  for (const event of sorted) {
    const tokensBefore = cumulative;
    cumulative += event.input_tokens + event.output_tokens;
    const isCreditFunded = tokensBefore >= monthlyTokenCap && tokensBefore < monthlyTokenCap + creditTokens;
    (isCreditFunded ? creditFunded : billable).push(event);
  }
  return { billable, creditFunded };
}
