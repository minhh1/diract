// app/api/billing/portal/route.ts
// Admin-only. Creates a Stripe Billing Portal session for the company's
// existing customer, so they can update payment method / cancel / view
// invoices without us building any of that UI ourselves.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { data: sub } = await admin
    .from("company_subscriptions")
    .select("stripe_customer_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "No billing account yet -- subscribe to a plan first" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await getStripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${appUrl}/dashboard/billing`,
  });

  return NextResponse.json({ url: session.url });
}
