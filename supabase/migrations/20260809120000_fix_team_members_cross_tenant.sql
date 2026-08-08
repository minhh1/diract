SET request.jwt.claim.role = 'service_role';

-- team_members had no company_id of its own (only team_id -> teams.company_id),
-- and its two policies were:
--   team_members_select: USING (true) -- literally public. Confirmed live
--     with an anon-key-only curl (no user JWT at all): the full table
--     (team_id/profile_id pairs across every company) came back --
--     org-structure data for every tenant on the platform, unauthenticated.
--   team_members_write (covers insert/update/delete): bare
--     is_current_user_admin() -- same pattern fixed repeatedly this pass --
--     any admin of ANY company could move/remove any employee to/from any
--     team in any OTHER company.
-- lib/services/joinCompanyWithToken.ts's own team_members write goes
-- through a service-role client (bypasses RLS entirely, confirmed by that
-- file's own header comment already read this pass), so scoping this
-- doesn't affect that legitimate invite-flow write.
DROP POLICY IF EXISTS team_members_select ON team_members;
CREATE POLICY team_members_select ON team_members
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.company_id = active_company_id()
  ));

DROP POLICY IF EXISTS team_members_write ON team_members;
CREATE POLICY team_members_write ON team_members
  FOR ALL
  USING (is_current_user_admin() AND EXISTS (
    SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.company_id = active_company_id()
  ))
  WITH CHECK (is_current_user_admin() AND EXISTS (
    SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.company_id = active_company_id()
  ));
