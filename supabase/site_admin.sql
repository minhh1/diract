-- Site-wide admin role, distinct from per-company company_admin
-- (company_memberships.role). Grants access to the cross-company
-- "Platform Health" admin tab (background jobs, secrets, costs,
-- analytics, live heartbeat) -- things that need visibility across all
-- companies rather than being scoped to active_company_id(). Previously
-- the only precedent was a single hardcoded email constant
-- (PERF_TAB_ALLOWED_EMAIL) gating the perf-debugging tab; this replaces
-- that with a real, extensible role.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_site_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION is_site_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_site_admin FROM profiles WHERE id = auth.uid()), false);
$$;

UPDATE profiles SET is_site_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'minh@huynhco.com');
