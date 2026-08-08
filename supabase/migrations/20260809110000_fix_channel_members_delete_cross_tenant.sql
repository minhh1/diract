SET request.jwt.claim.role = 'service_role';

-- channel_members_delete had the same bare is_current_user_admin() pattern
-- already fixed on channel_members_insert this pass: USING
-- ((user_id = auth.uid()) OR is_current_user_admin()) let ANY company
-- admin remove ANY user from ANY channel in ANY OTHER company -- including
-- another tenant's private channels and DMs. The self-leave branch
-- (user_id = auth.uid()) is unaffected and correct as-is. Scoped the admin
-- branch to the row's own channel's company, same pattern as the insert
-- fix.
DROP POLICY IF EXISTS channel_members_delete ON channel_members;
CREATE POLICY channel_members_delete ON channel_members
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR (is_current_user_admin() AND EXISTS (
      SELECT 1 FROM channels c WHERE c.id = channel_members.channel_id AND c.company_id = active_company_id()
    ))
  );
