-- Message ledger for a company's connected WhatsApp Business number (see
-- company_whatsapp_credentials.sql). Populated by app/api/whatsapp/webhook,
-- which Meta calls directly -- there is no polling sync worker for
-- WhatsApp, unlike Gmail/Teams.
--
-- Feeds the RAG assistant (see ai_embeddings.sql, source_type = 'whatsapp').

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  wa_phone_number_id text NOT NULL,
  contact_wa_id text NOT NULL,
  contact_name text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type text NOT NULL DEFAULT 'text',
  body text,
  wa_message_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_messages_company_id_idx ON whatsapp_messages(company_id);
CREATE INDEX IF NOT EXISTS whatsapp_messages_contact_wa_id_idx ON whatsapp_messages(contact_wa_id);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_messages_company_members ON whatsapp_messages;
CREATE POLICY whatsapp_messages_company_members ON whatsapp_messages
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
