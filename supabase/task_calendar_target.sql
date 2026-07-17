-- Superseded: task events now live on one shared per-company calendar
-- instead of a per-account one, so these per-user columns are no longer used.
ALTER TABLE user_gmail_tokens DROP COLUMN IF EXISTS tasks_calendar_id;
ALTER TABLE user_gmail_tokens DROP COLUMN IF EXISTS use_main_calendar;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS tasks_calendar_id text;
