-- Xero (Accounting API) OAuth connections. Unlike company_teams_credentials/
-- company_onedrive_credentials (BYO Azure AD app per company), Xero apps are
-- registered once by the platform (XERO_CLIENT_ID/XERO_CLIENT_SECRET env
-- vars, see lib/config.ts) -- same shape as the Gmail/Outlook integrations,
-- since Xero's standard Authorization Code flow lets any number of
-- customers connect their own organisation(s) to one shared app, no
-- per-company app registration needed.
--
-- One authorization can grant access to multiple Xero organisations at
-- once (the user picks which ones during consent) -- Xero's Connections API
-- (GET https://api.xero.com/connections) returns one entry per organisation
-- authorized, hence one row here per (company_id, tenant_id) rather than
-- one row per company.
--
-- access_token/refresh_token must NEVER be selected into a response that
-- reaches the browser -- API routes should only select the non-secret
-- columns (mirrors company_onedrive_credentials.sql's rule for
-- `credentials`). Xero rotates the refresh_token on every refresh (unlike
-- Google's stable refresh token), so lib/xero/client.ts must persist the
-- new refresh_token every time it refreshes an access_token.
CREATE TABLE IF NOT EXISTS company_xero_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  tenant_name text,
  -- Xero's own connection id (distinct from tenant_id) -- required by
  -- DELETE https://api.xero.com/connections/{id} to revoke a connection.
  xero_connection_ref_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  connected_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tenant_id)
);

ALTER TABLE company_xero_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_xero_connections_company_members ON company_xero_connections;
CREATE POLICY company_xero_connections_company_members ON company_xero_connections
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Links an entity to the specific Xero organisation that holds its books --
-- distinct from the free-text 'xero_bank_feed' custom field (bank-feed
-- setup status), which this does not replace. ON DELETE SET NULL rather
-- than CASCADE: disconnecting/removing a Xero connection shouldn't delete
-- the entity, just unlink it.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS xero_connection_id uuid REFERENCES company_xero_connections(id) ON DELETE SET NULL;
