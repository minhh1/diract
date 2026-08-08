-- Explicit-allow counterpart to the active_company_id() lockdown
-- (20260808200100_kiosk_rls_lockdown.sql): additive policies granting a
-- kiosk session read access to exactly what its shell needs (calendar
-- settings + roster, to render the schedule; Staff-typed entities, to
-- resolve roster names) and read/write on its own check-ins. Every
-- existing policy on these tables is untouched -- Postgres ORs multiple
-- permissive policies for the same command together, so this only adds
-- capability for a kiosk session, never removes anything for anyone else.
SET request.jwt.claim.role = 'service_role';

DROP POLICY IF EXISTS calendar_settings_select_kiosk ON calendar_settings;
CREATE POLICY calendar_settings_select_kiosk ON calendar_settings FOR SELECT
  USING (is_kiosk_account() AND company_id = kiosk_company_id());

DROP POLICY IF EXISTS roster_shifts_select_kiosk ON roster_shifts;
CREATE POLICY roster_shifts_select_kiosk ON roster_shifts FOR SELECT
  USING (is_kiosk_account() AND company_id = kiosk_company_id());

-- Staff only -- a kiosk resolving roster names has no reason to see
-- Person/Company entities (clients, property owners, etc.).
DROP POLICY IF EXISTS entities_select_kiosk ON entities;
CREATE POLICY entities_select_kiosk ON entities FOR SELECT
  USING (is_kiosk_account() AND company_id = kiosk_company_id() AND entity_type = 'Staff');

DROP POLICY IF EXISTS staff_checkins_kiosk_select ON staff_checkins;
CREATE POLICY staff_checkins_kiosk_select ON staff_checkins FOR SELECT
  USING (is_kiosk_account() AND company_id = kiosk_company_id());

DROP POLICY IF EXISTS staff_checkins_kiosk_insert ON staff_checkins;
CREATE POLICY staff_checkins_kiosk_insert ON staff_checkins FOR INSERT
  WITH CHECK (is_kiosk_account() AND company_id = kiosk_company_id() AND checked_in_by = auth.uid());

-- Update is for the check-out step (setting checked_out_at on a row this
-- same kiosk created) -- scoped to rows it itself checked in, not any
-- check-in another kiosk device at a different location might have made.
DROP POLICY IF EXISTS staff_checkins_kiosk_update ON staff_checkins;
CREATE POLICY staff_checkins_kiosk_update ON staff_checkins FOR UPDATE
  USING (is_kiosk_account() AND company_id = kiosk_company_id() AND checked_in_by = auth.uid())
  WITH CHECK (is_kiosk_account() AND company_id = kiosk_company_id() AND checked_in_by = auth.uid());
