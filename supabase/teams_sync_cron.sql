-- Polls Microsoft Graph for every company with connected Teams credentials
-- (see company_teams_credentials.sql) and admin_consent_granted = true.
-- Mirrors the pg_cron + net.http_post shape used for the Gmail workers
-- (see gmail_archive.sql) -- every minute is overkill for chat history used
-- for RAG grounding rather than real-time notification, so this runs less
-- often.
SELECT cron.schedule(
  'teams-sync-worker',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/teams-sync-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb)
  $$
);
