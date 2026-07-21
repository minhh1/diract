-- High-water mark per company/source so ai-embed-worker only embeds rows
-- created since its last pass, instead of re-walking every source table on
-- every run (mirrors teams_sync_cursors.sql's role for Teams delta sync).

CREATE TABLE IF NOT EXISTS ai_embed_cursors (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN ('crm_record', 'gmail', 'whatsapp', 'teams')),
  last_embedded_at timestamptz NOT NULL DEFAULT '1970-01-01',
  PRIMARY KEY (company_id, source_type)
);

ALTER TABLE ai_embed_cursors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_embed_cursors_company_members ON ai_embed_cursors;
CREATE POLICY ai_embed_cursors_company_members ON ai_embed_cursors
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
