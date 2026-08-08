SET request.jwt.claim.role = 'service_role';

-- CRITICAL: company_memberships -- the single table that defines who
-- belongs to which company, with what role -- had FOUR policies using
-- is_current_user_admin() (or a bare user_id = auth.uid()) with NO
-- correlation to the actual row's own company_id at all. is_current_user_admin()
-- itself is correctly scoped ("admin of MY active company") in isolation,
-- but every one of these policies used it as a bare condition, so it
-- effectively meant "any admin of ANY company" for that row, regardless of
-- which company the row belonged to.
--
-- Confirmed live with a real user JWT, not just read from the SQL: an
-- ordinary authenticated user (not even needing to be an admin anywhere)
-- self-inserted a company_admin membership row into a company they had
-- ZERO prior relationship with, via one plain client call:
--   supabase.from('company_memberships').insert({ user_id, company_id: <any>, role: 'company_admin' })
-- Combined with 20260808/09040000's active_company_id() fix now requiring
-- a real membership to switch into a company, this row alone would have
-- been enough to grant full company_admin access to ANY company on the
-- platform -- the single most severe finding of this pass, worse than
-- either of the two already fixed today.
--
-- The self-insert branch (memberships_insert's `user_id = auth.uid()`,
-- and the redundant memberships_self_insert policy) has NO legitimate
-- caller at all -- grepped every client-side write to this table.
-- lib/services/joinCompanyWithToken.ts (the only real "join a company"
-- path outside of company creation) explicitly runs on a service-role
-- client specifically BECAUSE the invitee can't satisfy admin-gated
-- policies yet (see that file's own header comment) -- it bypasses RLS
-- entirely, never relies on this branch. register_company_and_profile
-- (company creation) is the same BYPASSRLS SECURITY DEFINER path already
-- confirmed for the profiles fix. Dropped outright rather than narrowed --
-- there's nothing left for it to legitimately do.
--
-- The two remaining legitimate client-side writers (app/(app)/dashboard/
-- admin/page.tsx's handleSetRole / handleAssignCustomRole, both UPDATEs)
-- already scope themselves client-side to `company_id = company!.id`
-- (their own active company) -- the new WITH CHECK/USING below just makes
-- the database actually enforce what those call sites already assumed.
DROP POLICY IF EXISTS memberships_insert ON company_memberships;
DROP POLICY IF EXISTS memberships_self_insert ON company_memberships;
CREATE POLICY memberships_insert ON company_memberships
  FOR INSERT
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

-- memberships_own (user_id = auth.uid()) already correctly covers "see my
-- own memberships" -- memberships_select was a second, more permissive
-- policy stacked on top (Postgres ORs multiple permissive policies
-- together for the same command), and its bare is_current_user_admin()
-- meant any admin of any company could read every company's full
-- membership list. Narrowed to match every other policy here.
DROP POLICY IF EXISTS memberships_select ON company_memberships;
CREATE POLICY memberships_select ON company_memberships
  FOR SELECT
  USING (user_id = auth.uid() OR (company_id = active_company_id() AND is_current_user_admin()));

DROP POLICY IF EXISTS memberships_update ON company_memberships;
CREATE POLICY memberships_update ON company_memberships
  FOR UPDATE
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

DROP POLICY IF EXISTS memberships_delete ON company_memberships;
CREATE POLICY memberships_delete ON company_memberships
  FOR DELETE
  USING (company_id = active_company_id() AND is_current_user_admin());
