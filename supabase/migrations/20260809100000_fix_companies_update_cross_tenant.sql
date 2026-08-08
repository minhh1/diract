SET request.jwt.claim.role = 'service_role';

-- companies_update: USING (is_member_of(id) AND is_current_user_admin()),
-- no WITH CHECK (falls back to reusing USING for validation too, same
-- Postgres RLS behavior already hit for profiles_update this pass).
-- is_member_of(id) is correctly scoped to the TARGET row's company id, but
-- is_current_user_admin() checks admin status of the caller's ACTIVE
-- company -- not necessarily the same company as `id`. A user who is a
-- genuine (but low-privilege, non-admin) member of Company B, while also
-- being a company_admin of a completely different Company A (their active
-- company), satisfied both AND-ed conditions and could update Company B's
-- name/ABN/invoice_settings/logo/etc despite having no admin rights in B at
-- all. Narrower than the profiles/company_memberships/registration_tokens
-- bugs fixed earlier this pass (still requires genuine membership in the
-- target company, not a total stranger), but the same underlying pattern:
-- a correctly-scoped-in-isolation helper combined without correlating to
-- the SAME company on both sides of the AND.
DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_update ON companies
  FOR UPDATE
  USING (id = active_company_id() AND is_current_user_admin())
  WITH CHECK (id = active_company_id() AND is_current_user_admin());

-- companies_insert: WITH CHECK (true) -- wide open, but grepped every
-- client call site (web + mobile): nothing ever does
-- supabase.from('companies').insert(...) directly. Company creation only
-- happens through register_company_and_profile, a SECURITY DEFINER
-- function owned by postgres (confirmed BYPASSRLS live earlier this pass),
-- which never touches this policy at all. No legitimate caller -- dropped
-- outright, same reasoning as company_memberships' self-insert branch.
DROP POLICY IF EXISTS companies_insert ON companies;
