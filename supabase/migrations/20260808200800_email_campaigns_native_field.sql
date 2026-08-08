-- entities.email is a native column (not a company_custom_fields row) --
-- confirmed live, and the obvious default recipient source for a campaign
-- (contacts/leads/clients live in Entities). Without this, only a custom
-- email field an admin had separately added would be selectable, missing
-- the most common case entirely. Mirrors calendar_date_sources'
-- field_id/native_field_key duality (20260808200500_calendar_date_sources.sql)
-- for the same reason.
SET request.jwt.claim.role = 'service_role';

ALTER TABLE email_campaigns ALTER COLUMN email_field_id DROP NOT NULL;
ALTER TABLE email_campaigns ADD COLUMN IF NOT EXISTS native_field_key text;

ALTER TABLE email_campaigns DROP CONSTRAINT IF EXISTS email_campaigns_one_field_ref;
ALTER TABLE email_campaigns ADD CONSTRAINT email_campaigns_one_field_ref CHECK (
  (email_field_id IS NOT NULL AND native_field_key IS NULL) OR (email_field_id IS NULL AND native_field_key IS NOT NULL)
);
