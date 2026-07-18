-- Widen the status CHECK to cover Stripe's full Subscription.status enum
-- (confirmed against the installed stripe SDK's type definitions) -- the
-- original constraint in company_subscriptions.sql was missing
-- 'incomplete_expired' and 'paused', which would make the webhook handler
-- fail to write those states.
ALTER TABLE company_subscriptions DROP CONSTRAINT IF EXISTS company_subscriptions_status_check;
ALTER TABLE company_subscriptions ADD CONSTRAINT company_subscriptions_status_check
  CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'));
