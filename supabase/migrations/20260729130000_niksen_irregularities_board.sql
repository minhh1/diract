SET request.jwt.claim.role = 'service_role';

-- Rebuilds the Irregularities dashboard on the same system as the Entity
-- Admin board (client_update_pages/MatterBoard, base_table='custom_table' --
-- see 20260729120000) instead of the original grid-widget dashboard, for
-- UI parity: checkbox filters (Type, Seriousness), color coding, sorting,
-- all free from MatterBoard's existing Filters/Formatting/Sort-by sections.
-- 4 columns per spec: Table, Name, Type, Seriousness. No "add" (items are
-- trigger-generated) and no direct cell editing (see the fix-panel work) --
-- both already enforced generically for any custom_table page.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_source_table_id uuid;
  v_page_id uuid;
  v_f_source_table uuid; v_f_entity uuid; v_f_issue uuid; v_f_class uuid;
  v_field_source_table_page uuid; v_field_entity_page uuid; v_field_issue_page uuid; v_field_class_page uuid;
BEGIN
  SELECT id INTO v_source_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;

  -- Retire the original grid-widget dashboard -- same name, replaced.
  UPDATE company_dashboards SET deleted_at = now()
  WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;

  SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = v_company_id AND slug = 'niksen-irregularities';
  IF v_page_id IS NULL THEN
    INSERT INTO client_update_pages (company_id, title, client_label, slug, access_code, is_active, date_format, freeze_first_column, base_table, source_table_id)
    VALUES (v_company_id, 'Niksen Irregularities', 'Niksen Admin', 'niksen-irregularities', lpad(floor(random() * 1000000)::text, 6, '0'), true, 'D_MMM_YYYY', true, 'custom_table', v_source_table_id)
    RETURNING id INTO v_page_id;
  END IF;

  SELECT id INTO v_f_source_table FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'source_table' AND deleted_at IS NULL;
  SELECT id INTO v_f_entity       FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'entity' AND deleted_at IS NULL;
  SELECT id INTO v_f_issue        FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'issue_type' AND deleted_at IS NULL;
  SELECT id INTO v_f_class        FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'classification' AND deleted_at IS NULL;

  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
  SELECT v_page_id, 'base', v.field_id, v.label, v.ord, true, v.field_type, v.select_options
  FROM (VALUES
    (v_f_source_table, 'Table', 0, 'text', NULL::jsonb),
    -- field_type 'text' (not 'entity') -- client_update_page_fields.field_type
    -- only allows display-oriented types (matches how a projects page's
    -- 'related_entity' field_source is also always marked 'text', see
    -- .../fields/route.ts); resolveValue in lib/clientUpdatePageDetail.ts
    -- already resolves this to the linked entity's plain name string.
    (v_f_entity, 'Name', 1, 'text', NULL::jsonb),
    (v_f_issue, 'Type', 2, 'select', '["Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency","Invalid TFN"]'::jsonb),
    (v_f_class, 'Seriousness', 3, 'select', '["Important","Moderate","Minor"]'::jsonb)
  ) AS v(field_id, label, ord, field_type, select_options)
  WHERE NOT EXISTS (SELECT 1 FROM client_update_page_fields x WHERE x.page_id = v_page_id AND x.field_source = 'base' AND x.field_key = v.field_id::text);

  SELECT id INTO v_field_class_page FROM client_update_page_fields WHERE page_id = v_page_id AND field_key = v_f_class::text;

  INSERT INTO client_update_page_format_rules (page_id, field_id, value, color, display_order)
  SELECT v_page_id, v_field_class_page, v.value, v.color, v.ord
  FROM (VALUES ('Important', 'red', 0), ('Moderate', 'amber', 1), ('Minor', 'blue', 2)) AS v(value, color, ord)
  WHERE NOT EXISTS (SELECT 1 FROM client_update_page_format_rules x WHERE x.page_id = v_page_id AND x.field_id = v_field_class_page AND x.value = v.value);

  -- Seed items for every irregularity that already exists.
  INSERT INTO client_update_page_items (page_id, custom_record_id, display_order)
  SELECT v_page_id, r.id, row_number() OVER (ORDER BY r.created_at)
  FROM company_table_records r
  WHERE r.table_id = v_source_table_id AND r.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM client_update_page_items x WHERE x.page_id = v_page_id AND x.custom_record_id = r.id);

  -- Dashboard widget, restricted to Niksen's Administration Team + admins.
  IF NOT EXISTS (SELECT 1 FROM company_dashboards WHERE company_id = v_company_id AND slug = 'niksen-irregularities' AND deleted_at IS NULL) THEN
    INSERT INTO company_dashboards (company_id, name, slug, icon, color, source_table_type, widgets, restricted_to_team_id, builder_mode)
    SELECT v_company_id, 'Irregularities', 'niksen-irregularities', 'AlertTriangle', '#ef4444', 'none',
      jsonb_build_array(jsonb_build_object(
        'id', 'irregularities-board', 'type', 'public_client_update_page',
        'layout', jsonb_build_object('x', 0, 'y', 0, 'w', 12, 'h', 20),
        'config', jsonb_build_object('slug', 'niksen-irregularities')
      )),
      (SELECT id FROM teams WHERE company_id = v_company_id AND team_name = 'Administration Team'),
      'canvas';
  END IF;
END $$;

-- Auto-add each newly-created irregularity as an item on this page going
-- forward -- items are otherwise never manually added (see .../items/route.ts's
-- custom_table guard), so without this, a NEW irregularity would exist in
-- the underlying table but never actually show up on the board.
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
  v_page_id uuid;
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

      SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = p_company_id AND slug = 'niksen-irregularities';
      IF v_page_id IS NOT NULL THEN
        INSERT INTO client_update_page_items (page_id, custom_record_id, display_order)
        VALUES (v_page_id, v_record_id, (SELECT COALESCE(MAX(display_order), 0) + 1 FROM client_update_page_items WHERE page_id = v_page_id));
      END IF;
    END IF;
  ELSE
    IF v_record_id IS NOT NULL THEN
      UPDATE company_table_values SET value_text = 'Resolved', updated_at = now() WHERE record_id = v_record_id AND field_id = p_field_status_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;
