SET request.jwt.claim.role = 'service_role';

-- Niksen Time Pty Ltd's Irregularities registry: a real custom table (so it
-- gets the normal List/Dashboard view machinery for free) kept in sync in
-- real time by triggers on entities/entity_relationships/
-- company_custom_field_values, rather than computed on the fly -- so
-- "immediately point out what is missing" holds even when nobody has the
-- dashboard open. Three rules for now, all scoped to Niksen Time only
-- (32d4fb0e-007d-41e7-bc5e-638163c28e3d):
--   1. Corporate Trustee entity with no current Trust link -> Important
--   2. established_date missing or has no 4-digit year        -> Moderate
--   3. Company/Corporate Trustee missing GST Report Frequency  -> Minor
-- Deliberately does NOT backfill the 97 entities that already existed in
-- Niksen Time before this migration -- those were imported through an
-- unrelated, earlier process and this migration shouldn't retroactively
-- flag ~190 rows for them. The triggers only evaluate rows created or
-- edited from here on (the incoming entity-register import this table was
-- built for, plus all future edits). Run a manual recompute over the
-- existing 97 later if/when that backfill is actually wanted.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Irregularities', 'irregularities', 'AlertTriangle', '#ef4444', 'detail')
    RETURNING id INTO v_table_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, select_options, show_in_table, display_order, default_value)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.select_options, true, v.ord, v.default_value
  FROM (VALUES
    ('entity', 'Entity', 'entity', 'entities', NULL::jsonb, 1, NULL),
    ('issue_type', 'Issue Type', 'select', NULL, '["Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency"]'::jsonb, 2, NULL),
    ('classification', 'Classification', 'select', NULL, '["Important","Moderate","Minor"]'::jsonb, 3, NULL),
    ('detail', 'Detail', 'text', NULL, NULL::jsonb, 4, NULL),
    ('status', 'Status', 'select', NULL, '["Open","Resolved"]'::jsonb, 5, 'Open'),
    ('detected_at', 'Detected At', 'date', NULL, NULL::jsonb, 6, NULL)
  ) AS v(field_key, label, field_type, linked_system_table, select_options, ord, default_value)
  WHERE NOT EXISTS (
    SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL
  );
END $$;

-- ── Upsert helper: opens/resolves one (entity, issue_type) irregularity row ──
CREATE OR REPLACE FUNCTION niksen_upsert_irregularity(
  p_table_id uuid, p_entity_id uuid, p_company_id uuid,
  p_field_entity_id uuid, p_field_issue_type_id uuid, p_field_classification_id uuid,
  p_field_detail_id uuid, p_field_status_id uuid, p_field_detected_at_id uuid,
  p_issue_type text, p_classification text, p_detail text, p_is_violated boolean
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
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_classification_id, p_classification);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_detail_id, p_detail);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_company_id, p_table_id, v_record_id, p_field_status_id, 'Open');
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_date) VALUES (p_company_id, p_table_id, v_record_id, p_field_detected_at_id, now()::date);
    END IF;
  ELSE
    IF v_record_id IS NOT NULL THEN
      UPDATE company_table_values SET value_text = 'Resolved', updated_at = now() WHERE record_id = v_record_id AND field_id = p_field_status_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ── Main recompute: re-evaluates all 3 rules for one entity ──
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

  -- Rule 1: Corporate Trustee with no current Trust link (entity_relationships,
  -- same convention NewEntityModal.tsx uses: parent=Trust, child=Trustee,
  -- relationship_type='Trustee') -- Important.
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
END;
$$ LANGUAGE plpgsql;

-- ── Triggers ──
CREATE OR REPLACE FUNCTION niksen_entities_irregularity_trigger() RETURNS trigger AS $$
BEGIN
  PERFORM niksen_recompute_entity_irregularities(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_niksen_entities_irregularities ON entities;
CREATE TRIGGER trg_niksen_entities_irregularities
AFTER INSERT OR UPDATE OF entity_type, established_date, deleted_at ON entities
FOR EACH ROW WHEN (NEW.company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d')
EXECUTE FUNCTION niksen_entities_irregularity_trigger();

CREATE OR REPLACE FUNCTION niksen_entity_relationships_irregularity_trigger() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM niksen_recompute_entity_irregularities(OLD.child_entity_id);
    RETURN OLD;
  END IF;
  PERFORM niksen_recompute_entity_irregularities(NEW.child_entity_id);
  IF TG_OP = 'UPDATE' AND OLD.child_entity_id IS DISTINCT FROM NEW.child_entity_id THEN
    PERFORM niksen_recompute_entity_irregularities(OLD.child_entity_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_niksen_entity_relationships_irregularities ON entity_relationships;
CREATE TRIGGER trg_niksen_entity_relationships_irregularities
AFTER INSERT OR UPDATE OR DELETE ON entity_relationships
FOR EACH ROW EXECUTE FUNCTION niksen_entity_relationships_irregularity_trigger();

-- company_custom_field_values is a high-traffic, all-companies table, so
-- this trigger stays as cheap as possible for every other company/field:
-- one indexed lookup on company_custom_fields, then an immediate return.
CREATE OR REPLACE FUNCTION niksen_ccfv_irregularity_trigger() RETURNS trigger AS $$
DECLARE
  v_row company_custom_field_values;
  v_is_gst_field boolean;
BEGIN
  v_row := COALESCE(NEW, OLD);
  SELECT EXISTS (
    SELECT 1 FROM company_custom_fields
    WHERE id = v_row.field_id AND table_name = 'entities' AND field_key = 'gst_report_frequency'
      AND company_id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d'
  ) INTO v_is_gst_field;
  IF v_is_gst_field THEN
    PERFORM niksen_recompute_entity_irregularities(v_row.record_id);
  END IF;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_niksen_ccfv_irregularities ON company_custom_field_values;
CREATE TRIGGER trg_niksen_ccfv_irregularities
AFTER INSERT OR UPDATE OR DELETE ON company_custom_field_values
FOR EACH ROW EXECUTE FUNCTION niksen_ccfv_irregularity_trigger();
