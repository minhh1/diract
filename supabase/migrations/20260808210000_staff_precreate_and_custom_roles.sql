-- Two additive features, both in service of the rostering feature
-- (roster_shifts/staff_checkins, keyed off entities rows with entity_type=
-- 'Staff' -- see supabase/migrations/20260808190000_calendar.sql):
--
-- 1. Pre-created staff profiles: an admin can now capture a staff member's
--    name/email/phone at invite time (before that person ever logs in) so
--    it exists for SMS/email rostering immediately. Stored as an ordinary
--    entities row (entity_type='Staff', linked_profile_id NULL) -- exactly
--    how roster_shifts/staff_checkins already expect an unclaimed staff
--    member to look. registration_tokens.staff_entity_id links the invite
--    to that pre-created row so real signup can claim it by id instead of
--    guessing via an email match.
--
-- 2. Company-defined custom roles: company_memberships.role stays the
--    existing Postgres enum ('operator'/'company_admin'/'kiosk') --
--    replacing that binary (checked in ~150 RLS policies and ~95 API
--    routes via is_current_user_admin()/isAdmin) is out of scope and
--    unnecessary. This is a separate, ADDITIVE layer: a company can define
--    its own named roles with a set of permission slugs (e.g. "Supervisor"
--    with roster.edit), assigned per-membership via the new nullable
--    custom_role_id. Mirrors the existing resource_permissions pattern
--    (supabase/migrations/20260801400000_resource_permissions.sql) -- a
--    junction table + a security definer lookup function, OR'd into
--    specific RLS policies alongside the existing admin override, never
--    replacing it.

-- ── 1. Pre-created staff ────────────────────────────────────────────────

ALTER TABLE registration_tokens ADD COLUMN IF NOT EXISTS staff_entity_id uuid REFERENCES entities(id) ON DELETE SET NULL;

-- ── 2. Custom roles ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Slugs from lib/permissions/customRoleSlugs.ts (e.g. 'roster.edit',
  -- 'roster.publish') -- a plain text[] rather than a join table since the
  -- registry is small and a company's own role rarely has more than a
  -- handful of permissions; checked via `= ANY(permissions)` below.
  permissions text[] NOT NULL DEFAULT '{}',
  display_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

ALTER TABLE company_custom_roles ENABLE ROW LEVEL SECURITY;

-- Any company member can read (needed to show role names in the member
-- picker); only an admin of their own active company can write -- same
-- USING/WITH CHECK shape as roster_shifts_admin_all.
CREATE POLICY company_custom_roles_read ON company_custom_roles
  FOR SELECT USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

CREATE POLICY company_custom_roles_write ON company_custom_roles
  FOR ALL
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());

ALTER TABLE company_memberships ADD COLUMN IF NOT EXISTS custom_role_id uuid REFERENCES company_custom_roles(id) ON DELETE SET NULL;

-- Same shape as resource_permissions' user_resource_role() -- deliberately
-- does NOT fold in is_current_user_admin() itself, callers OR the two
-- together, so admin's blanket access stays visibly separate from this
-- layer. No p_company_id param, matching is_current_user_admin()/
-- active_company_id()'s own no-arg convention -- callers pair this with
-- `company_id = active_company_id()` in the same policy, exactly like
-- every existing admin-override policy already does.
CREATE OR REPLACE FUNCTION user_has_custom_permission(p_slug text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM company_memberships cm
    JOIN company_custom_roles cr ON cr.id = cm.custom_role_id
    WHERE cm.company_id = active_company_id() AND cm.user_id = auth.uid() AND p_slug = ANY(cr.permissions)
  );
$$;

-- Additive alongside roster_shifts_admin_all -- a member with the roster.edit
-- or roster.publish custom permission gets table-level write eligibility;
-- the specific edit-vs-publish distinction is enforced at the application
-- layer (the 4 roster API routes), same layering this codebase already
-- uses elsewhere (RLS is the coarse backstop, routes hold the fine-grained
-- check).
CREATE POLICY roster_shifts_custom_role_write ON roster_shifts
  FOR ALL
  USING (company_id = active_company_id() AND (user_has_custom_permission('roster.edit') OR user_has_custom_permission('roster.publish')))
  WITH CHECK (company_id = active_company_id() AND (user_has_custom_permission('roster.edit') OR user_has_custom_permission('roster.publish')));
