SET request.jwt.claim.role = 'service_role';

-- Extends the auto-fed engine to watch a genuinely custom (company-defined)
-- table as a source, not just entities/projects/properties. Those three are
-- real Postgres tables with named columns, so condition_sql can reference
-- them directly (r.some_column) and a plain AFTER INSERT/UPDATE trigger on
-- that table is enough. A custom table has no physical columns at all --
-- its "cells" are EAV rows in company_table_values -- so it needs a
-- different evaluation strategy and a different (shared, generic) trigger.
--
-- Convention: for a custom-table source, auto_fed_registries.source_table_name
-- holds the watched company_tables.id cast to text (same convention
-- base_table/record_table already use for "any table, system or custom" --
-- see 20260729210000's header comment) instead of a literal table name.
-- condition_sql for this kind of source reads the record via a pivoted
-- jsonb blob (r->>'field_key') rather than named columns (r.field_key),
-- since there's no fixed schema to generate real columns from.

CREATE OR REPLACE FUNCTION auto_fed_custom_table_row(p_table_id uuid, p_record_id uuid) RETURNS jsonb AS $$
  SELECT jsonb_object_agg(
    f.field_key,
    CASE
      WHEN v.value_text IS NOT NULL THEN to_jsonb(v.value_text)
      WHEN v.value_number IS NOT NULL THEN to_jsonb(v.value_number)
      WHEN v.value_date IS NOT NULL THEN to_jsonb(v.value_date)
      WHEN v.value_boolean IS NOT NULL THEN to_jsonb(v.value_boolean)
      WHEN v.value_record_id IS NOT NULL THEN to_jsonb(v.value_record_id)
      ELSE 'null'::jsonb
    END
  )
  FROM company_table_fields f
  LEFT JOIN company_table_values v ON v.field_id = f.id AND v.record_id = p_record_id
  WHERE f.table_id = p_table_id AND f.deleted_at IS NULL;
$$ LANGUAGE sql STABLE;

-- auto_fed_recompute: branch system-table (real columns, r.col) vs
-- custom-table (pivoted jsonb, r->>'field_key') condition evaluation.
CREATE OR REPLACE FUNCTION auto_fed_recompute(p_registry_id uuid, p_record_id uuid) RETURNS void AS $$
DECLARE
  v_registry auto_fed_registries;
  v_rule auto_fed_rules;
  v_is_violated boolean;
  v_is_system boolean;
BEGIN
  SELECT * INTO v_registry FROM auto_fed_registries WHERE id = p_registry_id AND is_active;
  IF NOT FOUND THEN RETURN; END IF;

  v_is_system := v_registry.source_table_name IN ('entities', 'projects', 'properties');

  FOR v_rule IN SELECT * FROM auto_fed_rules WHERE registry_id = p_registry_id AND is_active ORDER BY display_order LOOP
    BEGIN
      IF v_is_system THEN
        EXECUTE format('SELECT (%s) FROM %I r WHERE r.id = $1', v_rule.condition_sql, v_registry.source_table_name) INTO v_is_violated USING p_record_id;
      ELSE
        EXECUTE format('SELECT (%s) FROM (SELECT auto_fed_custom_table_row($1, $2) AS r) t', v_rule.condition_sql)
          INTO v_is_violated USING v_registry.source_table_name::uuid, p_record_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_is_violated := NULL; -- a malformed rule (or the watched row no longer existing) never blocks the other rules
    END;
    PERFORM auto_fed_upsert_item(v_registry, v_rule, p_record_id, COALESCE(v_is_violated, false));
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- auto_fed_upsert_item: a custom-table source links via a 'table_relation'
-- field (not 'entity'/'project'/'property', which are system-table-only
-- relation types) -- and since a target table can be watched by more than
-- one custom-table source at once (each needing its OWN table_relation
-- column, disambiguated by linked_table_id), the link-field lookup now
-- matches on linked_table_id too when the type is table_relation.
CREATE OR REPLACE FUNCTION auto_fed_upsert_item(p_registry auto_fed_registries, p_rule auto_fed_rules, p_record_id uuid, p_is_violated boolean) RETURNS void AS $$
DECLARE
  v_is_system boolean := p_registry.source_table_name IN ('entities', 'projects', 'properties');
  v_link_field_type text := CASE p_registry.source_table_name WHEN 'entities' THEN 'entity' WHEN 'projects' THEN 'project' WHEN 'properties' THEN 'property' ELSE 'table_relation' END;
  v_f_link uuid; v_f_issue uuid; v_f_class uuid; v_f_detail uuid; v_f_status uuid; v_f_detected uuid; v_f_source_table uuid; v_f_target_key uuid;
  v_target_record_id uuid;
  v_page_id uuid;
BEGIN
  IF v_is_system THEN
    SELECT id INTO v_f_link FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_type = v_link_field_type AND deleted_at IS NULL LIMIT 1;
  ELSE
    SELECT id INTO v_f_link FROM company_table_fields WHERE table_id = p_registry.target_table_id AND field_type = 'table_relation' AND linked_table_id = p_registry.source_table_name::uuid AND deleted_at IS NULL LIMIT 1;
  END IF;
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
        INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
        VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_source_table,
          CASE WHEN v_is_system THEN initcap(p_registry.source_table_name)
               ELSE (SELECT name FROM company_tables WHERE id = p_registry.source_table_name::uuid) END);
      END IF;
      IF v_f_target_key IS NOT NULL AND p_rule.target_field_key IS NOT NULL THEN
        INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text) VALUES (p_registry.company_id, p_registry.target_table_id, v_target_record_id, v_f_target_key, p_rule.target_field_key);
      END IF;

      SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = p_registry.company_id AND source_table_id = p_registry.target_table_id AND page_kind = 'auto_fed' LIMIT 1;
      IF v_page_id IS NOT NULL THEN
        INSERT INTO client_update_page_items (page_id, custom_record_id, record_table, record_id, display_order)
        VALUES (v_page_id, v_target_record_id, p_registry.target_table_id::text, v_target_record_id, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM client_update_page_items WHERE page_id = v_page_id));
      END IF;
    END IF;
  ELSE
    IF v_target_record_id IS NOT NULL THEN
      UPDATE company_table_values SET value_text = 'Resolved', updated_at = now() WHERE record_id = v_target_record_id AND field_id = v_f_status;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Generic dispatch trigger for a custom-table source -- one shared trigger
-- on company_table_values (every custom table's cells, company-wide),
-- mirrors auto_fed_dispatch_custom_field_values's shape exactly. Never
-- fires for a write to an auto-fed TARGET table's own values (e.g.
-- Irregularities' own Status/Detected At) because no registry's
-- source_table_name is ever set to its own target_table_id -- so the
-- registry lookup below simply finds nothing for those writes, no separate
-- guard needed.
CREATE OR REPLACE FUNCTION auto_fed_dispatch_custom_table_values() RETURNS trigger AS $$
DECLARE
  v_row company_table_values := COALESCE(NEW, OLD);
  v_registry_id uuid;
BEGIN
  FOR v_registry_id IN
    SELECT id FROM auto_fed_registries WHERE source_table_name = v_row.table_id::text AND company_id = v_row.company_id AND is_active
  LOOP
    PERFORM auto_fed_recompute(v_registry_id, v_row.record_id);
  END LOOP;
  RETURN v_row;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_fed_dispatch_ctv ON company_table_values;
CREATE TRIGGER trg_auto_fed_dispatch_ctv
AFTER INSERT OR UPDATE OR DELETE ON company_table_values
FOR EACH ROW EXECUTE FUNCTION auto_fed_dispatch_custom_table_values();
