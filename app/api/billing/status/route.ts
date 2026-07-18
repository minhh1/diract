// app/api/billing/status/route.ts
// Any company member can view billing status; only admins can act on it
// (see checkout/portal routes).
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { PLANS, isPlanId } from "@/lib/billing/plans";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: sub } = await admin
    .from("company_subscriptions")
    .select("plan_id, status, current_period_end")
    .eq("company_id", companyId)
    .maybeSingle();

  const plan = sub?.plan_id && isPlanId(sub.plan_id) ? PLANS[sub.plan_id] : null;

  return NextResponse.json({
    subscription: sub
      ? { planId: sub.plan_id, status: sub.status, currentPeriodEnd: sub.current_period_end }
      : null,
    plan,
    plans: Object.values(PLANS),
  });
}
