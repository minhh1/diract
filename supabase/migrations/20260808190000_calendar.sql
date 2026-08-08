-- Phase 1 of the calendar feature: a fixed nav-linked /dashboard/calendar
-- page (month/week/day views) with staff rostering (draft/final shifts,
-- copy-last-week, a staff x day-of-week grid). Event booking, invitations,
-- reminders, and Google Calendar sync are a deferred phase 2 -- not built
-- here, see this feature's plan doc for that scope.
--
-- calendar_settings mirrors time_tracking_settings' shape -- a company-level
-- admin opt-in gate, off by default, plain boolean columns (only two
-- sub-toggles today, so no need for the jsonb-map shape
-- disabled_system_tables uses for a longer list of independently-toggled
-- areas).
CREATE TABLE IF NOT EXISTS calendar_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  rostering_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_settings_company_members ON calendar_settings;
CREATE POLICY calendar_settings_company_members ON calendar_settings
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- roster_shifts: status lives per shift, not on a separate "roster" parent
-- table -- "publish this week" is a single bulk UPDATE ... WHERE shift_date
-- BETWEEN ... AND status='draft', and "show me this month's confirmed
-- shifts" needs no join. Shape of `status` copied from company_pages'
-- draft/published precedent (supabase/migrations/20260808080000_company_pages.sql).
-- staff_entity_id references the existing Staff `entities` row every
-- company member already gets via ensureStaffEntity() -- no new staff table.
CREATE TABLE IF NOT EXISTS roster_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  staff_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  role_note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'final')),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roster_shifts_company_date_idx ON roster_shifts (company_id, shift_date);
CREATE INDEX IF NOT EXISTS roster_shifts_staff_idx ON roster_shifts (staff_entity_id);

ALTER TABLE roster_shifts ENABLE ROW LEVEL SECURITY;

-- Any company member sees published (final) shifts -- draft/unconfirmed
-- shifts are never shown to a non-admin, matching ordinary rostering UX
-- (nothing is "your schedule" until it's published). Enforced here, not
-- just hidden client-side.
DROP POLICY IF EXISTS roster_shifts_select_final ON roster_shifts;
CREATE POLICY roster_shifts_select_final ON roster_shifts
  FOR SELECT
  USING (company_id = active_company_id() AND status = 'final');

-- A company admin can see/manage everything regardless of status --
-- separate policy (not folded into the one above) since Postgres RLS ORs
-- together every permissive policy that applies to a statement, so a
-- non-admin still only ever matches the final-only policy.
DROP POLICY IF EXISTS roster_shifts_admin_all ON roster_shifts;
CREATE POLICY roster_shifts_admin_all ON roster_shifts
  FOR ALL
  USING (company_id = active_company_id() AND is_current_user_admin())
  WITH CHECK (company_id = active_company_id() AND is_current_user_admin());
