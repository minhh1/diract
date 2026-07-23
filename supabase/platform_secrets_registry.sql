-- Cross-company credential/secret expiry tracking for the Platform Health
-- tab's "Secrets" sub-tab. Two kinds of rows show up there:
--   1. Manually-tracked platform-level secrets (this table) -- things like
--      the AWS platform IAM key or the Stripe API key, which have no
--      programmatic "expires_at" the app can query, so a site admin
--      records a rotation cadence by hand.
--   2. Auto-derived facts computed live at read time from existing tables
--      (Google OAuth token staleness from user_gmail_tokens, Azure/Teams
--      secret expiry from company_teams_credentials/company_teams_bot_credentials
--      below) -- not stored here at all.

CREATE TABLE IF NOT EXISTS platform_secrets_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  label text NOT NULL,
  expires_at timestamptz,
  rotation_interval_days integer,
  last_rotated_at timestamptz,
  notes text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_secrets_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_secrets_registry_site_admin ON platform_secrets_registry
  FOR ALL USING (is_site_admin()) WITH CHECK (is_site_admin());

-- Azure AD app-registration secrets (company_teams_credentials.credentials
-- ->> 'client_secret', company_teams_bot_credentials.credentials ->>
-- 'bot_app_password') always have a real expiry chosen at creation time in
-- the Azure portal, but this app never captured it. Adding it here as its
-- own column (not inside the jsonb credentials blob) so it can be selected
-- and rolled up across companies without ever touching the `credentials`
-- column itself (same rule as everywhere else these tables are queried).
ALTER TABLE company_teams_credentials ADD COLUMN IF NOT EXISTS secret_expires_at timestamptz;
ALTER TABLE company_teams_bot_credentials ADD COLUMN IF NOT EXISTS secret_expires_at timestamptz;

-- Seed rows for the platform secrets with real rotation risk but no
-- API-visible expiry. rotation_interval_days is a reasonable default cadence,
-- editable later from the Secrets sub-tab. Guarded by service name (not a
-- unique constraint -- this file may be re-run) so re-applying doesn't
-- duplicate rows.
INSERT INTO platform_secrets_registry (service, label, rotation_interval_days, notes)
SELECT v.service, v.label, v.rotation_interval_days, v.notes
FROM (VALUES
  ('stripe', 'Stripe secret key', 365, 'Rotate via Stripe Dashboard -> Developers -> API keys.'),
  ('digitalocean', 'DigitalOcean platform API token', 365, 'DIGITALOCEAN_PLATFORM_API_TOKEN -- regenerate in DO -> API -> Tokens.'),
  ('together', 'Together AI API key', 365, 'TOGETHER_API_KEY -- regenerate at api.together.ai/settings/api-keys.'),
  ('guacamole', 'Guacamole JSON auth secret key', 365, 'GUACAMOLE_JSON_SECRET_KEY -- shared secret with the Guacamole gateway deploys.')
) AS v(service, label, rotation_interval_days, notes)
WHERE NOT EXISTS (SELECT 1 FROM platform_secrets_registry existing WHERE existing.service = v.service);
