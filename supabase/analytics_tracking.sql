-- Site-wide visit + API-invocation counters for the Platform Health tab's
-- "Analytics" sub-tab. There was no analytics/telemetry table anywhere in
-- this app before this -- these two are deliberately minimal (no unified
-- request log, no per-status breakdown) since that's all "how many visits
-- and where, how many API calls per day per endpoint" needs. Both start
-- accumulating from whenever this ships; there's no historical backfill.

CREATE TABLE IF NOT EXISTS page_visits (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path text NOT NULL,
  referrer text,
  country text,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS page_visits_created_at_idx ON page_visits (created_at);

ALTER TABLE page_visits ENABLE ROW LEVEL SECURITY;

-- Insert-only from the public tracking beacon (app/api/track/visit) --
-- no session/auth required to record a visit, same as any client-side
-- analytics pixel. Reads are site-admin only.
CREATE POLICY page_visits_insert ON page_visits FOR INSERT WITH CHECK (true);
CREATE POLICY page_visits_select ON page_visits FOR SELECT USING (is_site_admin());

CREATE TABLE IF NOT EXISTS api_invocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path text NOT NULL,
  method text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_invocations_created_at_idx ON api_invocations (created_at);

ALTER TABLE api_invocations ENABLE ROW LEVEL SECURITY;

-- Written server-side only, from proxy.ts (Next middleware) using the
-- service-role client -- RLS here just needs to allow site-admin reads;
-- there's no client-side insert path at all (unlike page_visits).
CREATE POLICY api_invocations_select ON api_invocations FOR SELECT USING (is_site_admin());
