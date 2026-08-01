SET request.jwt.claim.role = 'service_role';

-- Finance Model Loans: a boolean "discharged" flag so paid-off/closed
-- facilities can be visually de-emphasized in the Loans list (gray text +
-- badge) instead of the user having to infer status from repayment_date or
-- free-text notes. Also stops a discharged loan from being mistaken for a
-- live encumbrance when reasoning about Senior/Mezzanine ordering on a
-- project -- a paid-off bank loan no longer subordinates anything.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_loans_id uuid;
BEGIN
  SELECT id INTO v_loans_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-loans' AND deleted_at IS NULL;
  IF v_loans_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-loans table not found for company %', v_company_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, show_in_table, display_order)
  SELECT v_company_id, v_loans_id, 'is_discharged', 'Discharged', 'boolean', false, true, 15
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_loans_id AND x.field_key = 'is_discharged' AND x.deleted_at IS NULL);
END $$;
