-- Conditional formatting: "when this column equals this value, highlight
-- the row/card in this colour" -- staff-managed from MatterBoard's left
-- sidebar (a "Formatting" section, alongside Group/Status/Filters/Sort).
-- Same equals-only condition shape as subgroup conditions and the ad-hoc
-- Filters section, for consistency. field_id is ON DELETE CASCADE (unlike
-- client_update_groups.condition_field_id, which is SET NULL) -- a
-- formatting rule has no independent meaning once its field is gone, so
-- fully removing it is correct, not a silent-breakage risk like the
-- group-condition case.
CREATE TABLE IF NOT EXISTS client_update_page_format_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES client_update_page_fields(id) ON DELETE CASCADE,
  value text NOT NULL,
  color text NOT NULL CHECK (color IN ('red', 'amber', 'green', 'blue', 'purple', 'slate')),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS client_update_page_format_rules_page_id_idx ON client_update_page_format_rules(page_id, display_order);

ALTER TABLE client_update_page_format_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_update_page_format_rules_company_members ON client_update_page_format_rules;
CREATE POLICY client_update_page_format_rules_company_members ON client_update_page_format_rules
  FOR ALL
  USING (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
