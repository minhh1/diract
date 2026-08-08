-- Lets a company point the calendar at any date-type field on any of its
-- own tables (custom tables via company_table_fields, or a custom field on
-- a system table via company_custom_fields) -- generalizes the original
-- "remind me when a task is due" ask into "remind me when any date field on
-- any table is due", per the user's own framing during planning.
--
-- Mirrors company_custom_fields' table_id/table_name duality (see that
-- table's own migration) for the same reason: company_tables rows are
-- addressed by table_id (uuid), but the three system tables (projects,
-- tasks, entities) don't have a company_tables row at all -- table_name
-- (a literal 'projects'/'tasks'/'entities') is the only way to address
-- them.
--
-- A handful of dates that matter most (tasks.due_date being the obvious
-- one) live as native hardcoded columns on a system table, not as a
-- company_custom_fields row -- there's no field_id to point at for those.
-- native_field_key covers that case directly (the literal column name,
-- read straight off the system table instead of company_custom_field_values).
-- Exactly one of field_id/native_field_key is set per row.
SET request.jwt.claim.role = 'service_role';

CREATE TABLE IF NOT EXISTS calendar_date_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  table_id uuid REFERENCES company_tables(id) ON DELETE CASCADE,
  table_name text,
  field_id uuid,
  native_field_key text,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  -- A relation-type field on the same record naming who to remind (e.g. an
  -- Assigned To field) -- same field_id/table_id addressing as above, just
  -- pointed at a different field on the same record. NULL falls back to
  -- notifying company admins (notify_company_admins(), already used by
  -- every other event in lib/notifications/eventTypes.ts that has no
  -- obvious single recipient).
  notify_field_id uuid,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_date_sources_one_table_ref CHECK (
    (table_id IS NOT NULL AND table_name IS NULL) OR (table_id IS NULL AND table_name IS NOT NULL)
  ),
  CONSTRAINT calendar_date_sources_one_field_ref CHECK (
    (field_id IS NOT NULL AND native_field_key IS NULL) OR (field_id IS NULL AND native_field_key IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS calendar_date_sources_company_idx ON calendar_date_sources (company_id);

ALTER TABLE calendar_date_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS calendar_date_sources_select ON calendar_date_sources;
CREATE POLICY calendar_date_sources_select ON calendar_date_sources FOR SELECT
  USING (company_id = active_company_id());

DROP POLICY IF EXISTS calendar_date_sources_select_kiosk ON calendar_date_sources;
CREATE POLICY calendar_date_sources_select_kiosk ON calendar_date_sources FOR SELECT
  USING (is_kiosk_account() AND company_id = kiosk_company_id());

DROP POLICY IF EXISTS calendar_date_sources_admin_write ON calendar_date_sources;
CREATE POLICY calendar_date_sources_admin_write ON calendar_date_sources FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'));
