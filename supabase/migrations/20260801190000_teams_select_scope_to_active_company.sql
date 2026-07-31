SET request.jwt.claim.role = 'service_role';

-- teams_select scoped to "any company the user is a member of" instead of
-- "their currently active company" -- a real cross-tenant leak for any
-- user who belongs to more than one company: every SELECT against teams
-- (e.g. the Finance Model Timeline tab's team filter/Kanban columns,
-- components/dashboard/tabs/ChecklistTab.tsx's assignee/team pickers)
-- returned every one of their companies' team names mixed together,
-- unless the calling code happened to also filter by company_id itself --
-- confirmed live this session (components/public/financeModel/
-- TimelineSubtab.tsx, before its own client-side .eq('company_id', ...)
-- fix). RLS is the authoritative boundary here, not a client-side filter
-- that's easy to forget (as ChecklistTab.tsx's own teams query already
-- had). Re-scoped using active_company_id() -- the same STABLE SECURITY
-- DEFINER helper (SELECT active_company_id FROM profiles WHERE id =
-- auth.uid()) already used by ~20 other tables' RLS policies for exactly
-- this "current company, not every company" narrowing (see
-- supabase/rls_fix.sql, supabase/archive_requests.sql,
-- supabase/invoice_line_items.sql, etc.) -- not a new pattern.
--
-- teams_write is untouched: it already requires company_admin membership
-- of the SPECIFIC target company_id on every row (a real per-row
-- authorization check, not a "what's currently active" display-scoping
-- concern), so it was never the leak.
DROP POLICY IF EXISTS teams_select ON teams;
CREATE POLICY teams_select ON teams FOR SELECT
  USING (company_id = active_company_id());
