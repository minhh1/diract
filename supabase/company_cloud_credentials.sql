-- Cloud provider credentials used to auto-provision virtual computers (see
-- virtual_computers.sql). Each company brings its own cloud account(s) --
-- credentials are entered by that company's admin via the admin UI, never a
-- shared platform-wide account.
--
-- credentials is a jsonb blob whose shape depends on provider:
--   digitalocean -> { "api_token": "..." }
--   aws          -> { "access_key_id": "...", "secret_access_key": "...", "region": "..." }
--   gcp          -> { "service_account_json": "...", "project_id": "..." }
--
-- API routes must NEVER select the `credentials` column into a response that
-- reaches the browser -- list endpoints select only id/provider/label/created_at.

CREATE TABLE IF NOT EXISTS company_cloud_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('digitalocean', 'aws', 'gcp')),
  label text NOT NULL,
  credentials jsonb NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider, label)
);

ALTER TABLE company_cloud_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_cloud_credentials_company_members ON company_cloud_credentials;
CREATE POLICY company_cloud_credentials_company_members ON company_cloud_credentials
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
