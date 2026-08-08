SET request.jwt.claim.role = 'service_role';

-- CRITICAL: profiles_update had a USING clause (id = auth.uid()) but NO
-- WITH CHECK clause. Per Postgres RLS semantics, an UPDATE policy with no
-- WITH CHECK falls back to reusing its USING clause for validation too --
-- so the effective policy was "any authenticated user may set ANY column
-- on their own profile row to ANY value," full stop.
--
-- Two concrete exploits this allowed, both confirmed live (queried the
-- actual RLS policy + tested the reasoning against real data, not just
-- read the SQL):
--
--   1. active_company_id() -- the single shared helper ~40+ tables' RLS
--      policies key off via `company_id = active_company_id()` (see
--      20260808200100_kiosk_rls_lockdown.sql's own comment for the exact
--      count) -- just does `SELECT active_company_id FROM profiles WHERE
--      id = auth.uid()`, no independent membership check. Any user could
--      call `supabase.from('profiles').update({ active_company_id: X })`
--      directly with an arbitrary company id (components/Sidebar.tsx's
--      handleSwitchCompany only restricts this in the UI -- the dropdown
--      -- never at the database layer), instantly gaining full RLS-scoped
--      read/write access to that company's ENTIRE workspace: matters,
--      invoices, trust accounts, entities, messaging, everything.
--
--   2. profiles.is_admin / is_site_admin / role could be self-escalated
--      the same way -- no client code anywhere in the app ever legitimately
--      writes these columns directly (admin promotion goes through
--      company_memberships.role instead, a separate table with its own
--      RLS -- confirmed by grepping every `.update(...)` call site), so
--      locking them to their current stored value breaks nothing real.
--
-- register_company_and_profile (and every other SECURITY DEFINER function
-- that touches profiles) is owned by `postgres`, which has BYPASSRLS --
-- confirmed live via pg_roles -- so this policy change has zero effect on
-- those trusted paths; it only constrains ordinary client-issued queries.
--
-- Cleanup first: 2 existing rows had an active_company_id with no matching
-- company_memberships row (stale, likely from a removed/never-fully-joined
-- membership) -- found live. Left as-is, the new WITH CHECK below would
-- block those two accounts from updating ANY field on their own profile
-- (a WITH CHECK re-validates the whole proposed row on every update, not
-- just the changed columns) the moment they next try to save their name,
-- notification prefs, anything. NULL is the same safe "no active company"
-- state a brand new profile has before ever selecting one -- not a
-- privilege change, active_company_id() returning NULL denies every
-- company-scoped policy by design.
UPDATE profiles p
SET active_company_id = NULL
WHERE active_company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM company_memberships cm
    WHERE cm.user_id = p.id AND cm.company_id = p.active_company_id
  );

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
    -- Self-referencing subqueries against the same row being updated see
    -- the pre-statement (OLD) value under Postgres's normal MVCC
    -- read-committed snapshot semantics within one statement -- the same
    -- well-established pattern used elsewhere for "this column must not
    -- change via a plain client update."
    AND is_admin = (SELECT p2.is_admin FROM profiles p2 WHERE p2.id = auth.uid())
    AND is_site_admin = (SELECT p2.is_site_admin FROM profiles p2 WHERE p2.id = auth.uid())
    AND role IS NOT DISTINCT FROM (SELECT p2.role FROM profiles p2 WHERE p2.id = auth.uid())
  );
