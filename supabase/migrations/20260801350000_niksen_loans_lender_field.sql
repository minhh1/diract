SET request.jwt.claim.role = 'service_role';

-- Finance Model Loans: a plain-text "Lender" field for the actual lending
-- entity's name (e.g. "NAB", "GAP", "Blue Streak Private Funding") --
-- distinct from lender_type, which is the coarse category (Senior/
-- Mezzanine/Private Lender/Money Partner/Other). Text, not an entity
-- relation: most lenders here (banks, private mortgage companies) were
-- never imported as `entities` rows -- those are Niksen's own related-
-- party/portfolio entities, not third-party lenders -- so a relation
-- field would mean creating ~30-40 new entity records for no real
-- benefit over a name string.
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

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, show_in_table, display_order)
  SELECT v_company_id, v_loans_id, 'lender', 'Lender', 'text', false, true, 16
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_loans_id AND x.field_key = 'lender' AND x.deleted_at IS NULL);

  -- Add it to the Niksen Loans board too, appended after the existing 10
  -- columns (0-9) rather than reshuffling their display_order values.
  SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = v_company_id AND slug = 'niksen-loans';
  IF v_page_id IS NOT NULL THEN
    INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
    SELECT v_page_id, 'base', ctf.id, 'Lender', 10, true, 'text'
    FROM company_table_fields ctf
    WHERE ctf.table_id = v_loans_id AND ctf.field_key = 'lender' AND ctf.deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM client_update_page_fields x WHERE x.page_id = v_page_id AND x.field_source = 'base' AND x.field_key = ctf.id::text);
  END IF;
END $$;
