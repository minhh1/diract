SET request.jwt.claim.role = 'service_role';

-- Rolls the Irregularities data-quality board out to every company --
-- previously Niksen Time Pty Ltd only, hand-seeded with a hardcoded
-- company_id and hardcoded company_custom_fields.id references baked into
-- condition_sql. Clones Niksen's entities (6 rules) and properties (1 rule)
-- registries; the 3rd Niksen registry (a custom "Contact" table -- see
-- 20260729270000_auto_fed_custom_table_source.sql) is Niksen-specific (no
-- other company has an equivalent custom table) and is deliberately not
-- rolled out. The engine itself (auto_fed_registries/auto_fed_rules,
-- 20260729150000 + the delete-handling update in 20260729330000) needs no
-- changes -- it was already fully generic; only the seed data was missing.

-- 'tfn' already exists as a per-company custom field for every company
-- (20260729310000_entities_finance_fields_to_custom.sql) -- only
-- 'gst_report_frequency' needs creating here, same all-companies
-- CROSS JOIN shape as that migration used for 'tfn' itself.
INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, select_options, display_order)
SELECT c.id, 'entities', 'gst_report_frequency', 'GST Report Frequency', 'select', '["Monthly","Quarterly","Annually"]'::jsonb, 0
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM company_custom_fields
  WHERE company_id = c.id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL
);

DO $migration$
DECLARE
  v_company record;
  v_table_id uuid;
  v_tfn_field_id uuid;
  v_gst_field_id uuid;
  v_entity_registry_id uuid;
  v_property_registry_id uuid;
  v_page_id uuid;
  v_slug text;
  v_pin text;
  v_rec record;
BEGIN
  FOR v_company IN
    SELECT c.id, c.name FROM companies c
    WHERE NOT EXISTS (
      SELECT 1 FROM company_tables WHERE company_id = c.id AND name = 'Irregularities' AND deleted_at IS NULL
    )
  LOOP
    SELECT id INTO v_tfn_field_id FROM company_custom_fields WHERE company_id = v_company.id AND table_name = 'entities' AND field_key = 'tfn' AND deleted_at IS NULL LIMIT 1;
    SELECT id INTO v_gst_field_id FROM company_custom_fields WHERE company_id = v_company.id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL LIMIT 1;
    IF v_tfn_field_id IS NULL OR v_gst_field_id IS NULL THEN
      RAISE NOTICE 'Skipping company % (%) -- missing tfn/GST Report Frequency field', v_company.name, v_company.id;
      CONTINUE;
    END IF;

    -- Slug is looked up globally (public/[slug]/page.tsx has no company
    -- scope in the URL), so de-duplicate against a repeat run or another
    -- company with a similar name, not just within this company.
    v_slug := lower(regexp_replace(trim(v_company.name), '[^a-zA-Z0-9]+', '-', 'g')) || '-irregularities';
    WHILE EXISTS (SELECT 1 FROM client_update_pages WHERE slug = v_slug) LOOP
      v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
    END LOOP;
    v_pin := lpad(floor(random() * 1000000)::text, 6, '0');

    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company.id, 'Irregularities', 'irregularities', 'AlertTriangle', '#ef4444', 'detail')
    RETURNING id INTO v_table_id;

    INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, select_options, show_in_table, display_order) VALUES
      (v_company.id, v_table_id, 'source_table', 'Table', 'text', null, null, true, 0),
      (v_company.id, v_table_id, 'entity', 'Entity', 'entity', 'entities', null, true, 1),
      (v_company.id, v_table_id, 'issue_type', 'Issue Type', 'select', null, '["Missing Street Address","Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency","Invalid TFN","Incomplete Name","Duplicate Name"]'::jsonb, true, 2),
      (v_company.id, v_table_id, 'classification', 'Classification', 'select', null, '["Important","Moderate","Minor"]'::jsonb, true, 3),
      (v_company.id, v_table_id, 'detail', 'Detail', 'text', null, null, true, 4),
      (v_company.id, v_table_id, 'status', 'Status', 'select', null, '["Open","Resolved"]'::jsonb, true, 5),
      (v_company.id, v_table_id, 'detected_at', 'Detected At', 'text', null, null, true, 6),
      (v_company.id, v_table_id, 'target_field_key', 'Target Field', 'text', null, null, false, 7),
      (v_company.id, v_table_id, 'property', 'Property', 'property', null, null, true, 7);

    INSERT INTO auto_fed_registries (company_id, target_table_id, source_table_name, editable_field_keys)
    VALUES (v_company.id, v_table_id, 'entities', ARRAY['status'])
    RETURNING id INTO v_entity_registry_id;

    INSERT INTO auto_fed_registries (company_id, target_table_id, source_table_name, editable_field_keys)
    VALUES (v_company.id, v_table_id, 'properties', ARRAY['status'])
    RETURNING id INTO v_property_registry_id;

    -- condition_sql cloned verbatim from Niksen's rules -- the tfn check was
    -- already written company-agnostic (resolves the field via
    -- f.company_id = r.company_id, not a hardcoded id); the GST check is
    -- rewritten the same way here instead of Niksen's original hardcoded-id
    -- version, so the exact same SQL string works for every company.
    -- target_field_key still stores this company's own resolved field id
    -- (used by the item "fix" flow to know which field to jump to).
    INSERT INTO auto_fed_rules (registry_id, rule_key, label, classification, detail, target_field_key, condition_sql, display_order) VALUES
      (v_entity_registry_id, 'missing_trust_link', 'Missing Trust Link', 'Important', 'Corporate Trustee has no linked Trust', 'trust_link',
        $sql$r.entity_type = 'Corporate Trustee' AND NOT EXISTS (
        SELECT 1 FROM entity_relationships WHERE child_entity_id = r.id AND relationship_type = 'Trustee' AND is_current IS DISTINCT FROM false
      )$sql$, 0),
      (v_entity_registry_id, 'incomplete_established_date', 'Incomplete Established Date', 'Moderate', 'Established date is missing or has no year', 'established_date',
        $sql$r.entity_type IN ('Company', 'Corporate Trustee', 'Non Corporate Trustee', 'Discretionary Family Trust', 'Fixed Unit Trust')
    AND (r.established_date IS NULL OR r.established_date !~ '[0-9]{4}')$sql$, 1),
      (v_entity_registry_id, 'missing_gst_report_frequency', 'Missing GST Report Frequency', 'Minor', 'GST Report Frequency is not set', v_gst_field_id::text,
        $sql$r.entity_type IN ('Company', 'Corporate Trustee') AND NOT EXISTS (
        SELECT 1 FROM company_custom_field_values v
        JOIN company_custom_fields f ON f.id = v.field_id
        WHERE f.table_name = 'entities' AND f.field_key = 'gst_report_frequency' AND f.company_id = r.company_id
          AND v.record_id = r.id AND v.value_text IS NOT NULL AND btrim(v.value_text) <> ''
      )$sql$, 2),
      (v_entity_registry_id, 'invalid_tfn', 'Invalid TFN', 'Important', 'TFN fails the official check-digit algorithm', v_tfn_field_id::text,
        $sql$EXISTS (
  SELECT 1 FROM company_custom_field_values v
  JOIN company_custom_fields f ON f.id = v.field_id
  WHERE f.table_name = 'entities' AND f.field_key = 'tfn' AND f.company_id = r.company_id
    AND v.record_id = r.id
    AND v.value_text IS NOT NULL AND btrim(v.value_text) <> '' AND NOT is_valid_tfn(v.value_text)
)$sql$, 3),
      (v_entity_registry_id, 'incomplete_name', 'Incomplete Name', 'Moderate', 'Name looks truncated or is missing a surname', 'name',
        $sql$r.entity_type = 'Individual' AND (r.name ~ '\.\.\.|…' OR NOT (r.name ~ '\S\s+\S'))$sql$, 4),
      (v_entity_registry_id, 'duplicate_name', 'Duplicate Name', 'Moderate', 'Another entity has the exact same name', 'name',
        $sql$EXISTS (
      SELECT 1 FROM entities e2 WHERE e2.company_id = r.company_id AND e2.id <> r.id AND lower(btrim(e2.name)) = lower(btrim(r.name))
    )$sql$, 5),
      (v_property_registry_id, 'missing_street_address', 'Missing Street Address', 'Moderate', 'Street address is not set', 'street_address',
        $sql$r.street_address IS NULL OR btrim(r.street_address) = ''$sql$, 0)
    ON CONFLICT (registry_id, rule_key) DO NOTHING;

    -- base_table/source_table_id both hold the target table's id -- same
    -- convention Niksen's own auto_fed page already uses.
    INSERT INTO client_update_pages (company_id, title, slug, access_code, base_table, source_table_id, page_kind, visibility)
    VALUES (v_company.id, 'Irregularities', v_slug, v_pin, v_table_id::text, v_table_id, 'auto_fed', 'public')
    RETURNING id INTO v_page_id;

    -- Backfill: evaluate every existing entity/property immediately rather
    -- than waiting for the next edit to surface pre-existing issues.
    FOR v_rec IN SELECT id FROM entities WHERE company_id = v_company.id AND deleted_at IS NULL LOOP
      PERFORM auto_fed_recompute(v_entity_registry_id, v_rec.id);
    END LOOP;
    FOR v_rec IN SELECT id FROM properties WHERE company_id = v_company.id AND deleted_at IS NULL LOOP
      PERFORM auto_fed_recompute(v_property_registry_id, v_rec.id);
    END LOOP;

    RAISE NOTICE 'Seeded Irregularities for company % (%) -- page slug %, PIN %', v_company.name, v_company.id, v_slug, v_pin;
  END LOOP;
END $migration$;
