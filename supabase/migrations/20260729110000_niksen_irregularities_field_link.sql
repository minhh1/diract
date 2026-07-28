SET request.jwt.claim.role = 'service_role';

-- Adds the machine-readable half of each irregularity: which literal field
-- needs fixing (target_field_key -- a native entities column name, or a
-- company_custom_fields.id for a custom field, or the sentinel
-- 'trust_link' for the entity_relationships-backed Trust field, which has
-- no company_custom_fields row of its own) and which table it lives on
-- (source_table -- always 'entities' today, kept as a real column since
-- the classification/detail text already follows "Missing X"/"Incomplete
-- X"/"Invalid X" naming, this is what lets a UI jump straight to the right
-- field to fix instead of just describing it in prose). Also adds a 4th
-- rule -- Invalid TFN -- since entities.tfn has no DB-level checksum
-- constraint (confirmed by testing, unlike chk_valid_abn/chk_valid_acn),
-- so this one genuinely can fire, unlike the ACN/ABN version reverted in
-- 20260729070000.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, 'text', v.show_in_table, v.ord
  FROM (VALUES
    ('source_table', 'Table', true, 0),
    ('target_field_key', 'Target Field', false, 7)
  ) AS v(field_key, label, show_in_table, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;

CREATE OR REPLACE FUNCTION niksen_is_valid_tfn(p_tfn text) RETURNS boolean AS $$
DECLARE
  d text := regexp_replace(coalesce(p_tfn, ''), '\D', '', 'g');
  weights8 int[] := ARRAY[10,7,8,4,6,3,5,1];
  weights9 int[] := ARRAY[1,4,3,7,5,8,6,9,10];
  weights int[];
  digits int[];
  total int := 0;
BEGIN
  IF length(d) NOT IN (8, 9) THEN RETURN false; END IF;
  weights := CASE WHEN length(d) = 8 THEN weights8 ELSE weights9 END;
  FOR i IN 1..length(d) LOOP
    digits[i] := substring(d FROM i FOR 1)::int;
  END LOOP;
  FOR i IN 1..length(d) LOOP
    total := total + digits[i] * weights[i];
  END LOOP;
  RETURN total % 11 = 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Extend the upsert helper with target_field_key/source_table.
CREATE OR REPLACE FUNCTION niksen_upsert_irregularity(
  p_table_id uuid, p_entity_id uuid, p_company_id uuid,
  p_field_entity_id uuid, p_field_issue_type_id uuid, p_field_class_id uuid,
  p_field_detail_id uuid, p_field_status_id uuid, p_field_detected_id uuid,
  p_field_source_table_id uuid, p_field_target_key_id uuid,
  p_issue_type text, p_classification text, p_detail text,
  p_source_table text, p_target_field_key text, p_is_violated boolean
) RETURNS void AS $$
DECLARE
  v_record_id uuid;
BEGIN
  SELECT r.id INTO v_record_id
  FROM company_table_records r
  JOIN company_table_values ve ON ve.record_id = r.id AND ve.field_id = p_field_entity_id AND ve.value_record_id = p_entity_id
  JOIN company_table_values vi ON vi.record_id = r.id AND vi.field_id = p_field_issue_type_id AND vi.value_text = p_issue_type
  JOIN company_table_values vs ON vs.record_id = r.id AND vs.field_id = p_field_status_id AND vs.value_text = 'Open'
  WHERE r.table_id = p_table_id AND r.deleted_at IS NULL
  LIMIT 1;

  IF p_is_violated THEN
    IF v_record_id IS NULL THEN
      INSERT INTO company_table_records (company_id, table_id) VALUES (p_company_id, p_table_id) RETURNING id INTO v_record_id;
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_record_id) VALUES (p_company_id, p_table_id, v_record_id, p_field_entity_id, p_entity_id);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_issue_type_id, p_issue_type);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_class_id, p_classification);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_detail_id, p_detail);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_status_id, 'Open');
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_date) VALUES (p_company_id, p_table_id, v_record_id, p_field_detected_id, now()::date);
      IF p_field_source_table_id IS NOT NULL THEN
        INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_source_table_id, p_source_table);
      END IF;
      IF p_field_target_key_id IS NOT NULL THEN
        INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_target_key_id, p_target_field_key);
      END IF;
    END IF;
  ELSE
    IF v_record_id IS NOT NULL THEN
      UPDATE company_table_values SET value_text = 'Resolved', updated_at = now() WHERE record_id = v_record_id AND field_id = p_field_status_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION niksen_recompute_entity_irregularities(p_entity_id uuid) RETURNS void AS $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_entity entities%ROWTYPE;
  v_table_id uuid;
  v_f_entity uuid; v_f_issue uuid; v_f_class uuid; v_f_detail uuid; v_f_status uuid; v_f_detected uuid; v_f_source_table uuid; v_f_target_key uuid;
  v_gst_field_id uuid;
  v_gst_value text;
  v_has_trust boolean;
BEGIN
  SELECT * INTO v_entity FROM entities WHERE id = p_entity_id;
  IF NOT FOUND OR v_entity.company_id IS DISTINCT FROM v_company_id OR v_entity.deleted_at IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_f_entity      FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'entity' AND deleted_at IS NULL;
  SELECT id INTO v_f_issue       FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'issue_type' AND deleted_at IS NULL;
  SELECT id INTO v_f_class       FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'classification' AND deleted_at IS NULL;
  SELECT id INTO v_f_detail      FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'detail' AND deleted_at IS NULL;
  SELECT id INTO v_f_status      FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'status' AND deleted_at IS NULL;
  SELECT id INTO v_f_detected    FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'detected_at' AND deleted_at IS NULL;
  SELECT id INTO v_f_source_table FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'source_table' AND deleted_at IS NULL;
  SELECT id INTO v_f_target_key  FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'target_field_key' AND deleted_at IS NULL;
  IF v_f_entity IS NULL OR v_f_issue IS NULL OR v_f_class IS NULL OR v_f_detail IS NULL OR v_f_status IS NULL OR v_f_detected IS NULL THEN
    RETURN;
  END IF;

  -- Rule 1: Corporate Trustee with no current Trust link -- Important.
  -- target_field_key = 'trust_link' -- a sentinel, not a company_custom_fields
  -- id (Trust is stored via entity_relationships, not a custom field) -- the
  -- one-click fix UI special-cases this key to open the Trust picker.
  v_has_trust := EXISTS (
    SELECT 1 FROM entity_relationships
    WHERE child_entity_id = p_entity_id AND relationship_type = 'Trustee' AND is_current IS DISTINCT FROM false
  );
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected, v_f_source_table, v_f_target_key,
    'Missing Trust Link', 'Important', 'Corporate Trustee has no linked Trust',
    'Entities', 'trust_link',
    v_entity.entity_type = 'Corporate Trustee' AND NOT v_has_trust);

  -- Rule 2: established_date missing, or present but no 4-digit year -- Moderate.
  -- target_field_key = 'established_date' -- a native entities column.
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected, v_f_source_table, v_f_target_key,
    'Incomplete Established Date', 'Moderate', 'Established date is missing or has no year',
    'Entities', 'established_date',
    v_entity.established_date IS NULL OR v_entity.established_date !~ '[0-9]{4}');

  -- Rule 3: Company/Corporate Trustee missing GST Report Frequency -- Minor.
  -- target_field_key = the company_custom_fields.id for gst_report_frequency.
  SELECT id INTO v_gst_field_id FROM company_custom_fields
  WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL;
  IF v_gst_field_id IS NOT NULL THEN
    SELECT value_text INTO v_gst_value FROM company_custom_field_values WHERE field_id = v_gst_field_id AND record_id = p_entity_id;
    PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected, v_f_source_table, v_f_target_key,
      'Missing GST Report Frequency', 'Minor', 'GST Report Frequency is not set',
      'Entities', v_gst_field_id::text,
      v_entity.entity_type IN ('Company', 'Corporate Trustee') AND (v_gst_value IS NULL OR btrim(v_gst_value) = ''));
  END IF;

  -- Rule 4: TFN present but fails its check-digit algorithm -- Important.
  -- No DB constraint on tfn (confirmed by testing) -- this one, unlike an
  -- ACN/ABN version, can actually fire. target_field_key = 'tfn' -- a
  -- native entities column.
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected, v_f_source_table, v_f_target_key,
    'Invalid TFN', 'Important', 'TFN fails the official check-digit algorithm',
    'Entities', 'tfn',
    v_entity.tfn IS NOT NULL AND btrim(v_entity.tfn) <> '' AND NOT niksen_is_valid_tfn(v_entity.tfn));
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_niksen_entities_irregularities ON entities;
CREATE TRIGGER trg_niksen_entities_irregularities
AFTER INSERT OR UPDATE OF entity_type, established_date, deleted_at, tfn ON entities
FOR EACH ROW WHEN (NEW.company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d')
EXECUTE FUNCTION niksen_entities_irregularity_trigger();

-- Extend the Issue Type options to include the new rule.
UPDATE company_table_fields
SET select_options = '["Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency","Invalid TFN"]'::jsonb
WHERE table_id = (SELECT id FROM company_tables WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND slug = 'irregularities' AND deleted_at IS NULL)
  AND field_key = 'issue_type' AND deleted_at IS NULL;

-- Backfill source_table + target_field_key on every existing irregularity
-- row (created before this migration, so it predates both fields).
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
  v_f_issue uuid; v_f_source_table uuid; v_f_target_key uuid;
  v_gst_field_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  SELECT id INTO v_f_issue FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'issue_type' AND deleted_at IS NULL;
  SELECT id INTO v_f_source_table FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'source_table' AND deleted_at IS NULL;
  SELECT id INTO v_f_target_key FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'target_field_key' AND deleted_at IS NULL;
  SELECT id INTO v_gst_field_id FROM company_custom_fields WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL;

  INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
  SELECT v_company_id, v_table_id, r.id, v_f_source_table, 'Entities'
  FROM company_table_records r
  WHERE r.table_id = v_table_id AND r.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM company_table_values x WHERE x.record_id = r.id AND x.field_id = v_f_source_table);

  INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
  SELECT v_company_id, v_table_id, r.id, v_f_target_key,
    CASE vi.value_text
      WHEN 'Missing Trust Link' THEN 'trust_link'
      WHEN 'Incomplete Established Date' THEN 'established_date'
      WHEN 'Missing GST Report Frequency' THEN v_gst_field_id::text
      WHEN 'Invalid TFN' THEN 'tfn'
    END
  FROM company_table_records r
  JOIN company_table_values vi ON vi.record_id = r.id AND vi.field_id = v_f_issue
  WHERE r.table_id = v_table_id AND r.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM company_table_values x WHERE x.record_id = r.id AND x.field_id = v_f_target_key);
END $$;
