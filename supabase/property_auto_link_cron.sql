-- pg_cron schedule for property-auto-link-scan (see
-- supabase/functions/property-auto-link-scan/index.ts and
-- supabase/migrations/20260730160000_property_auto_link_requests.sql).
-- Every 30 minutes -- this is a pure DB scan (no external API calls, no
-- per-user Gmail-style rate limit to respect), and a new/renamed project
-- doesn't need to be proposed within seconds the way a label sync does, so
-- a much slower cadence than the gmail-*-cron jobs (*/15 * * * *) is fine.
SELECT cron.schedule('property-auto-link-scan', '*/30 * * * *', $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/property-auto-link-scan',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
$$);
