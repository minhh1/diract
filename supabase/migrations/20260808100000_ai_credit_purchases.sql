-- One-time prepaid AI credit packs (see lib/billing/aiCredit.ts,
-- app/api/ai/credit/checkout/route.ts). A row is written only by the
-- service-role Stripe webhook client after a successful mode:"payment"
-- Checkout Session -- see app/api/webhooks/stripe/route.ts's grantAiCredit().
--
-- tokens_granted is added to a company's monthly_token_cap for the period(s)
-- it's valid in (see lib/billing/aiUsagePeriod.ts's creditValidPeriodStarts
-- -- the month purchased plus the following one) by
-- lib/billing/aiUsageCap.ts's isTokenCapReached and consumed by
-- app/api/ai/usage/sweep/route.ts's splitCreditFundedEvents to avoid
-- double-billing credit-funded usage through the metered Stripe invoice.

CREATE TABLE IF NOT EXISTS ai_credit_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tokens_granted bigint NOT NULL,
  amount_usd_cents integer NOT NULL,
  stripe_checkout_session_id text NOT NULL,
  period_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency against Stripe webhook retries -- grantAiCredit() upserts on
-- this conflict target with ignoreDuplicates so a redelivered event can't
-- grant credit twice for the same Checkout Session.
CREATE UNIQUE INDEX IF NOT EXISTS ai_credit_purchases_stripe_session_idx
  ON ai_credit_purchases(stripe_checkout_session_id);

CREATE INDEX IF NOT EXISTS ai_credit_purchases_company_period_idx
  ON ai_credit_purchases(company_id, period_start);

ALTER TABLE ai_credit_purchases ENABLE ROW LEVEL SECURITY;

-- SELECT-only, deliberately -- unlike company_subscriptions' FOR ALL policy
-- (tolerable there only because nothing lets a client write to it), rows
-- here directly translate into spendable AI capacity via isTokenCapReached.
-- A FOR ALL policy would let any authenticated company member self-grant
-- unlimited free tokens by INSERTing a row directly via PostgREST. No
-- INSERT/UPDATE/DELETE policy exists, so RLS denies those by default --
-- only the service-role webhook client (which bypasses RLS) can write.
DROP POLICY IF EXISTS ai_credit_purchases_select ON ai_credit_purchases;
CREATE POLICY ai_credit_purchases_select ON ai_credit_purchases
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
