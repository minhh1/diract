SET request.jwt.claim.role = 'service_role';

-- A task can be tagged with any number of teams (many-to-many) --
-- distinct from tasks.assigned_team_id (a single primary team, used
-- elsewhere for permission-scoped task visibility) since the Finance
-- Model's Gantt/Timeline view needs multi-discipline tagging (e.g. a
-- settlement task can genuinely belong to both Legal and Finance).
-- Mirrors supabase/task_watchers.sql exactly, swapping profile_id for
-- team_id.
CREATE TABLE IF NOT EXISTS task_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, team_id)
);

CREATE INDEX IF NOT EXISTS task_teams_task_id_idx ON task_teams(task_id);
CREATE INDEX IF NOT EXISTS task_teams_team_id_idx ON task_teams(team_id);

ALTER TABLE task_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_teams_company_members ON task_teams;
CREATE POLICY task_teams_company_members ON task_teams
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
