// app/api/ai/credit/checkout/route.ts
// Admin-only. Creates a one-time (mode: "payment", not subscription) Stripe
// Checkout Session for a fixed AI credit pack (see lib/billing/aiCredit.ts)
// -- the pack raises the company's effective monthly_token_cap once granted
// by app/api/webhooks/stripe/route.ts on payment confirmation. Never accept
// a client-supplied amount/token pair -- packId is looked up server-side.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/billing/stripeCustomer";
import { findCreditPack } from "@/lib/billing/aiCredit";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const packId = body?.packId;
  const pack = typeof packId === "string" ? findCreditPack(packId) : undefined;
  if (!pack) return NextResponse.json({ error: "Invalid packId" }, { status: 400 });

  const stripe = getStripe();
  const stripeCustomerId = await getOrCreateStripeCustomer(admin, companyId, user.email ?? undefined);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    client_reference_id: companyId,
    metadata: { type: "ai_credit", companyId, tokensGranted: String(pack.tokensGranted), packId: pack.id },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: { name: `AI capacity top-up -- ${pack.label}` },
          unit_amount: pack.amountUsdCents,
        },
        quantity: 1,
      },
    ],
    success_url: `${appUrl}/dashboard/admin?tab=aiAssistant&checkout=success`,
    cancel_url: `${appUrl}/dashboard/admin?tab=aiAssistant&checkout=cancel`,
  });

  if (!session.url) return NextResponse.json({ error: "Could not create checkout session" }, { status: 502 });

  return NextResponse.json({ url: session.url });
}
