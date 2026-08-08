SET request.jwt.claim.role = 'service_role';

-- 20260809040000's own WITH CHECK caused "infinite recursion detected in
-- policy for relation profiles" -- confirmed live testing the exploit
-- block with a real user JWT (not service role), which is exactly the
-- scenario that should have exercised it. The is_admin/is_site_admin/role
-- immutability checks each ran a bare subquery against profiles itself
-- (`SELECT p2.is_admin FROM profiles p2 WHERE p2.id = auth.uid()`), which
-- is subject to profiles' OWN RLS policies (profiles_select) -- Postgres
-- re-evaluates the table's policies for that nested SELECT, which for an
-- UPDATE statement's WITH CHECK apparently loops back into evaluating
-- profiles_update's own WITH CHECK again rather than resolving cleanly.
--
-- Same fix active_company_id() itself already uses successfully for this
-- exact "read profiles without re-triggering profiles' own RLS" need: a
-- STABLE SECURITY DEFINER function. Its internal query runs as the
-- function owner (postgres, confirmed BYPASSRLS live), sidestepping the
-- recursive policy evaluation entirely.
CREATE OR REPLACE FUNCTION current_profile_privileged_snapshot()
RETURNS TABLE(is_admin boolean, is_site_admin boolean, role company_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.is_admin, p.is_site_admin, p.role FROM profiles p WHERE p.id = auth.uid();
$$;

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND (
      active_company_id IS NULL
      OR EXISTS (
        SELECT 1 FROM company_memberships cm
        WHERE cm.user_id = auth.uid() AND cm.company_id = active_company_id
      )
    )
    AND is_admin = (SELECT s.is_admin FROM current_profile_privileged_snapshot() s)
    AND is_site_admin = (SELECT s.is_site_admin FROM current_profile_privileged_snapshot() s)
    AND role IS NOT DISTINCT FROM (SELECT s.role FROM current_profile_privileged_snapshot() s)
  );
