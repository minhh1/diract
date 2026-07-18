// lib/stripe.ts
import Stripe from "stripe";

let _stripe: Stripe | null = null;

// Lazy singleton -- process.env is read inside the function body, not at
// module scope, so a missing STRIPE_SECRET_KEY only throws when billing
// code actually runs (matches lib/documentTemplateAuth.ts's adminClient()).
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  _stripe = new Stripe(key);
  return _stripe;
}
