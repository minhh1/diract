SET request.jwt.claim.role = 'service_role';

-- Adds Status (tick between Open/Resolved -- see values route change for
-- why this is the one custom_table field this page allows editing) and
-- Detected At (so staff can sort the board by time, via MatterBoard's
-- existing generic Sort-by section -- no new sort code needed once this is
-- a configured column) to the Irregularities board.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_source_table_id uuid;
  v_page_id uuid;
  v_f_status uuid; v_f_detected uuid;
BEGIN
  SELECT id INTO v_source_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = v_company_id AND slug = 'niksen-irregularities';
  IF v_page_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_f_status   FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'status' AND deleted_at IS NULL;
  SELECT id INTO v_f_detected FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'detected_at' AND deleted_at IS NULL;

  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
  SELECT v_page_id, 'base', v.field_id, v.label, v.ord, true, v.field_type, v.select_options
  FROM (VALUES
    (v_f_status, 'Status', 4, 'select', '["Open","Resolved"]'::jsonb),
    (v_f_detected, 'Detected At', 5, 'date', NULL::jsonb)
  ) AS v(field_id, label, ord, field_type, select_options)
  WHERE NOT EXISTS (SELECT 1 FROM client_update_page_fields x WHERE x.page_id = v_page_id AND x.field_source = 'base' AND x.field_key = v.field_id::text);
END $$;
