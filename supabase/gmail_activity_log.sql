CREATE TABLE IF NOT EXISTS gmail_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL, -- 'new_email' | 'deletion' | 'email_added_to_label' | 'new_label' | 'remove_label'
  label_name text,
  label_code text,
  gmail_message_id text,
  email_subject text,
  email_snippet text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gmail_activity_log_company_idx ON gmail_activity_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS gmail_activity_log_project_idx ON gmail_activity_log(project_id, created_at DESC);

ALTER TABLE gmail_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_activity_log_company ON gmail_activity_log;
CREATE POLICY gmail_activity_log_company ON gmail_activity_log
  FOR ALL USING (company_id = active_company_id()) WITH CHECK (company_id = active_company_id());
