SET request.jwt.claim.role = 'service_role';

-- Migrates Niksen's 4 irregularity rules from bespoke SQL functions into
-- the generic auto_fed_registries/auto_fed_rules config tables (see
-- 20260729150000). Marks the Irregularities board itself as page_kind =
-- 'auto_fed'; the Entity Admin board stays 'user_dependent' (its default).

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_irregularities_table_id uuid;
  v_registry_id uuid;
  v_gst_field_id uuid;
BEGIN
  UPDATE client_update_pages SET page_kind = 'auto_fed' WHERE company_id = v_company_id AND slug = 'niksen-irregularities';

  SELECT id INTO v_irregularities_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;

  INSERT INTO auto_fed_registries (company_id, target_table_id, source_table_name, editable_field_keys)
  SELECT v_company_id, v_irregularities_table_id, 'entities', ARRAY['status']
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id)
  RETURNING id INTO v_registry_id;

  IF v_registry_id IS NULL THEN
    SELECT id INTO v_registry_id FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id;
  END IF;

  SELECT id INTO v_gst_field_id FROM company_custom_fields WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL;

  INSERT INTO auto_fed_rules (registry_id, rule_key, label, classification, detail, target_field_key, condition_sql, display_order)
  SELECT v_registry_id, v.rule_key, v.label, v.classification, v.detail, v.target_field_key, v.condition_sql, v.ord
  FROM (VALUES
    (
      'missing_trust_link', 'Missing Trust Link', 'Important', 'Corporate Trustee has no linked Trust', 'trust_link',
      $sql$r.entity_type = 'Corporate Trustee' AND NOT EXISTS (
        SELECT 1 FROM entity_relationships WHERE child_entity_id = r.id AND relationship_type = 'Trustee' AND is_current IS DISTINCT FROM false
      )$sql$,
      0
    ),
    (
      'incomplete_established_date', 'Incomplete Established Date', 'Moderate', 'Established date is missing or has no year', 'established_date',
      $sql$r.established_date IS NULL OR r.established_date !~ '[0-9]{4}'$sql$,
      1
    ),
    (
      'missing_gst_report_frequency', 'Missing GST Report Frequency', 'Minor', 'GST Report Frequency is not set', v_gst_field_id::text,
      format($sql$r.entity_type IN ('Company', 'Corporate Trustee') AND (
        (SELECT value_text FROM company_custom_field_values WHERE record_id = r.id AND field_id = %L) IS NULL
        OR btrim((SELECT value_text FROM company_custom_field_values WHERE record_id = r.id AND field_id = %L)) = ''
      )$sql$, v_gst_field_id, v_gst_field_id),
      2
    ),
    (
      'invalid_tfn', 'Invalid TFN', 'Important', 'TFN fails the official check-digit algorithm', 'tfn',
      $sql$r.tfn IS NOT NULL AND btrim(r.tfn) <> '' AND NOT is_valid_tfn(r.tfn)$sql$,
      3
    )
  ) AS v(rule_key, label, classification, detail, target_field_key, condition_sql, ord)
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_rules x WHERE x.registry_id = v_registry_id AND x.rule_key = v.rule_key);
END $$;
