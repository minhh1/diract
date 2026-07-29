SET request.jwt.claim.role = 'service_role';

-- Reported live (Niksen Time): merged duplicate entities via the
-- Reconciliation tool, but some "Duplicate Name" irregularity rows stayed
-- Open. Investigation found a SECOND, independent bug beyond
-- 20260730000000's (which fixed the merge-recompute asymmetry and the
-- missing deleted_at filter): several entities have TWO existing
-- Irregularities rows for the exact same (entity, "Duplicate Name") pair,
-- with identical detected_at timestamps down to the microsecond (e.g.
-- entities 03418686-f490-4186-b7cb-cc1e800c9975 in the Niksen Irregularities
-- table has both a Resolved row and a still-Open row, created in the same
-- instant) -- almost certainly from two independent auto_fed_upsert_item
-- calls racing (the INSERT trigger firing plus the historical batch
-- backfill both detecting the same not-yet-existing violation before
-- either's insert was visible to the other).
--
-- auto_fed_upsert_item's own resolve branch is the reason this never
-- self-healed: it looks up "the" existing open item via a single query
-- capped at LIMIT 1, then only updates THAT one row to Resolved. With two
-- open rows for the same (entity, rule), every recompute (including
-- 20260730000000's own backfill) kept finding and resolving only one of
-- them, leaving its twin open forever.
--
-- Fix: the resolve branch now updates EVERY currently-open row matching
-- (link record, issue_type), not just one -- self-healing regardless of how
-- the duplicate row was created -- then re-run the recompute backfill so
-- already-affected entities (like Niksen's) clear immediately.
CREATE OR REPLACE FUNCTION auto_fed_upsert_item(p_registry auto_fed_registries, p_rule auto_fed_rules, p_record_id uuid, p_is_violated boolean) RETURNS void AS $$
DECLARE
  v_is_system boolean := p_registry.source_table_name IN ('entities', 'projects', 'properties');
  v_link_field_type text := CASE p_registry.source_table_name WHEN 'entities' THEN 'entity' WHEN 'projects' THEN 'project' WHEN 'properties' THEN 'property' ELSE 'table_relation' END;
  v_f_link uuid; v_f_issue uuid; v_f_class uuid; v_f_detail uuid; v_f_status uuid; v_f_detected uuid; v_f_source_table uuid; v_f_target_key uuid;
  v_target_record_id uuid;
  v_page_id uuid;
  v_table_slug text;
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

      SELECT slug INTO v_table_slug FROM company_tables WHERE id = p_registry.target_table_id;
      PERFORM notify_company_admins(
        p_registry.company_id,
        'irregularity_detected',
        p_rule.label,
        p_rule.detail,
        CASE WHEN v_table_slug IS NOT NULL THEN '/dashboard/' || v_table_slug ELSE NULL END,
        'company_table_records',
        v_target_record_id
      );
    END IF;
  ELSE
    -- Resolve EVERY currently-open row matching (link record, issue_type),
    -- not just the single one v_target_record_id happened to capture above
    -- -- see this migration's header for why more than one can exist.
    UPDATE company_table_values vs
    SET value_text = 'Resolved', updated_at = now()
    WHERE vs.field_id = v_f_status
      AND vs.value_text = 'Open'
      AND vs.record_id IN (
        SELECT r.id FROM company_table_records r
        JOIN company_table_values vl ON vl.record_id = r.id AND vl.field_id = v_f_link AND vl.value_record_id = p_record_id
        JOIN company_table_values vi ON vi.record_id = r.id AND vi.field_id = v_f_issue AND vi.value_text = p_rule.label
        WHERE r.table_id = p_registry.target_table_id AND r.deleted_at IS NULL
      );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Re-run the same backfill as 20260730000000 -- now that the resolve branch
-- fixed above updates every matching open row, this clears the specific
-- orphaned duplicates already found (e.g. Niksen's 03418686 entity) without
-- needing to hand-identify every affected row.
DO $$
DECLARE
  v_registry record;
  v_entity record;
BEGIN
  FOR v_registry IN
    SELECT DISTINCT reg.id, reg.company_id
    FROM auto_fed_registries reg
    JOIN auto_fed_rules ru ON ru.registry_id = reg.id AND ru.rule_key = 'duplicate_name'
    WHERE reg.is_active
  LOOP
    FOR v_entity IN SELECT id FROM entities WHERE company_id = v_registry.company_id AND deleted_at IS NULL LOOP
      PERFORM auto_fed_recompute(v_registry.id, v_entity.id);
    END LOOP;
  END LOOP;
END $$;
