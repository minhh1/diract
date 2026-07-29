SET request.jwt.claim.role = 'service_role';

-- Follow-up to 20260729390000_irregularities_all_companies.sql: that
-- migration created each new company's Irregularities company_tables board
-- and its underlying company_table_fields, but never added any
-- client_update_page_fields rows -- the columns that actually control what
-- shows on the Client Update Page itself. Items existed but rendered with
-- zero visible columns (confirmed live: 548 items, 0 fields, on Huynh
-- Lawyers' new board). Mirrors Niksen's own page's exact column set
-- (Table/Name/Type/Seriousness/Status/Detected At -- target_field_key and
-- property are deliberately never surfaced as page columns there either).
DO $migration$
DECLARE
  v_page record;
  v_field_id uuid;
BEGIN
  FOR v_page IN
    SELECT cup.id AS page_id, cup.source_table_id AS table_id
    FROM client_update_pages cup
    WHERE cup.page_kind = 'auto_fed'
      AND cup.company_id IN (
        SELECT id FROM companies WHERE name IN ('Law Firm QA Co', 'PDF Editor Test Co', 'Huynh Lawyers')
      )
      AND NOT EXISTS (SELECT 1 FROM client_update_page_fields WHERE page_id = cup.id)
  LOOP
    SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_page.table_id AND field_key = 'source_table';
    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
    VALUES (v_page.page_id, 'base', v_field_id::text, 'Table', 0, true, 'text');

    SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_page.table_id AND field_key = 'entity';
    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
    VALUES (v_page.page_id, 'base', v_field_id::text, 'Name', 1, true, 'text');

    SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_page.table_id AND field_key = 'issue_type';
    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
    VALUES (v_page.page_id, 'base', v_field_id::text, 'Type', 2, true, 'select', '["Missing Street Address","Missing Trust Link","Incomplete Established Date","Missing GST Report Frequency","Invalid TFN","Incomplete Name","Duplicate Name"]'::jsonb);

    SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_page.table_id AND field_key = 'classification';
    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
    VALUES (v_page.page_id, 'base', v_field_id::text, 'Seriousness', 3, true, 'select', '["Important","Moderate","Minor"]'::jsonb);

    SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_page.table_id AND field_key = 'status';
    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
    VALUES (v_page.page_id, 'base', v_field_id::text, 'Status', 4, true, 'select', '["Open","Resolved"]'::jsonb);

    SELECT id INTO v_field_id FROM company_table_fields WHERE table_id = v_page.table_id AND field_key = 'detected_at';
    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
    VALUES (v_page.page_id, 'base', v_field_id::text, 'Detected At', 5, true, 'text');
  END LOOP;
END $migration$;
