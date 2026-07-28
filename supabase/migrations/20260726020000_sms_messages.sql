-- Outbound SMS ledger. Unlike whatsapp_messages, there is no per-company
-- BYO credentials table -- SMS sends through a single platform-owned
-- Twilio account (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER
-- env vars, see lib/sms/sendMessage.ts), shared across every company, same
-- funding model as DIGITALOCEAN_PLATFORM_API_TOKEN/TOGETHER_API_KEY.
-- Outbound-only for now (manual send from a lead/client's entity record,
-- see components/dashboard/SendSmsCard.tsx) -- no `direction` column
-- because there's no inbound webhook yet.

CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES entities(id) ON DELETE SET NULL,
  to_number text NOT NULL,
  body text NOT NULL,
  twilio_sid text UNIQUE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error text,
  sent_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sms_messages_company_id_idx ON sms_messages(company_id);
CREATE INDEX IF NOT EXISTS sms_messages_entity_id_idx ON sms_messages(entity_id);

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_messages_company_members ON sms_messages;
CREATE POLICY sms_messages_company_members ON sms_messages
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
