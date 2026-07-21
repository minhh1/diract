-- Per-request token ledger for the AI assistant (see
-- app/api/ai/chat/route.ts), mirroring virtual_computer_usage_events.sql's
-- role for PAYG VM billing. One row per chat response.
--
-- cost_usd is computed at write time from lib/billing/aiModels.ts's
-- per-model rates for provider = 'hosted', or a flat platform service fee
-- for provider = 'self_hosted' (see PLATFORM_AI_SERVICE_FEE_USD_PER_1K_TOKENS
-- in lib/billing/plans.ts) -- self-hosted compute is free to us, but still
-- charged a flat fee, same shape as meteredServiceFeeUsdPerHour for PAYG
-- VMs whose real cost also varies (or is zero) per interval.
--
-- Reported to Stripe by lib/billing/aiUsageReporting.ts, called from
-- app/api/ai/usage/sweep/route.ts on a cron schedule (see that route's
-- header for how it's authorized, mirrors app/api/virtual-computers/sweep).

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  model_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('hosted', 'self_hosted')),
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  reported_to_stripe_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_usage_events_company_id_idx ON ai_usage_events(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_unreported_idx ON ai_usage_events(company_id) WHERE reported_to_stripe_at IS NULL;

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_events_company_members ON ai_usage_events;
CREATE POLICY ai_usage_events_company_members ON ai_usage_events
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
