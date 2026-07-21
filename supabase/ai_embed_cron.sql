-- Runs ai-embed-worker for every company on a schedule, same pg_cron +
-- net.http_post shape as teams_sync_cron.sql / gmail_archive.sql.
SELECT cron.schedule(
  'ai-embed-worker',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/ai-embed-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb)
  $$
);
