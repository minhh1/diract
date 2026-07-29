SET request.jwt.claim.role = 'service_role';

-- Demonstrates the custom-table auto_fed source support added in
-- 20260729270000 against a real (if new) table -- Niksen didn't have a
-- second custom table to test against yet, so this adds a small, genuinely
-- useful one: Contacts (referrers/other parties who aren't Entities under
-- administration -- brokers, accountants, etc, mirroring the 'Lawyer'/
-- 'Accountant'/'Mortgage Broker' entity_type options already used for
-- people who get named but not fully onboarded as an Entity record).
-- Same "Incomplete Name" completeness check already proven on entities
-- (20260729180000), reused here to prove the custom-table engine path
-- works, not just the system-table one.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_irregularities_table_id uuid;
  v_contacts_table_id uuid;
  v_registry_id uuid;
BEGIN
  SELECT id INTO v_irregularities_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;

  SELECT id INTO v_contacts_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'contacts' AND deleted_at IS NULL;
  IF v_contacts_table_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Contacts', 'contacts', 'Contact', '#0ea5e9', 'name')
    RETURNING id INTO v_contacts_table_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, show_in_table, display_order)
  SELECT v_company_id, v_contacts_table_id, v.field_key, v.label, v.field_type, true, v.ord
  FROM (VALUES ('name', 'Name', 'text', 0), ('email', 'Email', 'email', 1), ('phone', 'Phone', 'text', 2))
    AS v(field_key, label, field_type, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_contacts_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- A relation field so a Contacts-sourced row has somewhere to link to,
  -- alongside Entity/Property (see auto_fed_upsert_item's linked_table_id
  -- disambiguation in 20260729270000).
  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_table_id, linked_display_field, display_order)
  SELECT v_company_id, v_irregularities_table_id, 'contact', 'Contact', 'table_relation', v_contacts_table_id, 'name', 8
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields WHERE table_id = v_irregularities_table_id AND field_key = 'contact' AND deleted_at IS NULL);

  INSERT INTO auto_fed_registries (company_id, target_table_id, source_table_name, editable_field_keys)
  SELECT v_company_id, v_irregularities_table_id, v_contacts_table_id::text, ARRAY['status']
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id AND source_table_name = v_contacts_table_id::text)
  RETURNING id INTO v_registry_id;

  IF v_registry_id IS NULL THEN
    SELECT id INTO v_registry_id FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id AND source_table_name = v_contacts_table_id::text;
  END IF;

  INSERT INTO auto_fed_rules (registry_id, rule_key, label, classification, detail, target_field_key, condition_sql, display_order)
  SELECT v_registry_id, 'incomplete_name', 'Incomplete Name', 'Moderate', 'Name looks truncated or is missing a surname', 'name',
    $sql$(r->>'name') IS NULL OR btrim(r->>'name') = '' OR (r->>'name') ~ '\.\.\.|…' OR NOT ((r->>'name') ~ '\S\s+\S')$sql$,
    0
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_rules WHERE registry_id = v_registry_id AND rule_key = 'incomplete_name');
END $$;
