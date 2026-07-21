-- Message ledger for a company's connected Microsoft Teams tenant (see
-- company_teams_credentials.sql). Populated by the teams-sync-worker Edge
-- Function on a cron schedule (see teams_sync_cron.sql) -- unlike
-- WhatsApp, Graph delta queries are polled rather than pushed to a webhook.
--
-- Feeds the RAG assistant (see ai_embeddings.sql, source_type = 'teams').
-- Exactly one of teams_channel_id / teams_chat_id is set: channel messages
-- come from a team's channel, chat messages from a 1:1 or group chat.

CREATE TABLE IF NOT EXISTS teams_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  teams_channel_id text,
  teams_chat_id text,
  from_name text,
  body text,
  teams_message_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(teams_channel_id, teams_chat_id) = 1)
);

CREATE INDEX IF NOT EXISTS teams_messages_company_id_idx ON teams_messages(company_id);

ALTER TABLE teams_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teams_messages_company_members ON teams_messages;
CREATE POLICY teams_messages_company_members ON teams_messages
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
