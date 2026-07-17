-- Simplified back to: events go on the assignee's own calendar only, no
-- shared company-wide calendar, no attendee/ACL-based access control.
ALTER TABLE companies DROP COLUMN IF EXISTS tasks_calendar_id;
ALTER TABLE user_gmail_tokens ADD COLUMN IF NOT EXISTS tasks_calendar_id text;
