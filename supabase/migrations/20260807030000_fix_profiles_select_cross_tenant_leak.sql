SET request.jwt.claim.role = 'service_role';

-- profiles_select was `id = auth.uid() OR is_current_user_admin()` with no
-- scoping at all on which profile rows that second clause exposes --
-- profiles has no company_id column, so "is the caller a company admin
-- (of their own active company)" was being used as a bare yes/no gate on
-- reading EVERY profile row in the entire database, across every company
-- on the platform. Confirmed live: a freshly created, single-member trial
-- sandbox company's task-assignee/watcher picker (components/dashboard/
-- tabs/ChecklistTab.tsx, `supabase.from('profiles').select(...).eq
-- ('is_active', true)`, no company filter -- the client-side query relies
-- entirely on RLS to scope it) returned ~20 real users belonging to
-- unrelated companies, because the signed-in user happened to be a
-- company_admin of their (also unrelated) active company.
--
-- Re-scoped so admin visibility only extends to profiles that share the
-- caller's active company membership, via the same active_company_id()
-- STABLE SECURITY DEFINER helper (SELECT active_company_id FROM profiles
-- WHERE id = auth.uid()) already used for exactly this "current company,
-- not every company" narrowing elsewhere (see teams_select in
-- 20260801190000_teams_select_scope_to_active_company.sql, and ~20 other
-- tables' RLS per supabase/rls_fix.sql, supabase/archive_requests.sql).
-- Dropped the is_current_user_admin() requirement entirely -- seeing a
-- co-worker's name/email in an assignee or watcher picker isn't an
-- admin-only concern, it's a "are you both members of this company"
-- concern, same as every other company-scoped table. Platform-wide
-- profile access for genuine cross-company support tooling stays on
-- profiles.is_site_admin, gated server-side via lib/requireSiteAdmin.ts's
-- service-role API routes, which this policy has no effect on.
DROP POLICY IF EXISTS profiles_select ON profiles;
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM company_memberships cm
      WHERE cm.user_id = profiles.id
        AND cm.company_id = active_company_id()
    )
  );
