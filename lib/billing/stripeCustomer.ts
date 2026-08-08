// lib/billing/stripeCustomer.ts
// Find-or-create a company's Stripe Customer, shared by every checkout route
// (app/api/billing/checkout/route.ts's subscription flow,
// app/api/ai/credit/checkout/route.ts's one-time credit-pack flow) -- a
// company_subscriptions row is created lazily on whichever checkout happens
// first, so this can't assume one already exists.
import { getStripe } from "@/lib/stripe";

export async function getOrCreateStripeCustomer(admin: any, companyId: string, email: string | undefined): Promise<string> {
  const { data: existing } = await admin
    .from("company_subscriptions")
    .select("stripe_customer_id")
    .eq("company_id", companyId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { companyId },
  });
  await admin
    .from("company_subscriptions")
    .upsert({ company_id: companyId, stripe_customer_id: customer.id }, { onConflict: "company_id" });
  return customer.id;
}
