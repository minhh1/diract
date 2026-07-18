-- Stripe subscription state for a company's fixed-tier platform billing plan
-- (see lib/billing/plans.ts). Distinct from company_cloud_credentials /
-- virtual_computers' BYO flow: this is what a company pays *us*, not what
-- we pay a cloud provider on their behalf.
--
-- One row per company, created lazily on first checkout
-- (app/api/billing/checkout/route.ts). Kept in sync by
-- app/api/webhooks/stripe/route.ts -- Stripe is always the source of
-- truth, these columns are a cache for fast reads in the API layer.

CREATE TABLE IF NOT EXISTS company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text,
  plan_id text CHECK (plan_id IN ('starter', 'standard', 'pro')),
  status text NOT NULL DEFAULT 'incomplete'
    CHECK (status IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS company_subscriptions_stripe_customer_id_idx
  ON company_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS company_subscriptions_stripe_subscription_id_idx
  ON company_subscriptions(stripe_subscription_id);

ALTER TABLE company_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_subscriptions_company_members ON company_subscriptions;
CREATE POLICY company_subscriptions_company_members ON company_subscriptions
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
