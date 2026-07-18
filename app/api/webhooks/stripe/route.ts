// app/api/webhooks/stripe/route.ts
// Unauthenticated (no user session on a webhook) -- uses the service-role
// client directly, same shape as
// app/api/document-templates/public/[pageId]/submit/route.ts, but with
// real Stripe signature verification instead of a shared access-code
// string (this is the first signature-verified webhook in this repo).
//
// Field access below is verified against the installed `stripe` SDK's type
// definitions (v22, a recent Stripe API version): Subscription no longer
// carries current_period_end at the top level -- it lives on each
// subscription item (subscription.items.data[0].current_period_end).
// Invoice.subscription similarly moved under
// invoice.parent.subscription_details.subscription. Don't "fix" these back
// to the old top-level fields without re-checking node_modules/stripe's
// .d.ts files -- they don't exist there anymore.
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { adminClient } from "@/lib/documentTemplateAuth";
import { isPlanId } from "@/lib/billing/plans";

function subscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const seconds = subscription.items.data[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 400 });
  }

  const rawBody = await req.text(); // must read raw text before any JSON parsing, for signature verification
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 }
    );
  }

  const admin = adminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const companyId = session.client_reference_id;
      const planId = session.metadata?.planId;
      if (!companyId || !session.subscription || !planId || !isPlanId(planId)) break;

      const subscription = await getStripe().subscriptions.retrieve(session.subscription as string);
      await admin
        .from("company_subscriptions")
        .update({
          stripe_subscription_id: subscription.id,
          stripe_customer_id: session.customer as string,
          status: subscription.status,
          current_period_end: subscriptionPeriodEnd(subscription),
          plan_id: planId,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId);
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await admin
        .from("company_subscriptions")
        .update({
          status: subscription.status,
          current_period_end: subscriptionPeriodEnd(subscription),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef?.id;
      if (!subscriptionId) break;

      await admin
        .from("company_subscriptions")
        .update({ status: "past_due", updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", subscriptionId);
      break;
    }
  }

  return NextResponse.json({ received: true });
}
