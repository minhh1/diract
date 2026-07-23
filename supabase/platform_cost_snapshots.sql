-- Real spend-so-far tracking for the Platform Health tab's "Costs"
-- sub-tab. 'live' rows are written by lib/costs/*.ts fetchers (DigitalOcean,
-- AWS Cost Explorer, Stripe fees, Vercel) via a daily cron + on-demand
-- refresh (app/api/admin/costs/refresh). 'manual' rows are entered by a
-- site admin for the services confirmed to have no public billing API
-- (Fly.io, Supabase, Together AI, as of this table's creation) — same
-- shape either way so the UI doesn't need to special-case them.
CREATE TABLE IF NOT EXISTS platform_cost_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount_usd numeric NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  source text NOT NULL CHECK (source IN ('live', 'manual')),
  notes text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS platform_cost_snapshots_service_period_idx ON platform_cost_snapshots (service, period_start DESC);

ALTER TABLE platform_cost_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_cost_snapshots_site_admin ON platform_cost_snapshots
  FOR ALL USING (is_site_admin()) WITH CHECK (is_site_admin());
