-- WhatsApp Business Platform (Meta Cloud API) credentials, entered by each
-- company's own admin -- same BYO shape as company_cloud_credentials.sql.
-- One row per company: a company connects a single WhatsApp Business phone
-- number, unlike the multi-provider/multi-label shape cloud credentials use.
--
-- credentials is a jsonb blob:
--   { "access_token": "...", "phone_number_id": "...",
--     "business_account_id": "...", "webhook_verify_token": "..." }
--
-- access_token is a Meta System User token (long-lived, not a per-user
-- OAuth token -- there is no per-user consent flow for the Business
-- Platform). webhook_verify_token is a value the admin makes up and pastes
-- into the Meta App dashboard's webhook config; app/api/whatsapp/webhook
-- checks incoming `hub.verify_token` against it.
--
-- API routes must NEVER select the `credentials` column into a response that
-- reaches the browser -- list/status endpoints select only id/company_id/
-- phone_number_id/created_at (phone_number_id is not secret, it's Meta's
-- public identifier for the number).

CREATE TABLE IF NOT EXISTS company_whatsapp_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  credentials jsonb NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_whatsapp_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_whatsapp_credentials_company_members ON company_whatsapp_credentials;
CREATE POLICY company_whatsapp_credentials_company_members ON company_whatsapp_credentials
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
