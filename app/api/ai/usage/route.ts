// app/api/ai/usage/route.ts
// Current-period usage summary for the meter in app/dashboard/ai/page.tsx.
// Period is the company's Stripe subscription billing cycle if one exists
// (company_subscriptions.current_period_end), otherwise the calendar month
// -- either way it's just a display/cap window, not what's actually billed
// (Stripe's own meter aggregation is the source of truth for that, see
// lib/billing/aiUsageReporting.ts).
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

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

  const { data: sub } = await admin
    .from("company_subscriptions")
    .select("current_period_end")
    .eq("company_id", companyId)
    .maybeSingle();

  const now = new Date();
  let periodEnd: Date;
  let periodStart: Date;
  if (sub?.current_period_end) {
    periodEnd = new Date(sub.current_period_end);
    periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);
  } else {
    periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const { data: events } = await admin
    .from("ai_usage_events")
    .select("input_tokens, output_tokens, cost_usd")
    .eq("company_id", companyId)
    .gte("created_at", periodStart.toISOString());

  const tokensUsed = (events ?? []).reduce((sum, e) => sum + e.input_tokens + e.output_tokens, 0);
  const estimatedCostUsd = (events ?? []).reduce((sum, e) => sum + Number(e.cost_usd), 0);

  return NextResponse.json({ tokensUsed, tokenCap, estimatedCostUsd, periodEnd: periodEnd.toISOString() });
}
