CREATE TABLE IF NOT EXISTS cron_heartbeats (
  name text PRIMARY KEY,
  last_run_at timestamptz NOT NULL DEFAULT now(),
  last_duration_ms integer,
  last_result jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cron_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_heartbeats_select ON cron_heartbeats;
CREATE POLICY cron_heartbeats_select ON cron_heartbeats FOR SELECT USING (auth.uid() IS NOT NULL);
