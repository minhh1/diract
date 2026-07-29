SET request.jwt.claim.role = 'service_role';

-- Per-(project, property) transaction fields: a matter that covers more than
-- one property (project_properties junction, see
-- 20260727035000_project_properties_multi.sql) previously had exactly one
-- purchase_price / one set of deposit and settlement dates for the WHOLE
-- matter, shared across every linked property -- wrong for two reasons:
-- (1) a genuinely different price/date per property in the same matter had
-- nowhere to go, and (2) storing these on `properties` itself instead would
-- have them wrongly persist onto that property forever, even once resold in
-- a later, unrelated matter with different terms.
--
-- New table mirrors company_custom_field_values' shape exactly, just keyed
-- by project_properties.id (the pairing) instead of a single record id.
-- company_custom_fields itself gets a new table_name value,
-- 'project_properties', reusing the existing field-definition catalog --
-- purchase_price becomes just another field this way (field_type
-- 'currency'), not a special native column, so the mechanism stays uniform
-- and any company can define its own per-property fields the same way.

-- project_properties.id has no unique constraint of its own -- its actual
-- primary key is the composite (project_id, property_id) -- so it can't be
-- referenced by a foreign key as-is. Purely additive; doesn't touch the
-- existing PK.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'project_properties'::regclass AND conname = 'project_properties_id_key') THEN
    ALTER TABLE project_properties ADD CONSTRAINT project_properties_id_key UNIQUE (id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS project_property_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_property_id uuid NOT NULL REFERENCES project_properties(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES company_custom_fields(id) ON DELETE CASCADE,
  value_text text,
  value_number numeric,
  value_date date,
  value_boolean boolean,
  value_record_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_property_id, field_id)
);

CREATE INDEX IF NOT EXISTS project_property_values_pp_idx ON project_property_values(project_property_id);
CREATE INDEX IF NOT EXISTS project_property_values_field_idx ON project_property_values(field_id);

ALTER TABLE project_property_values ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_property_values_company_members ON project_property_values;
CREATE POLICY project_property_values_company_members ON project_property_values
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- client_update_page_fields.field_source's CHECK enum needs the new value
-- before any row can actually use it.
ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_source_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_source_check
  CHECK (field_source = ANY (ARRAY['base'::text, 'custom'::text, 'adhoc'::text, 'related_entity'::text, 'property'::text, 'project_property'::text]));

DO $$
DECLARE
  v_company_id uuid := 'a49b484d-100d-4c3e-b3b6-69c1a18cc783'; -- Huynh Lawyers
  v_page_id uuid := 'b3c3bc16-e0f2-4950-8d2f-f01347d69211'; -- "Niksen — Matter Update" (Huynh Lawyers' projects Detailed Table Page, name predates this session)
  v_max_order int;
  v_pp record;
  v_f record;
BEGIN
  SELECT COALESCE(MAX(display_order), 0) INTO v_max_order FROM company_custom_fields WHERE table_name = 'projects' AND company_id = v_company_id AND deleted_at IS NULL;

  -- 1. New field definitions, reusing the OLD field_key verbatim (makes the
  -- old->new mapping below a plain field_key join, no id lookup table
  -- needed) -- purchase_price included as a new field here since it was
  -- previously a native projects column, not a company_custom_fields row.
  INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, display_order)
  SELECT v_company_id, 'project_properties', v.field_key, v.label, v.field_type, v_max_order + v.ord
  FROM (VALUES
    ('purchase_price', 'Purchase Price', 'currency', 1),
    ('initial_deposit', 'Initial Deposit', 'currency', 2),
    ('initial_deposit_payment_date', 'Initial Deposit Payment Date', 'date', 3),
    ('balance_deposit', 'Balance of Deposit', 'currency', 4),
    ('balance_deposit_payment_date', 'Balance of Deposit Payment Date', 'date', 5),
    ('total_deposit_paid', 'Total Deposit Paid', 'currency', 6),
    ('due_diligence_date', 'Due Diligence Date', 'date', 7),
    ('finance_date', 'Finance Date', 'date', 8),
    ('building_inspection_date', 'Building Inspection Date', 'date', 9),
    ('cooling_off_expiry_date', 'Cooling Off Expiry Date', 'date', 10)
  ) AS v(field_key, label, field_type, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM company_custom_fields x WHERE x.company_id = v_company_id AND x.table_name = 'project_properties' AND x.field_key = v.field_key AND x.deleted_at IS NULL
  );

  -- 2. Migrate existing values -- only for a project with EXACTLY ONE linked
  -- property (unambiguous: one property to attach the old single value to).
  -- The 2 multi-property projects are deliberately left blank here -- their
  -- old value stays only in the (about to be soft-deleted) old field, not
  -- copied onto either property, since there's no way to know which one it
  -- was really for.
  FOR v_pp IN
    SELECT pp.id AS project_property_id, pp.project_id
    FROM project_properties pp
    WHERE pp.company_id = v_company_id
      AND (SELECT count(*) FROM project_properties pp2 WHERE pp2.project_id = pp.project_id) = 1
  LOOP
    -- purchase_price: native projects column -> new custom field value.
    INSERT INTO project_property_values (company_id, project_property_id, field_id, value_number)
    SELECT v_company_id, v_pp.project_property_id, f.id, p.purchase_price
    FROM projects p, company_custom_fields f
    WHERE p.id = v_pp.project_id AND p.purchase_price IS NOT NULL
      AND f.company_id = v_company_id AND f.table_name = 'project_properties' AND f.field_key = 'purchase_price' AND f.deleted_at IS NULL
    ON CONFLICT (project_property_id, field_id) DO NOTHING;

    -- The 9 old custom fields (table_name='projects') -> matching new ones
    -- (table_name='project_properties'), joined by the shared field_key.
    FOR v_f IN
      SELECT old_f.field_type, old_f.id AS old_field_id, new_f.id AS new_field_id
      FROM company_custom_fields old_f
      JOIN company_custom_fields new_f ON new_f.company_id = old_f.company_id AND new_f.table_name = 'project_properties' AND new_f.field_key = old_f.field_key AND new_f.deleted_at IS NULL
      WHERE old_f.company_id = v_company_id AND old_f.table_name = 'projects' AND old_f.deleted_at IS NULL
        AND old_f.field_key IN ('initial_deposit', 'initial_deposit_payment_date', 'balance_deposit', 'balance_deposit_payment_date', 'total_deposit_paid', 'due_diligence_date', 'finance_date', 'building_inspection_date', 'cooling_off_expiry_date')
    LOOP
      INSERT INTO project_property_values (company_id, project_property_id, field_id, value_text, value_number, value_date, value_boolean, value_record_id)
      SELECT v_company_id, v_pp.project_property_id, v_f.new_field_id, ccv.value_text, ccv.value_number, ccv.value_date, ccv.value_boolean, ccv.value_record_id
      FROM company_custom_field_values ccv
      WHERE ccv.field_id = v_f.old_field_id AND ccv.record_id = v_pp.project_id
      ON CONFLICT (project_property_id, field_id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- 3. Repoint the existing Detailed Table Page's own columns for these 10
  -- fields (every group's own copy -- client_update_page_fields has one row
  -- per group that's customized its column set, see .../fields/route.ts's
  -- header comment) from their old field_source/field_key to the new
  -- 'project_property' source + new field id. Leaves the one already
  -- correctly pointed at field_source='property', field_key='base:purchase_price'
  -- untouched -- that's properties.purchase_price (a property's OWN default
  -- price before it's linked to any matter), a genuinely different, older
  -- mechanism this doesn't touch.
  UPDATE client_update_page_fields cupf
  SET field_source = 'project_property', field_key = new_f.id::text
  FROM company_custom_fields new_f
  WHERE cupf.page_id = v_page_id
    AND cupf.field_source = 'base' AND cupf.field_key = 'purchase_price'
    AND new_f.company_id = v_company_id AND new_f.table_name = 'project_properties' AND new_f.field_key = 'purchase_price' AND new_f.deleted_at IS NULL;

  UPDATE client_update_page_fields cupf
  SET field_source = 'project_property', field_key = new_f.id::text
  FROM company_custom_fields old_f
  JOIN company_custom_fields new_f ON new_f.company_id = old_f.company_id AND new_f.table_name = 'project_properties' AND new_f.field_key = old_f.field_key AND new_f.deleted_at IS NULL
  WHERE cupf.page_id = v_page_id
    AND cupf.field_source = 'custom' AND cupf.field_key = old_f.id::text
    AND old_f.company_id = v_company_id AND old_f.table_name = 'projects' AND old_f.deleted_at IS NULL
    AND old_f.field_key IN ('initial_deposit', 'initial_deposit_payment_date', 'balance_deposit', 'balance_deposit_payment_date', 'total_deposit_paid', 'due_diligence_date', 'finance_date', 'building_inspection_date', 'cooling_off_expiry_date');

  -- 4. Soft-delete the old project-level field definitions -- values stay
  -- untouched (both these and the native projects.purchase_price column are
  -- left exactly as they are, satisfying "keep the old data"), just no
  -- longer offerable as a project-level column going forward.
  UPDATE company_custom_fields
  SET deleted_at = now()
  WHERE company_id = v_company_id AND table_name = 'projects' AND deleted_at IS NULL
    AND field_key IN ('initial_deposit', 'initial_deposit_payment_date', 'balance_deposit', 'balance_deposit_payment_date', 'total_deposit_paid', 'due_diligence_date', 'finance_date', 'building_inspection_date', 'cooling_off_expiry_date');
END $$;
