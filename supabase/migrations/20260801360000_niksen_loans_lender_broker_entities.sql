SET request.jwt.claim.role = 'service_role';

-- 1. Convert Lender from plain text to an entity relation (linked_system_
-- table='entities'), so it's pickable/re-linkable the same way Project/
-- Borrower already are, instead of a free-typed name that can drift from
-- the real entities record. The actual value conversion (existing text ->
-- a matched-or-created entities row, written as value_record_id) happens
-- in a follow-up data script, not this migration -- this only widens the
-- schema.
--
-- 2. New Broker field, also an entity relation -- previously only living
-- as "Broker: X" free text inside Notes (see the original CSV import),
-- never a real column.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_loans_id uuid;
  v_page_id uuid;
BEGIN
  SELECT id INTO v_loans_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-loans' AND deleted_at IS NULL;
  IF v_loans_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-loans table not found for company %', v_company_id;
  END IF;

  UPDATE company_table_fields
  SET field_type = 'entity', linked_system_table = 'entities', linked_display_field = 'name'
  WHERE table_id = v_loans_id AND field_key = 'lender' AND deleted_at IS NULL;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_display_field, is_required, show_in_table, display_order)
  SELECT v_company_id, v_loans_id, 'broker', 'Broker', 'entity', 'entities', 'name', false, true, 17
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_loans_id AND x.field_key = 'broker' AND x.deleted_at IS NULL);

  -- Niksen Loans board: flip Lender's column to 'entity' too, and append
  -- Broker as a new column (after Lender, order 11 -- the existing 11
  -- columns run 0-10).
  SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = v_company_id AND slug = 'niksen-loans';
  IF v_page_id IS NOT NULL THEN
    UPDATE client_update_page_fields
    SET field_type = 'entity'
    WHERE page_id = v_page_id AND field_source = 'base' AND label = 'Lender';

    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
    SELECT v_page_id, 'base', ctf.id, 'Broker', 11, true, 'entity'
    FROM company_table_fields ctf
    WHERE ctf.table_id = v_loans_id AND ctf.field_key = 'broker' AND ctf.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM client_update_page_fields x WHERE x.page_id = v_page_id AND x.field_source = 'base' AND x.field_key = ctf.id::text);
  END IF;
END $$;
