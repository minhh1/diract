-- Conditional (rule-based) subgroups: a group can define a condition
-- ("this field equals this value") instead of matters being manually
-- dragged into it -- membership is then computed live from each matter's
-- field values rather than stored per-item. Only equals-style conditions
-- for now (the actual need: a Status-style select field driving which
-- subgroup a matter falls into), not a general rule engine.
ALTER TABLE client_update_groups ADD COLUMN IF NOT EXISTS condition_field_id uuid REFERENCES client_update_page_fields(id) ON DELETE SET NULL;
ALTER TABLE client_update_groups ADD COLUMN IF NOT EXISTS condition_value text;

-- Adhoc (page-only, report-only) fields can now be typed as a select with
-- fixed options -- needed so a condition's value can be chosen from the
-- same option list the field itself offers, and so editing that field
-- on a matter is a dropdown instead of free text.
ALTER TABLE client_update_page_fields ADD COLUMN IF NOT EXISTS field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'select'));
ALTER TABLE client_update_page_fields ADD COLUMN IF NOT EXISTS select_options jsonb;

-- Activity log -- one row per meaningful change (value edit, matter added/
-- removed, group created/renamed/deleted, column added/removed, PIN
-- changed), human-readable so it doesn't need per-field-type rendering
-- logic to display. actor_name is a plain snapshot (not a profile FK) so
-- the log stays readable even if the staff member's account is later
-- removed; source distinguishes a staff edit from a client's own action
-- (e.g. posting a note) for entries that originate from the public side.
CREATE TABLE IF NOT EXISTS client_update_page_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  actor_name text,
  source text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'client')),
  action text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_update_page_logs_page_id_idx ON client_update_page_logs(page_id, created_at DESC);

ALTER TABLE client_update_page_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_page_logs_company_members ON client_update_page_logs;
CREATE POLICY client_update_page_logs_company_members ON client_update_page_logs
  FOR ALL
  USING (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
