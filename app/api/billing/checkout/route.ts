// app/api/billing/checkout/route.ts
// Admin-only. Creates (or reuses) a Stripe Customer for the company, then a
// Checkout Session for the chosen plan, and returns its URL for the client
// to redirect to. Never touches raw card details -- pure redirect flow.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getStripe } from "@/lib/stripe";
import { isPlanId, getStripePriceId } from "@/lib/billing/plans";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const planId = body?.planId;
  if (typeof planId !== "string" || !isPlanId(planId)) {
    return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
  }

  const stripe = getStripe();

  const { data: existing } = await admin
    .from("company_subscriptions")
    .select("stripe_customer_id")
    .eq("company_id", companyId)
    .maybeSingle();

  let stripeCustomerId = existing?.stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { companyId },
    });
    stripeCustomerId = customer.id;
    await admin
      .from("company_subscriptions")
      .upsert({ company_id: companyId, stripe_customer_id: stripeCustomerId }, { onConflict: "company_id" });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    client_reference_id: companyId,
    metadata: { companyId, planId },
    line_items: [{ price: getStripePriceId(planId), quantity: 1 }],
    success_url: `${appUrl}/dashboard/billing?checkout=success`,
    cancel_url: `${appUrl}/dashboard/billing?checkout=cancel`,
  });

  if (!session.url) return NextResponse.json({ error: "Could not create checkout session" }, { status: 502 });

  return NextResponse.json({ url: session.url });
}
