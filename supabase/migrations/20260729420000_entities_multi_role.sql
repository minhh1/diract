SET request.jwt.claim.role = 'service_role';

-- Lets an entity hold more than one role at once (e.g. a Company that's
-- ALSO Corporate Trustee for some specific trust) -- entity_type stays
-- exactly as-is (still the single "primary" classification every existing
-- consumer reads/writes: staff auto-provisioning, CSV import, Xero, Gmail
-- add-on, AI actions, the admin default_rate lookup, the invoice modal's
-- Staff picker, FieldConfigPanel's restriction dropdown, sidebar filters --
-- none of that changes). `roles` is purely additive: an invariant maintained
-- by application code from here on is that roles always contains
-- entity_type plus any additional roles, so any consumer can check either
-- `entity_type = 'X'` or `'X' = ANY(roles)` and both stay correct.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS roles text[] NOT NULL DEFAULT '{}';

UPDATE entities SET roles = ARRAY[entity_type] WHERE entity_type IS NOT NULL AND roles = '{}';

CREATE INDEX IF NOT EXISTS idx_entities_roles ON entities USING GIN (roles);

-- Three of the four Irregularities rules keyed off entity_type directly --
-- switched to checking `roles` too so an entity that holds Corporate/Non
-- Corporate Trustee as an ADDITIONAL role (not just as its primary
-- entity_type) still gets flagged correctly. incomplete_name (Individual
-- only) is untouched -- not a multi-role case. Matches by rule_key (not
-- per-company), so this covers every company's existing cloned copy of
-- these rules in one shot -- confirmed live: all 4 companies (Niksen, Huynh
-- Lawyers, Law Firm QA Co, PDF Editor Test Co) have all 3 rows.
UPDATE auto_fed_rules SET condition_sql = $sql$'Corporate Trustee' = ANY(r.roles) AND NOT EXISTS (
      SELECT 1 FROM entity_relationships WHERE child_entity_id = r.id AND relationship_type = 'Trustee' AND is_current IS DISTINCT FROM false
    )$sql$
WHERE rule_key = 'missing_trust_link';

UPDATE auto_fed_rules SET condition_sql = $sql$r.roles && ARRAY['Company', 'Corporate Trustee', 'Non Corporate Trustee', 'Discretionary Family Trust', 'Fixed Unit Trust']
  AND (r.established_date IS NULL OR r.established_date !~ '[0-9]{4}')$sql$
WHERE rule_key = 'incomplete_established_date';

UPDATE auto_fed_rules SET condition_sql = $sql$r.roles && ARRAY['Company', 'Corporate Trustee'] AND NOT EXISTS (
      SELECT 1 FROM company_custom_field_values v
      JOIN company_custom_fields f ON f.id = v.field_id
      WHERE f.table_name = 'entities' AND f.field_key = 'gst_report_frequency' AND f.company_id = r.company_id
        AND v.record_id = r.id AND v.value_text IS NOT NULL AND btrim(v.value_text) <> ''
    )$sql$
WHERE rule_key = 'missing_gst_report_frequency';

-- Re-evaluate every company's existing entities immediately against the
-- updated condition_sql -- otherwise a role-only Corporate Trustee entity
-- (entity_type != 'Corporate Trustee' but roles contains it) stays
-- unflagged until its next unrelated edit re-triggers the row-level
-- trigger.
DO $do$
DECLARE v_rec record;
BEGIN
  FOR v_rec IN SELECT reg.id AS registry_id, e.id AS entity_id
               FROM auto_fed_registries reg
               JOIN entities e ON e.company_id = reg.company_id AND e.deleted_at IS NULL
               WHERE reg.source_table_name = 'entities'
  LOOP
    PERFORM auto_fed_recompute(v_rec.registry_id, v_rec.entity_id);
  END LOOP;
END;
$do$;

-- Same three condition_sql strings, updated in the self-service install
-- function too -- so a company that installs the Irregularities board
-- AFTER this migration (via install_irregularities_board()) gets the
-- roles-aware rules from the start, not the old entity_type-only version.
-- Full function body reproduced (CREATE OR REPLACE), unchanged except for
-- the three condition_sql literals -- see
-- supabase/migrations/20260729410000_install_irregularities_board_rpc.sql
-- for the version this replaces.
CREATE OR REPLACE FUNCTION install_irregularities_board(p_company_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_table_id uuid;
  v_tfn_field_id uuid;
  v_gst_field_id uuid;
  v_entity_registry_id uuid;
  v_property_registry_id uuid;
  v_page_id uuid;
  v_company_name text;
  v_slug text;
  v_pin text;
  v_field_id uuid;
  v_rec record;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  IF EXISTS (SELECT 1 FROM company_tables WHERE company_id = p_company_id AND name = 'Irregularities' AND deleted_at IS NULL) THEN
    RETURN jsonb_build_object('status', 'already_installed');
  END IF;

  SELECT name INTO v_company_name FROM companies WHERE id = p_company_id;

  SELECT id INTO v_tfn_field_id FROM company_custom_fields WHERE company_id = p_company_id AND table_name = 'entities' AND field_key = 'tfn' AND deleted_at IS NULL LIMIT 1;
  IF v_tfn_field_id IS NULL THEN
    INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, display_order)
    VALUES (p_company_id, 'entities', 'tfn', 'TFN', 'text', 0)
    RETURNING id INTO v_tfn_field_id;
  END IF;

  SELECT id INTO v_gst_field_id FROM company_custom_fields WHERE company_id = p_company_id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL LIMIT 1;
  IF v_gst_field_id IS NULL THEN
    INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, select_options, display_order)
    VALUES (p_company_id, 'entities', 'gst_report_frequency', 'GST Report Frequency', 'select', '["Monthly","Quarterly","Annually"]'::jsonb, 0)
    RETURNING id INTO v_gst_field_id;
  END IF;

  v_slug := lower(regexp_replace(trim(coalesce(v_company_name, 'company')), '[^a-zA-Z0-9]+', '-', 'g')) || '-irregularities';
  WHILE EXISTS (SELECT 1 FROM client_update_pages WHERE slug = v_slug) LOOP
    v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;
  v_pin := lpad(floor(random() * 1000000)::text, 6, '0');

  INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
  VALUES (p_company_id, 'Irregularities', 'irregularities', 'AlertTriangle', '#ef4444', 'detail')
  RETURNING id INTO v_table_id;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, select_options, show_in_table, display_order) VALUES
    (p_company_id, v_table_id, 'source_table', 'Table', 'text', null, null, true, 0),
    (p_company_id, v_table_id, 'entity', 'Entity', 'entity', 'entities', null, true, 1),
    (p_company_id, v_table_id, 'issue_type', 'Issue Type', 'select', null, '["Missing Street Address","Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency","Invalid TFN","Incomplete Name","Duplicate Name"]'::jsonb, true, 2),
    (p_company_id, v_table_id, 'classification', 'Classification', 'select', null, '["Important","Moderate","Minor"]'::jsonb, true, 3),
    (p_company_id, v_table_id, 'detail', 'Detail', 'text', null, null, true, 4),
    (p_company_id, v_table_id, 'status', 'Status', 'select', null, '["Open","Resolved"]'::jsonb, true, 5),
    (p_company_id, v_table_id, 'detected_at', 'Detected At', 'text', null, null, true, 6),
    (p_company_id, v_table_id, 'target_field_key', 'Target Field', 'text', null, null, false, 7),
    (p_company_id, v_table_id, 'property', 'Property', 'property', null, null, true, 7);

  INSERT INTO auto_fed_registries (company_id, target_table_id, source_table_name, editable_field_keys)
  VALUES (p_company_id, v_table_id, 'entities', ARRAY['status'])
  RETURNING id INTO v_entity_registry_id;

  INSERT INTO auto_fed_registries (company_id, target_table_id, source_table_name, editable_field_keys)
  VALUES (p_company_id, v_table_id, 'properties', ARRAY['status'])
  RETURNING id INTO v_property_registry_id;

  INSERT INTO auto_fed_rules (registry_id, rule_key, label, classification, detail, target_field_key, condition_sql, display_order) VALUES
    (v_entity_registry_id, 'missing_trust_link', 'Missing Trust Link', 'Important', 'Corporate Trustee has no linked Trust', 'trust_link',
      $sql$'Corporate Trustee' = ANY(r.roles) AND NOT EXISTS (
      SELECT 1 FROM entity_relationships WHERE child_entity_id = r.id AND relationship_type = 'Trustee' AND is_current IS DISTINCT FROM false
    )$sql$, 0),
    (v_entity_registry_id, 'incomplete_established_date', 'Incomplete Established Date', 'Moderate', 'Established date is missing or has no year', 'established_date',
      $sql$r.roles && ARRAY['Company', 'Corporate Trustee', 'Non Corporate Trustee', 'Discretionary Family Trust', 'Fixed Unit Trust']
  AND (r.established_date IS NULL OR r.established_date !~ '[0-9]{4}')$sql$, 1),
    (v_entity_registry_id, 'missing_gst_report_frequency', 'Missing GST Report Frequency', 'Minor', 'GST Report Frequency is not set', v_gst_field_id::text,
      $sql$r.roles && ARRAY['Company', 'Corporate Trustee'] AND NOT EXISTS (
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

  INSERT INTO client_update_pages (company_id, title, slug, access_code, base_table, source_table_id, page_kind, visibility)
  VALUES (p_company_id, 'Irregularities', v_slug, v_pin, v_table_id::text, v_table_id, 'auto_fed', 'public')
  RETURNING id INTO v_page_id;

  SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'source_table';
  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
  VALUES (v_page_id, 'base', v_field_id::text, 'Table', 0, true, 'text');

  SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'entity';
  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
  VALUES (v_page_id, 'base', v_field_id::text, 'Name', 1, true, 'text');

  SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'issue_type';
  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
  VALUES (v_page_id, 'base', v_field_id::text, 'Type', 2, true, 'select', '["Missing Street Address","Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency","Invalid TFN","Incomplete Name","Duplicate Name"]'::jsonb);

  SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'classification';
  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
  VALUES (v_page_id, 'base', v_field_id::text, 'Seriousness', 3, true, 'select', '["Important","Moderate","Minor"]'::jsonb);

  SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'status';
  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
  VALUES (v_page_id, 'base', v_field_id::text, 'Status', 4, true, 'select', '["Open","Resolved"]'::jsonb);

  SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'detected_at';
  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
  VALUES (v_page_id, 'base', v_field_id::text, 'Detected At', 5, true, 'text');

  FOR v_rec IN SELECT id FROM entities WHERE company_id = p_company_id AND deleted_at IS NULL LOOP
    PERFORM auto_fed_recompute(v_entity_registry_id, v_rec.id);
  END LOOP;
  FOR v_rec IN SELECT id FROM properties WHERE company_id = p_company_id AND deleted_at IS NULL LOOP
    PERFORM auto_fed_recompute(v_property_registry_id, v_rec.id);
  END LOOP;

  RETURN jsonb_build_object('status', 'installed', 'pageId', v_page_id, 'slug', v_slug, 'accessCode', v_pin);
END;
$$;
