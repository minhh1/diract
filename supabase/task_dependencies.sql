-- A task can depend on any number of other tasks (AND semantics -- every
-- depends_on_task_id must be completed before task_id is considered
-- unblocked, same model Asana uses: no OR/NOT conditions, just a set of
-- prerequisites that must ALL be done). Self-referencing tasks table, so
-- ON DELETE CASCADE on either side cleans up automatically when a task is
-- hard-deleted; a soft-deleted task (tasks.deleted_at) is NOT automatically
-- removed from here -- see isBlocked()'s callers, which already filter
-- dependencies down to non-deleted prerequisite tasks before checking.
CREATE TABLE IF NOT EXISTS task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id != depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS task_dependencies_task_id_idx ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS task_dependencies_depends_on_idx ON task_dependencies(depends_on_task_id);

ALTER TABLE task_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_dependencies_company_members ON task_dependencies;
CREATE POLICY task_dependencies_company_members ON task_dependencies
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
