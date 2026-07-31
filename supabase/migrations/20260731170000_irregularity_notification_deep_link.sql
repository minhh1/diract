SET request.jwt.claim.role = 'service_role';

-- Points the irregularity_detected notification's link straight at the new
-- irregularity's fix panel (components/clientUpdatePages/MatterBoard.tsx's
-- new initialFixItemId prop, threaded from app/public/updates/[slug]/
-- page.tsx's ?itemId= query param) instead of the auto_fed target table's
-- generic /dashboard/<slug> list view -- clicking the notification used to
-- just land you on the board with no indication of which row to look at or
-- any fix UI open at all.
--
-- Captures the newly-inserted client_update_page_items.id (RETURNING) and
-- the board's own slug, building /public/updates/<slug>?itemId=<item_id>
-- when a client_update_page exists for this target table (the normal
-- case); falls back to the old /dashboard/<table_slug> link on the rare
-- target table with no matching board at all, same as before.
--
-- Full function body copied from its current definition
-- (20260730010000_fix_auto_fed_duplicate_open_items.sql, the latest of
-- several CREATE OR REPLACEs of this function -- confirmed no later one
-- exists) with only the notify_company_admins call's link_url changed.
CREATE OR REPLACE FUNCTION auto_fed_upsert_item(p_registry auto_fed_registries, p_rule auto_fed_rules, p_record_id uuid, p_is_violated boolean) RETURNS void AS $$
DECLARE
  v_is_system boolean := p_registry.source_table_name IN ('entities', 'projects', 'properties');
  v_link_field_type text := CASE p_registry.source_table_name WHEN 'entities' THEN 'entity' WHEN 'projects' THEN 'project' WHEN 'properties' THEN 'property' ELSE 'table_relation' END;
  v_f_link uuid; v_f_issue uuid; v_f_class uuid; v_f_detail uuid; v_f_status uuid; v_f_detected uuid; v_f_source_table uuid; v_f_target_key uuid;
  v_target_record_id uuid;
  v_page_id uuid;
  v_page_slug text;
  v_item_id uuid;
  v_table_slug text;
  v_link_url text;
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

      SELECT id, slug INTO v_page_id, v_page_slug FROM client_update_pages WHERE company_id = p_registry.company_id AND source_table_id = p_registry.target_table_id AND page_kind = 'auto_fed' LIMIT 1;
      IF v_page_id IS NOT NULL THEN
        INSERT INTO client_update_page_items (page_id, custom_record_id, record_table, record_id, display_order)
        VALUES (v_page_id, v_target_record_id, p_registry.target_table_id::text, v_target_record_id, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM client_update_page_items WHERE page_id = v_page_id))
        RETURNING id INTO v_item_id;
      END IF;

      -- Prefer a direct deep link to the item's fix panel; fall back to the
      -- generic table view on the (rare) target table with no matching
      -- client_update_page at all.
      IF v_page_slug IS NOT NULL AND v_item_id IS NOT NULL THEN
        v_link_url := '/public/updates/' || v_page_slug || '?itemId=' || v_item_id::text;
      ELSE
        SELECT slug INTO v_table_slug FROM company_tables WHERE id = p_registry.target_table_id;
        v_link_url := CASE WHEN v_table_slug IS NOT NULL THEN '/dashboard/' || v_table_slug ELSE NULL END;
      END IF;

      PERFORM notify_company_admins(
        p_registry.company_id,
        'irregularity_detected',
        p_rule.label,
        p_rule.detail,
        v_link_url,
        'company_table_records',
        v_target_record_id
      );
    END IF;
  ELSE
    -- Resolve EVERY currently-open row matching (link record, issue_type),
    -- not just the single one v_target_record_id happened to capture above
    -- -- see 20260730010000's header for why more than one can exist.
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
