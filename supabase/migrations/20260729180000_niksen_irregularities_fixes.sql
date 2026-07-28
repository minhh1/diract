SET request.jwt.claim.role = 'service_role';

-- Three fixes to the Irregularities rules/engine, reported live against
-- Niksen's real data:
--
-- 1. "Incomplete Established Date" was firing for entity_type = 'Individual'
--    (a person) -- a person was never asked for an established date in the
--    first place (see NewEntityModal.tsx's own form), so this was a false
--    positive on every individual entity. Scoped down to the entity types
--    that actually have a legal establishment concept.
-- 2. No rule existed for a truncated/OCR-artifact person name (e.g. ending
--    in "…" or only ever a first name, no surname) -- new 'incomplete_name'
--    rule, Individual-only.
-- 3. "Detected At" was DATE-only (value_date), so same-day detections were
--    indistinguishable and unsortable by time. Switched to 'text' storing
--    'YYYY-MM-DD HH24:MI' -- still lexicographically sortable (MatterBoard's
--    compareOne falls back to String().localeCompare() for non-numeric
--    fields) while carrying real time-of-day. This is a generic auto_fed
--    engine change (auto_fed_upsert_item), not Niksen-specific -- any future
--    auto-fed table gets the same precision.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_irregularities_table_id uuid;
  v_registry_id uuid;
BEGIN
  SELECT id INTO v_irregularities_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  SELECT id INTO v_registry_id FROM auto_fed_registries WHERE target_table_id = v_irregularities_table_id;

  -- (1) Scope established-date completeness to entity types that are
  -- actually incorporated/established -- not people, and not the
  -- referrer-style contact types (Lawyer/Accountant/Bank/etc).
  UPDATE auto_fed_rules
  SET condition_sql = $sql$r.entity_type IN ('Company', 'Corporate Trustee', 'Non Corporate Trustee', 'Discretionary Family Trust', 'Fixed Unit Trust')
    AND (r.established_date IS NULL OR r.established_date !~ '[0-9]{4}')$sql$
  WHERE registry_id = v_registry_id AND rule_key = 'incomplete_established_date';

  -- (2) New rule: an Individual's name that's truncated ("…" / "...") or
  -- has no surname (a single token, no whitespace).
  INSERT INTO auto_fed_rules (registry_id, rule_key, label, classification, detail, target_field_key, condition_sql, display_order)
  SELECT v_registry_id, 'incomplete_name', 'Incomplete Name', 'Moderate', 'Name looks truncated or is missing a surname', 'name',
    $sql$r.entity_type = 'Individual' AND (r.name ~ '\.\.\.|…' OR NOT (r.name ~ '\S\s+\S'))$sql$,
    4
  WHERE NOT EXISTS (SELECT 1 FROM auto_fed_rules WHERE registry_id = v_registry_id AND rule_key = 'incomplete_name');

  -- (3) detected_at: date -> text (date + time), still sortable.
  UPDATE company_table_fields SET field_type = 'text'
  WHERE table_id = v_irregularities_table_id AND field_key = 'detected_at' AND field_type <> 'text';

  -- Backfill existing rows -- no original time-of-day was ever recorded, so
  -- carry the date over as a bare 'YYYY-MM-DD' string, which always sorts
  -- before a same-day 'YYYY-MM-DD HH24:MI' value (a strict string prefix
  -- sorts first).
  UPDATE company_table_values v
  SET value_text = to_char(v.value_date, 'YYYY-MM-DD'), value_date = NULL
  FROM company_table_fields f
  WHERE v.field_id = f.id AND f.table_id = v_irregularities_table_id AND f.field_key = 'detected_at' AND v.value_date IS NOT NULL;
END $$;

-- auto_fed_upsert_item: write detected_at with real time-of-day. Full
-- function body re-pasted from 20260729150000_auto_fed_rule_engine.sql with
-- only the v_f_detected INSERT line changed (date -> formatted text).
CREATE OR REPLACE FUNCTION auto_fed_upsert_item(p_registry auto_fed_registries, p_rule auto_fed_rules, p_record_id uuid, p_is_violated boolean) RETURNS void AS $$
DECLARE
  v_link_field_type text := CASE p_registry.source_table_name WHEN 'entities' THEN 'entity' WHEN 'projects' THEN 'project' WHEN 'properties' THEN 'property' ELSE 'entity' END;
  v_f_link uuid; v_f_issue uuid; v_f_class uuid; v_f_detail uuid; v_f_status uuid; v_f_detected uuid; v_f_source_table uuid; v_f_target_key uuid;
  v_target_record_id uuid;
  v_page_id uuid;
BEGIN
  SELECT id INTO v_f_link       FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_type = v_link_field_type AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_f_issue      FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_key = 'issue_type' AND deleted_at IS NULL;
  SELECT id INTO v_f_class      FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_key = 'classification' AND deleted_at IS NULL;
  SELECT id INTO v_f_detail     FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_key = 'detail' AND deleted_at IS NULL;
  SELECT id INTO v_f_status     FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_key = 'status' AND deleted_at IS NULL;
  SELECT id INTO v_f_detected   FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_key = 'detected_at' AND deleted_at IS NULL;
  SELECT id INTO v_f_source_table FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_key = 'source_table' AND deleted_at IS NULL;
  SELECT id INTO v_f_target_key FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_key = 'target_field_key' AND deleted_at IS NULL;
  IF v_f_link IS NULL OR v_f_issue IS NULL OR v_f_class IS NULL OR v_f_detail IS NULL OR v_f_status IS NULL OR v_f_detected IS NULL THEN
    RETURN; -- target table doesn't follow the standard convention -- nothing this engine can do
  END IF;

  SELECT r.id INTO v_target_record_id
  FROM company_table_records r
  JOIN company_table_values vl ON vl.record_id = r.id AND vl.field_id = v_f_link AND vl.value_record_id = p_record_id
  JOIN company_table_values vi ON vi.record_id = r.id AND vi.field_id = v_f_issue AND vi.value_text = p_rule.label
  JOIN company_table_values vs ON vs.record_id = r.id AND vs.field_id = v_f_status AND vs.value_text = 'Open'
  WHERE r.table_id = p_registry.target_table_id AND r.deleted_at IS NULL
  LIMIT 1;

  IF p_is_violated THEN
    IF v_target_record_id IS NULL THEN
      INSERT INTO company_table_records (company_id, table_id) VALUES (p_registry.company_id, p_registry.target_table_id) RETURNING id INTO v_target_record_id;
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_record_id) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_link, p_record_id);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_issue, p_rule.label);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_class, p_rule.classification);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_detail, p_rule.detail);
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_status, 'Open');
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_detected, to_char(now(), 'YYYY-MM-DD HH24:MI'));
      IF v_f_source_table IS NOT NULL THEN
        INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_source_table, initcap(p_registry.source_table_name));
      END IF;
      IF v_f_target_key IS NOT NULL AND p_rule.target_field_key IS NOT NULL THEN
        INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_target_key, p_rule.target_field_key);
      END IF;

      SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = p_registry.company_id AND source_table_id = p_registry.target_table_id AND page_kind = 'auto_fed' LIMIT 1;
      IF v_page_id IS NOT NULL THEN
        INSERT INTO client_update_page_items (page_id, custom_record_id, display_order)
        VALUES (v_page_id, v_target_record_id, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM client_update_page_items WHERE page_id = v_page_id));
      END IF;
    END IF;
  ELSE
    IF v_target_record_id IS NOT NULL THEN
      UPDATE company_table_values SET value_text = 'Resolved', updated_at = now() WHERE record_id = v_target_record_id AND field_id = v_f_status;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
