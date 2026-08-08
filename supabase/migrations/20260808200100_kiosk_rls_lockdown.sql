-- The core kiosk security boundary. Rather than editing the ~40 existing
-- RLS policy files that each do `USING (company_id = active_company_id())`,
-- this changes the one shared helper they all call: for a kiosk-role
-- session, active_company_id() now returns NULL, which makes every one of
-- those existing policies evaluate to `company_id = NULL` -- always false.
-- A kiosk session is denied by every existing policy in one change,
-- genuine default-deny rather than a per-table opt-out that's easy to
-- forget on the next new table. Non-kiosk callers get byte-for-byte the
-- same behavior as before (the ELSE branch is the original function body).
--
-- is_kiosk_account()/kiosk_company_id() are the explicit-allow counterpart,
-- used by new additive policies (in a later migration) on exactly the
-- handful of tables a kiosk device actually needs -- calendar_settings,
-- roster_shifts, entities (Staff only), staff_checkins. Existing policies
-- on those tables are untouched; the new kiosk policies are simply ORed in
-- alongside them, same as how Postgres already combines multiple
-- permissive policies for one command.
SET request.jwt.claim.role = 'service_role';

CREATE OR REPLACE FUNCTION active_company_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM company_memberships cm
      JOIN profiles p ON p.id = auth.uid()
      WHERE cm.user_id = auth.uid()
        AND cm.company_id = p.active_company_id
        AND cm.role = 'kiosk'
    ) THEN NULL
    ELSE (SELECT active_company_id FROM profiles WHERE id = auth.uid())
  END
$$;

CREATE OR REPLACE FUNCTION is_kiosk_account() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_memberships cm
    JOIN profiles p ON p.id = auth.uid()
    WHERE cm.user_id = auth.uid()
      AND cm.company_id = p.active_company_id
      AND cm.role = 'kiosk'
  )
$$;

-- The kiosk's own company_id, resolved independently of active_company_id()
-- (which is now permanently NULL for a kiosk session) -- new kiosk-only
-- policies key off this instead.
CREATE OR REPLACE FUNCTION kiosk_company_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cm.company_id FROM company_memberships cm
  JOIN profiles p ON p.id = auth.uid()
  WHERE cm.user_id = auth.uid()
    AND cm.company_id = p.active_company_id
    AND cm.role = 'kiosk'
  LIMIT 1
$$;
