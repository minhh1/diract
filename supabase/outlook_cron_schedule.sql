-- pg_cron schedules for the Outlook async label-sync engine (Phase 2 of
-- Outlook parity for Shared Labels), mirroring supabase/gmail_cron_timeout_fix.sql.
-- outlook-label-sync-worker is staggered to :45 of each minute — the three
-- existing per-minute Gmail jobs already occupy :05/:15/:30 (see that
-- file's header comment: pg_net's outbound worker can only serve one
-- net.http_post at the exact same instant, so anything firing in the same
-- second as another per-minute job silently times out on DNS resolution
-- alone). Not run in a loose .sql file's own migration, matching the
-- existing convention that dispatcher/cron registration lives outside
-- supabase/migrations/ (see dispatcher_locks.sql, gmail_cron_timeout_fix.sql).

SELECT cron.schedule('outlook-label-sync-worker', '* * * * *', $$
  SELECT pg_sleep(45);
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/outlook-label-sync-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
$$);

SELECT cron.schedule('outlook-label-sync-cron', '*/15 * * * *', $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/outlook-label-sync-cron',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
$$);

-- Every 6h, not daily like gmail-watch-renewal — Graph subscriptions expire
-- in ~3 days max vs. Gmail's ~7-day watch, so this needs a much tighter
-- cadence to avoid a gap in coverage.
SELECT cron.schedule('outlook-watch-renewal', '0 */6 * * *', $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/outlook-watch-renewal',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
$$);
