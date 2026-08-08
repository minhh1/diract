-- Daily cron for the two-way Google Calendar sync's watch registration/
-- renewal (supabase/functions/calendar-watch-renewal/index.ts) -- same
-- net.http_post-to-an-edge-function shape as gmail-watch-renewal's own cron
-- entry (supabase/gmail_cron_timeout_fix.sql). A few minutes after that one
-- (9pm vs 9:05pm AEST) purely to avoid both hammering Google's OAuth token
-- endpoint in the exact same instant for companies with many connected
-- users -- no real dependency between the two.
SELECT cron.unschedule('calendar-watch-renewal') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calendar-watch-renewal');
SELECT cron.schedule('calendar-watch-renewal', '5 21 * * *', $$
  SELECT net.http_post(
    url := 'https://txzzgtwrrokomiphairy.supabase.co/functions/v1/calendar-watch-renewal',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000)
$$);
