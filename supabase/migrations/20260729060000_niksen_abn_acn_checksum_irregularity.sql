SET request.jwt.claim.role = 'service_role';

-- 4th Irregularities rule: an ACN/ABN that fails its official check-digit
-- algorithm almost certainly has a transcription error in it (the algorithm
-- is a hard mathematical property every genuine ACN/ABN satisfies) -- catching
-- this automatically, on an ongoing basis, is the "public records" validation
-- asked for; true ABR registry lookup (confirming the number is actually
-- registered/active) would need an ABR web-services GUID this app doesn't
-- have. Mirrors lib/validation/entityValidation.ts's isValidABN/isValidACN
-- exactly (already used by RecordEditModal.tsx/NewEntityModal.tsx/the CSV
-- Import review table) -- same algorithm, just also enforced here so it
-- applies to every future edit, not only manual entry or import.

CREATE OR REPLACE FUNCTION niksen_is_valid_abn(p_abn text) RETURNS boolean AS $$
DECLARE
  d text := regexp_replace(coalesce(p_abn, ''), '\D', '', 'g');
  weights int[] := ARRAY[10,1,3,5,7,9,11,13,15,17,19];
  digits int[];
  total int := 0;
BEGIN
  IF length(d) <> 11 THEN RETURN false; END IF;
  FOR i IN 1..11 LOOP
    digits[i] := substring(d FROM i FOR 1)::int;
  END LOOP;
  digits[1] := digits[1] - 1;
  FOR i IN 1..11 LOOP
    total := total + digits[i] * weights[i];
  END LOOP;
  RETURN total % 89 = 0;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION niksen_is_valid_acn(p_acn text) RETURNS boolean AS $$
DECLARE
  d text := regexp_replace(coalesce(p_acn, ''), '\D', '', 'g');
  weights int[] := ARRAY[8,7,6,5,4,3,2,1];
  digits int[];
  total int := 0;
  remainder int;
  expected int;
BEGIN
  IF length(d) <> 9 THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP
    digits[i] := substring(d FROM i FOR 1)::int;
  END LOOP;
  FOR i IN 1..8 LOOP
    total := total + digits[i] * weights[i];
  END LOOP;
  remainder := total % 10;
  expected := CASE WHEN remainder = 0 THEN 0 ELSE 10 - remainder END;
  RETURN expected = digits[9];
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Extend the Issue Type options to include the two new checksum issues.
UPDATE company_table_fields
SET select_options = '["Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency","Invalid ACN","Invalid ABN"]'::jsonb
WHERE table_id = (SELECT id FROM company_tables WHERE company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND slug = 'irregularities' AND deleted_at IS NULL)
  AND field_key = 'issue_type' AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION niksen_recompute_entity_irregularities(p_entity_id uuid) RETURNS void AS $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_entity entities%ROWTYPE;
  v_table_id uuid;
  v_f_entity uuid; v_f_issue uuid; v_f_class uuid; v_f_detail uuid; v_f_status uuid; v_f_detected uuid;
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

  SELECT id INTO v_f_entity   FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'entity' AND deleted_at IS NULL;
  SELECT id INTO v_f_issue    FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'issue_type' AND deleted_at IS NULL;
  SELECT id INTO v_f_class    FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'classification' AND deleted_at IS NULL;
  SELECT id INTO v_f_detail   FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'detail' AND deleted_at IS NULL;
  SELECT id INTO v_f_status   FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'status' AND deleted_at IS NULL;
  SELECT id INTO v_f_detected FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'detected_at' AND deleted_at IS NULL;
  IF v_f_entity IS NULL OR v_f_issue IS NULL OR v_f_class IS NULL OR v_f_detail IS NULL OR v_f_status IS NULL OR v_f_detected IS NULL THEN
    RETURN;
  END IF;

  -- Rule 1: Corporate Trustee with no current Trust link -- Important.
  v_has_trust := EXISTS (
    SELECT 1 FROM entity_relationships
    WHERE child_entity_id = p_entity_id AND relationship_type = 'Trustee' AND is_current IS DISTINCT FROM false
  );
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
    'Missing Trust Link', 'Important', 'Corporate Trustee has no linked Trust',
    v_entity.entity_type = 'Corporate Trustee' AND NOT v_has_trust);

  -- Rule 2: established_date missing, or present but no 4-digit year -- Moderate.
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
    'Incomplete Established Date', 'Moderate', 'Established date is missing or has no year',
    v_entity.established_date IS NULL OR v_entity.established_date !~ '[0-9]{4}');

  -- Rule 3: Company/Corporate Trustee missing GST Report Frequency -- Minor.
  SELECT id INTO v_gst_field_id FROM company_custom_fields
  WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL;
  IF v_gst_field_id IS NOT NULL THEN
    SELECT value_text INTO v_gst_value FROM company_custom_field_values WHERE field_id = v_gst_field_id AND record_id = p_entity_id;
    PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
      'Missing GST Report Frequency', 'Minor', 'GST Report Frequency is not set',
      v_entity.entity_type IN ('Company', 'Corporate Trustee') AND (v_gst_value IS NULL OR btrim(v_gst_value) = ''));
  END IF;

  -- Rule 4a/4b: ACN/ABN present but fails its check-digit algorithm -- Important.
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
    'Invalid ACN', 'Important', 'ACN fails the official check-digit algorithm',
    v_entity.acn IS NOT NULL AND btrim(v_entity.acn) <> '' AND NOT niksen_is_valid_acn(v_entity.acn));
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
    'Invalid ABN', 'Important', 'ABN fails the official check-digit algorithm',
    v_entity.abn IS NOT NULL AND btrim(v_entity.abn) <> '' AND NOT niksen_is_valid_abn(v_entity.abn));
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_niksen_entities_irregularities ON entities;
CREATE TRIGGER trg_niksen_entities_irregularities
AFTER INSERT OR UPDATE OF entity_type, established_date, deleted_at, acn, abn ON entities
FOR EACH ROW WHEN (NEW.company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d')
EXECUTE FUNCTION niksen_entities_irregularity_trigger();
