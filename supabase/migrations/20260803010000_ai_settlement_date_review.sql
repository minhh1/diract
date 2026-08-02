-- AI settlement-date review (Huynh Lawyers' Niksen matter update page):
-- staff can trigger, or a new email being logged automatically triggers, an
-- AI pass over a matter's email correspondence to detect whether both
-- parties have agreed to change the settlement date -- see
-- lib/clientUpdatePageSettlementReview.ts. Two schema changes needed:
--
-- 1. client_update_page_logs.source only ever allowed 'staff'/'client' --
-- widened to 'ai' so an AI-made change is clearly distinguishable in the
-- activity log from a human edit, rather than being misattributed to
-- whichever staff member happened to trigger the review (or to nobody, for
-- the automatic path).
ALTER TABLE client_update_page_logs DROP CONSTRAINT IF EXISTS client_update_page_logs_source_check;
ALTER TABLE client_update_page_logs ADD CONSTRAINT client_update_page_logs_source_check CHECK (source IN ('staff', 'client', 'ai'));

-- 2. Marks a project_property_values cell as "AI just set this, not yet
-- reviewed by a person" -- the UI renders it differently (underlined,
-- distinct colour) until a staff member confirms it or edits the field
-- again directly (either of which clears the row -- see values/route.ts's
-- project_property write branch and the confirm route). Keyed by
-- (item_id, project_property_id, field_key) rather than
-- client_update_page_fields.id: the Settlement Date column happens to be
-- configured more than once on the Niksen page (a pre-existing duplicate-
-- column quirk, not something this migration fixes), and every one of
-- those duplicate columns points at the exact same underlying cell, so
-- they should all show the same flag rather than needing one row each.
CREATE TABLE IF NOT EXISTS client_update_page_ai_field_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES client_update_page_items(id) ON DELETE CASCADE,
  project_property_id uuid NOT NULL REFERENCES project_properties(id) ON DELETE CASCADE,
  field_key uuid NOT NULL, -- company_custom_fields.id (project_property_values.field_id)
  previous_value text,
  applied_value text,
  reasoning text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, project_property_id, field_key)
);

CREATE INDEX IF NOT EXISTS client_update_page_ai_field_flags_page_id_idx ON client_update_page_ai_field_flags(page_id);

ALTER TABLE client_update_page_ai_field_flags ENABLE ROW LEVEL SECURITY;

-- Same shape as client_update_page_logs' own policy -- every real read/
-- write to this table already goes through a service-role API route, this
-- is just the same defence-in-depth those routes' sibling tables all have.
DROP POLICY IF EXISTS client_update_page_ai_field_flags_company_members ON client_update_page_ai_field_flags;
CREATE POLICY client_update_page_ai_field_flags_company_members ON client_update_page_ai_field_flags
  FOR ALL
  USING (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (page_id IN (
    SELECT id FROM client_update_pages
    WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ));
