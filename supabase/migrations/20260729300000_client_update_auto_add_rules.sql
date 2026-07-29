SET request.jwt.claim.role = 'service_role';

-- Lets staff define a rule on a Client Update Page ("field on the base
-- table equals/contains/etc a value") that auto-adds a NEW matching record
-- as a page item going forward -- evaluated once, at the moment a matching
-- company_custom_field_values row is first INSERTed (i.e. when a brand new
-- record is created with that field already set), never retroactively on
-- UPDATE. Editing the field on an existing record later goes through
-- lib/entityCustomFieldWrite.ts's upsert (onConflict: field_id,record_id),
-- which fires an UPDATE, not an INSERT -- so this trigger only ever reacts
-- to genuinely new field values, matching the "new matters only" ask.
--
-- Deliberately its own small mechanism rather than a registry in
-- auto_fed_registries/auto_fed_rules (20260729150000) -- that engine's
-- target shape is a fixed issue_type/classification/detail/status
-- convention for auto-populated violation boards (e.g. Irregularities),
-- writing into company_table_records. This is simpler: just "add this
-- already-existing record as a normal item on an existing user_dependent
-- page", straight into client_update_page_items.
CREATE TABLE IF NOT EXISTS client_update_auto_add_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES client_update_pages(id) ON DELETE CASCADE,
  -- Always a company_custom_fields.id -- native/base columns aren't
  -- supported (they change via a plain UPDATE on the base table itself,
  -- not company_custom_field_values, so this trigger would never see them).
  field_id uuid NOT NULL REFERENCES company_custom_fields(id) ON DELETE CASCADE,
  operator text NOT NULL CHECK (operator IN ('equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'is_empty', 'is_not_empty')),
  value text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, field_id, operator, value)
);

CREATE INDEX IF NOT EXISTS client_update_auto_add_rules_field_id_idx ON client_update_auto_add_rules(field_id);

ALTER TABLE client_update_auto_add_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS client_update_auto_add_rules_rw ON client_update_auto_add_rules;
CREATE POLICY client_update_auto_add_rules_rw ON client_update_auto_add_rules FOR ALL
  USING (page_id IN (SELECT id FROM client_update_pages WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())))
  WITH CHECK (page_id IN (SELECT id FROM client_update_pages WHERE company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())));

-- Fires once per new custom-field value; matches it against any active
-- rule watching that exact field_id (which already pins the table, via
-- company_custom_fields.table_name), and -- on match -- adds the record as
-- a page item, same (page_id, record_table, record_id) shape
-- app/api/client-update-pages/[id]/items/route.ts's manual "Add matter"
-- flow inserts, deduped by the same client_update_page_items_page_record_uidx
-- unique index it relies on.
CREATE OR REPLACE FUNCTION client_update_auto_add_dispatch() RETURNS trigger AS $$
DECLARE
  v_rule client_update_auto_add_rules;
  v_val text := lower(trim(coalesce(NEW.value_text, '')));
  v_rule_val text;
  v_matches boolean;
BEGIN
  FOR v_rule IN
    SELECT r.* FROM client_update_auto_add_rules r
    JOIN client_update_pages p ON p.id = r.page_id
    WHERE r.field_id = NEW.field_id AND r.is_active AND p.is_active
  LOOP
    v_rule_val := lower(trim(coalesce(v_rule.value, '')));
    v_matches := CASE v_rule.operator
      WHEN 'equals'       THEN v_val = v_rule_val
      WHEN 'not_equals'   THEN v_val <> v_rule_val
      -- position()/left() instead of LIKE -- a rule value with a literal
      -- '_' (common in emails, e.g. "toan_doan@...") would otherwise be
      -- silently treated as a single-char LIKE wildcard.
      WHEN 'contains'     THEN v_rule_val <> '' AND position(v_rule_val IN v_val) > 0
      WHEN 'not_contains' THEN v_rule_val = '' OR position(v_rule_val IN v_val) = 0
      WHEN 'starts_with'  THEN v_rule_val <> '' AND left(v_val, length(v_rule_val)) = v_rule_val
      WHEN 'is_empty'     THEN v_val = ''
      WHEN 'is_not_empty' THEN v_val <> ''
      ELSE false
    END;

    IF v_matches THEN
      INSERT INTO client_update_page_items (page_id, record_table, record_id, display_order)
      VALUES (v_rule.page_id, NEW.table_name, NEW.record_id,
        (SELECT COALESCE(MAX(display_order), 0) + 1 FROM client_update_page_items WHERE page_id = v_rule.page_id))
      ON CONFLICT (page_id, record_table, record_id) DO NOTHING;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_client_update_auto_add ON company_custom_field_values;
CREATE TRIGGER trg_client_update_auto_add
AFTER INSERT ON company_custom_field_values
FOR EACH ROW EXECUTE FUNCTION client_update_auto_add_dispatch();

-- Niksen — Matter Update page (Huynh Lawyers, slug 'niksen'): auto-add a
-- matter whose "Primary Introducer Email" is toan.doan@niksen.com.au.
INSERT INTO client_update_auto_add_rules (page_id, field_id, operator, value)
VALUES ('b3c3bc16-e0f2-4950-8d2f-f01347d69211', 'bec20154-999f-4cbd-a439-d08c2c0afa26', 'equals', 'toan.doan@niksen.com.au')
ON CONFLICT (page_id, field_id, operator, value) DO NOTHING;
