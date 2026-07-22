-- Per-project opt-out for the AI assistant's Gmail source (see
-- app/api/ai/gmail-exclusions and components/admin/AdminAiAssistantTab.tsx).
-- Opt-out, not opt-in -- absence of a row means a project's emails are
-- included, matching the same default-enabled pattern as
-- ai_chat_settings.source_gmail (a missing settings row also means
-- "enabled"). Presence of a row means that project's emails are excluded
-- from embedding, and any already-embedded chunks for it are purged
-- immediately (see the exclusion route) rather than waiting for the next
-- embed-worker pass.

CREATE TABLE IF NOT EXISTS ai_gmail_excluded_projects (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, project_id)
);

ALTER TABLE ai_gmail_excluded_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_gmail_excluded_projects_company_members ON ai_gmail_excluded_projects;
CREATE POLICY ai_gmail_excluded_projects_company_members ON ai_gmail_excluded_projects
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
