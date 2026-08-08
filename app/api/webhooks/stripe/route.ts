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
import { currentPeriodStart, periodStartDateString } from "@/lib/billing/aiUsagePeriod";

function subscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const seconds = subscription.items.data[0]?.current_period_end;
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

// Grants a purchased AI credit pack (see lib/billing/aiCredit.ts,
// app/api/ai/credit/checkout/route.ts) once its mode:"payment" Checkout
// Session has actually been paid. period_start is computed here, at
// processing time, rather than trusted from session metadata -- it's when
// the money actually landed, not when the session was created.
// onConflict + ignoreDuplicates on stripe_checkout_session_id makes this
// safe against Stripe redelivering the same event.
async function grantAiCredit(admin: ReturnType<typeof adminClient>, session: Stripe.Checkout.Session) {
  const companyId = session.metadata?.companyId;
  const tokensGranted = Number(session.metadata?.tokensGranted);
  if (!companyId || !Number.isFinite(tokensGranted) || tokensGranted <= 0) return;

  await admin.from("ai_credit_purchases").upsert(
    {
      company_id: companyId,
      tokens_granted: tokensGranted,
      amount_usd_cents: session.amount_total ?? 0,
      stripe_checkout_session_id: session.id,
      period_start: periodStartDateString(currentPeriodStart()),
    },
    { onConflict: "stripe_checkout_session_id", ignoreDuplicates: true }
  );
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

      if (session.mode === "payment") {
        // One-time AI credit pack -- see grantAiCredit() above.
        // async_payment_succeeded (below) handles delayed payment methods,
        // where this event can fire while payment_status is still "unpaid".
        if (session.metadata?.type === "ai_credit" && session.payment_status === "paid") {
          await grantAiCredit(admin, session);
        }
        break;
      }

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

    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "payment" && session.metadata?.type === "ai_credit") {
        await grantAiCredit(admin, session);
      }
      break;
    }

    case "checkout.session.async_payment_failed":
      // Nothing to reverse -- credit is only granted on confirmed payment.
      break;

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
