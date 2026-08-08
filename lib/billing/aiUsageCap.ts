// lib/billing/aiUsageCap.ts
// Current-billing-period token usage vs. a company's monthly_token_cap
// (see ai_chat_settings.sql) plus any still-valid purchased credit (see
// lib/billing/aiCredit.ts) -- shared by app/api/ai/chat/route.ts and
// app/api/teams/bot/[companyId]/route.ts so both enforce the exact same
// cap against the exact same usage pool (ai_usage_events is company-wide,
// not per-channel).
import { currentPeriodStart } from "@/lib/billing/aiUsagePeriod";
import { getCreditTokensForPeriod } from "@/lib/billing/aiCredit";

export async function isTokenCapReached(admin: any, companyId: string, tokenCap: number): Promise<boolean> {
  const periodStart = currentPeriodStart();

  const [{ data: periodEvents }, creditTokens] = await Promise.all([
    admin
      .from("ai_usage_events")
      .select("input_tokens, output_tokens")
      .eq("company_id", companyId)
      .gte("created_at", periodStart.toISOString()),
    getCreditTokensForPeriod(admin, companyId),
  ]);

  const tokensUsed = (periodEvents ?? []).reduce((sum: number, e: any) => sum + e.input_tokens + e.output_tokens, 0);
  return tokensUsed >= tokenCap + creditTokens;
}
