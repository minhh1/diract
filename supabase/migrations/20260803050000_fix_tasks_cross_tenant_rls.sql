-- Fixes a cross-tenant leak on tasks: the permissive "tasks_company_members"
-- policy scoped visibility to "any company the caller is a member of" (via
-- company_memberships), not their currently ACTIVE company -- unlike every
-- other system table (properties/entities/projects), which all correctly use
-- company_id = active_company_id(). A user who belongs to more than one
-- company (e.g. a company admin of two firms) saw the UNION of both
-- companies' tasks regardless of which one was active, because the
-- restrictive tasks_view_scope policy's task_visible_to_current_user()
-- returns true for any task the caller is an admin of/assigned to/on the
-- team of -- with no company check of its own, since it always relied on
-- this policy to have already scoped to the active company. This one
-- policy also governs insert/update/delete (polcmd = '*'), so the same gap
-- allowed writes to another company's tasks, not just reads.
ALTER POLICY tasks_company_members ON tasks
  USING (company_id = active_company_id())
  WITH CHECK (company_id = active_company_id());
