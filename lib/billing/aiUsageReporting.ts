// lib/billing/aiUsageReporting.ts
// Reports accumulated AI assistant token usage to Stripe's Billing Meters
// API, mirroring lib/billing/usageReporting.ts's PAYG VM precedent exactly.
// Called periodically from app/api/ai/usage/sweep/route.ts.
//
// Requires a Stripe Billing Meter with event_name METER_EVENT_NAME below
// (`default_aggregation: { formula: "sum" }`, `customer_mapping.event_payload_key:
// "stripe_customer_id"`, `value_settings.event_payload_key: "value"`) and a
// metered Price attached to it -- set this up in both the test and live
// Stripe accounts before relying on it, same manual step called out in
// usageReporting.ts.
import { getStripe } from "@/lib/stripe";

const METER_EVENT_NAME = "ai_tokens_cents";

interface UsageEventRow {
  id: string;
  cost_usd: number;
}

// Reports every not-yet-reported ai_usage_events row for one Stripe
// customer as a single aggregated meter event. Marks the reported rows so
// a later pass doesn't double-report them.
export async function reportAiUsageForCustomer(
  admin: any,
  stripeCustomerId: string,
  events: UsageEventRow[]
): Promise<void> {
  if (events.length === 0) return;
  const totalCents = events.reduce((sum, e) => sum + Math.round(e.cost_usd * 100), 0);

  if (totalCents > 0) {
    const stripe = getStripe();
    await stripe.billing.meterEvents.create({
      event_name: METER_EVENT_NAME,
      payload: { stripe_customer_id: stripeCustomerId, value: String(totalCents) },
    });
  }

  await admin
    .from("ai_usage_events")
    .update({ reported_to_stripe_at: new Date().toISOString() })
    .in("id", events.map((e) => e.id));
}
