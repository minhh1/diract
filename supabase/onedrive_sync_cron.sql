-- Polls Microsoft Graph for every company with connected OneDrive/SharePoint
-- credentials (see company_onedrive_credentials.sql) and
-- admin_consent_granted = true. Mirrors teams_sync_cron.sql's shape.
SELECT cron.schedule(
  'onedrive-sync-worker',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/onedrive-sync-worker',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb)
  $$
);
