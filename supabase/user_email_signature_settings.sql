-- Per-user personal fields for the company email signature (see
-- company_email_signature_settings.sql for the shared branding this
-- personalises). One row per user; display_name falls back to
-- profiles.full_name and photo is entirely optional -- a user only needs a
-- row here at all once they've customised something or opted out.
CREATE TABLE IF NOT EXISTS user_email_signature_settings (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  display_name text,
  job_title text,
  direct_phone text,
  mobile_phone text,
  photo_url text,
  -- Lets a user opt out of the firm's signature standard entirely (e.g.
  -- their own personal Gmail alias used for something unrelated to the
  -- firm) without deleting their row's other fields.
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_email_signature_settings_company_id_idx
  ON user_email_signature_settings(company_id);

ALTER TABLE user_email_signature_settings ENABLE ROW LEVEL SECURITY;

-- A user manages their own row; any company member can READ every user's
-- signature settings within their own company (needed so an admin's
-- branding preview, and the Outlook add-in's identity lookup, can resolve
-- someone else's personal fields) -- but only the row's own user can write.
DROP POLICY IF EXISTS user_email_signature_settings_read ON user_email_signature_settings;
CREATE POLICY user_email_signature_settings_read ON user_email_signature_settings
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS user_email_signature_settings_write_own ON user_email_signature_settings;
CREATE POLICY user_email_signature_settings_write_own ON user_email_signature_settings
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
