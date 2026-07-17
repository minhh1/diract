CREATE TABLE IF NOT EXISTS task_watchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, profile_id)
);

CREATE INDEX IF NOT EXISTS task_watchers_task_id_idx ON task_watchers(task_id);
CREATE INDEX IF NOT EXISTS task_watchers_profile_id_idx ON task_watchers(profile_id);

ALTER TABLE task_watchers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_watchers_company_members ON task_watchers;
CREATE POLICY task_watchers_company_members ON task_watchers
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
