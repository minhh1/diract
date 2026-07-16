CREATE TABLE IF NOT EXISTS task_follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  followed_up_at date NOT NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_follow_ups_task_id_idx ON task_follow_ups(task_id, followed_up_at);

ALTER TABLE task_follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_follow_ups_company_members ON task_follow_ups;
CREATE POLICY task_follow_ups_company_members ON task_follow_ups
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
