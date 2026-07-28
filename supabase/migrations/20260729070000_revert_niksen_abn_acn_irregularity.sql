SET request.jwt.claim.role = 'service_role';

-- Revert: entities already has DB-level chk_valid_abn/chk_valid_acn CHECK
-- constraints (confirmed by testing -- an insert/update with a checksum-
-- invalid ABN or ACN is rejected outright, constraint violation 23514).
-- That means the Invalid ACN/Invalid ABN Irregularities rule added in
-- 20260729060000 can never fire in practice -- an entity row with a bad
-- checksum can never exist to trigger it. Reverting to the 3-rule version
-- rather than keeping dead code; the real, reachable improvement from that
-- migration was extending isValidABN/isValidACN (lib/validation/
-- entityValidation.ts) into NewEntityModal.tsx and the CSV Import review
-- table, both of which stay.

UPDATE company_table_fields
SET select_options = '["Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency"]'::jsonb
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

  v_has_trust := EXISTS (
    SELECT 1 FROM entity_relationships
    WHERE child_entity_id = p_entity_id AND relationship_type = 'Trustee' AND is_current IS DISTINCT FROM false
  );
  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
    'Missing Trust Link', 'Important', 'Corporate Trustee has no linked Trust',
    v_entity.entity_type = 'Corporate Trustee' AND NOT v_has_trust);

  PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
    'Incomplete Established Date', 'Moderate', 'Established date is missing or has no year',
    v_entity.established_date IS NULL OR v_entity.established_date !~ '[0-9]{4}');

  SELECT id INTO v_gst_field_id FROM company_custom_fields
  WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL;
  IF v_gst_field_id IS NOT NULL THEN
    SELECT value_text INTO v_gst_value FROM company_custom_field_values WHERE field_id = v_gst_field_id AND record_id = p_entity_id;
    PERFORM niksen_upsert_irregularity(v_table_id, p_entity_id, v_company_id, v_f_entity, v_f_issue, v_f_class, v_f_detail, v_f_status, v_f_detected,
      'Missing GST Report Frequency', 'Minor', 'GST Report Frequency is not set',
      v_entity.entity_type IN ('Company', 'Corporate Trustee') AND (v_gst_value IS NULL OR btrim(v_gst_value) = ''));
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_niksen_entities_irregularities ON entities;
CREATE TRIGGER trg_niksen_entities_irregularities
AFTER INSERT OR UPDATE OF entity_type, established_date, deleted_at ON entities
FOR EACH ROW WHEN (NEW.company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d')
EXECUTE FUNCTION niksen_entities_irregularity_trigger();

DROP FUNCTION IF EXISTS niksen_is_valid_abn(text);
DROP FUNCTION IF EXISTS niksen_is_valid_acn(text);
