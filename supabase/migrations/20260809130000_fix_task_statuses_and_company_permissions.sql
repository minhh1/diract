SET request.jwt.claim.role = 'service_role';

-- task_statuses: confirmed (lib/ai/actions.ts's own comment: "task_statuses
-- is a global lookup table (no company_id column) -- verified") this is an
-- intentional platform-wide shared reference table (3 rows: generic status
-- labels), not per-tenant data -- task_statuses_select's USING (true) is
-- correct as-is and left untouched. task_statuses_write
-- (is_current_user_admin(), bare, covers insert/update/delete) is a
-- different problem: it has ZERO legitimate client callers (grepped every
-- .from("task_statuses") call site -- SELECT only, nowhere writes to it),
-- yet as written ANY company admin, from ANY company, could rename/delete
-- a status label that every OTHER company's task board also depends on.
-- Dropped outright -- same "no legitimate caller" reasoning as
-- company_memberships' self-insert and companies_insert fixed earlier this
-- pass. If this table ever needs real editing, that belongs in a migration
-- or a service-role-only tool, not a client-writable RLS policy.
DROP POLICY IF EXISTS task_statuses_write ON task_statuses;

-- company_permissions (hooks/usePermission.ts's per-user permission
-- override lookup) has no company_id column at all -- it's keyed by
-- profile_id + action_slug only, currently 0 rows in production. Its
-- select policy (profile_id = auth.uid() OR is_current_user_admin()) let
-- any admin of ANY company read ANY user's permission overrides
-- platform-wide; its write policy (bare is_current_user_admin()) let any
-- admin of ANY company grant/deny permissions for ANY profile, including
-- users who aren't even members of the admin's own company. Since there's
-- no company_id column on the row itself to correlate against, the
-- correlation instead has to run through company_memberships: an admin may
-- only read/write permission rows for a profile who is actually a member
-- of the admin's own active company.
DROP POLICY IF EXISTS company_permissions_select ON company_permissions;
CREATE POLICY company_permissions_select ON company_permissions
  FOR SELECT
  USING (
    profile_id = auth.uid()
    OR (is_current_user_admin() AND EXISTS (
      SELECT 1 FROM company_memberships cm
      WHERE cm.user_id = company_permissions.profile_id AND cm.company_id = active_company_id()
    ))
  );

DROP POLICY IF EXISTS company_permissions_write ON company_permissions;
CREATE POLICY company_permissions_write ON company_permissions
  FOR ALL
  USING (is_current_user_admin() AND EXISTS (
    SELECT 1 FROM company_memberships cm
    WHERE cm.user_id = company_permissions.profile_id AND cm.company_id = active_company_id()
  ))
  WITH CHECK (is_current_user_admin() AND EXISTS (
    SELECT 1 FROM company_memberships cm
    WHERE cm.user_id = company_permissions.profile_id AND cm.company_id = active_company_id()
  ));
