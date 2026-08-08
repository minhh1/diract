-- Staff check-in/check-out, tied to the existing roster (roster_shifts,
-- staff_entity_id -- see 20260808190000_calendar.sql). Not tied to a
-- login: a staff member doesn't sign in to check in, the shared kiosk
-- device does the recording (checked_in_by is the KIOSK's own profile
-- id, not the staff member's -- staff have no login for this at all).
SET request.jwt.claim.role = 'service_role';

CREATE TABLE IF NOT EXISTS staff_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  roster_shift_id uuid REFERENCES roster_shifts(id) ON DELETE SET NULL,
  staff_entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  checked_in_at timestamptz NOT NULL DEFAULT now(),
  checked_out_at timestamptz,
  checked_in_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_checkins_company_date_idx
  ON staff_checkins (company_id, checked_in_at);
CREATE INDEX IF NOT EXISTS staff_checkins_staff_entity_idx
  ON staff_checkins (staff_entity_id);

ALTER TABLE staff_checkins ENABLE ROW LEVEL SECURITY;

-- Normal (non-kiosk) company members can see their own company's
-- check-in history same as any other company-scoped table -- e.g. an
-- admin reviewing attendance later. Mutation stays kiosk-only (below);
-- a regular member has no reason to hand-edit a check-in record.
DROP POLICY IF EXISTS staff_checkins_select ON staff_checkins;
CREATE POLICY staff_checkins_select ON staff_checkins FOR SELECT
  USING (company_id = active_company_id());
