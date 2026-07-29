-- In-app notification feed. One row per (event, recipient) -- e.g. a task
-- assigned to 3 watchers would be 3 rows, one per recipient, so read state
-- is naturally per-person. Written exclusively through create_notification()
-- (see 20260729460000_create_notification_rpc.sql), never inserted directly
-- by app code, so every notification consistently gets its per-user/
-- per-company gating applied in one place.
--
-- entity_table/entity_id is an optional generic pointer at whatever record
-- the notification is about (same shape as archive_requests.entity_table/
-- entity_id) -- not a real FK (the target table varies per event_type), just
-- enough for a future "show related record" UI without re-parsing link_url.
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  entity_table text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- recipient_user_id first (not company_id) -- every real query here is
-- "this user's notifications", company_id is only ever a secondary filter.
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_unread_idx ON notifications(recipient_user_id) WHERE read_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Recipient-only, both directions -- this is personal, not company-shared
-- data (unlike email_log, which any company member can see). SELECT for the
-- feed/badge, UPDATE for marking read.
DROP POLICY IF EXISTS notifications_recipient_select ON notifications;
CREATE POLICY notifications_recipient_select ON notifications
  FOR SELECT USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS notifications_recipient_update ON notifications;
CREATE POLICY notifications_recipient_update ON notifications
  FOR UPDATE USING (recipient_user_id = auth.uid()) WITH CHECK (recipient_user_id = auth.uid());
