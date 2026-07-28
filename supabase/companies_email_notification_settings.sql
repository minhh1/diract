-- Per-company opt-in/out for which app events send a notification email
-- (task assigned, archive request approved/rejected, ...). Shape:
-- { [event_type]: boolean }. A missing key means "on" -- only an explicit
-- `false` turns an event off -- so existing companies need no backfill.
-- See lib/email/eventTypes.ts for the fixed list of event_type keys, and
-- lib/email/notify.ts for where this is read. Mirrors the jsonb-on-companies
-- convention used by disabled_system_tables/table_label_overrides for
-- small, static per-company settings, rather than a dedicated table.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_notification_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
