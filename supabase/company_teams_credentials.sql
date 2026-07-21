-- Microsoft Teams (Graph API) credentials, entered by each company's own
-- admin -- same BYO shape as company_cloud_credentials.sql. Company-wide
-- app-only access (client-credentials OAuth grant): one Azure AD app
-- registration per company, with org admin consent granted once for
-- ChannelMessage.Read.All / Chat.Read.All / Team.ReadBasic.All application
-- permissions. No per-user connect flow, unlike Gmail.
--
-- credentials is a jsonb blob:
--   { "tenant_id": "...", "client_id": "...", "client_secret": "..." }
--
-- last_synced_at / last_sync_error are non-secret status columns so the
-- admin UI can show sync health without ever selecting `credentials`.
--
-- API routes must NEVER select the `credentials` column into a response that
-- reaches the browser.

CREATE TABLE IF NOT EXISTS company_teams_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  credentials jsonb NOT NULL,
  admin_consent_granted boolean NOT NULL DEFAULT false,
  last_synced_at timestamptz,
  last_sync_error text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_teams_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_teams_credentials_company_members ON company_teams_credentials;
CREATE POLICY company_teams_credentials_company_members ON company_teams_credentials
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
