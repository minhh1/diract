SET request.jwt.claim.role = 'service_role';

-- Finance Model Loan Phases: a free-text notes field, mirroring Loans'
-- own `notes` column. The source CSV's "Type of interest" text is often
-- messy prose ("IO for 5 years, then P&I", "holding funds for 15 months
-- as interest paid") that doesn't cleanly reduce to repayment_type +
-- dates -- notes preserves the original wording so nothing gets silently
-- dropped when a phase is derived from it.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_loan_phases_id uuid;
BEGIN
  SELECT id INTO v_loan_phases_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-loan-phases' AND deleted_at IS NULL;
  IF v_loan_phases_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-loan-phases table not found for company %', v_company_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, show_in_table, display_order)
  SELECT v_company_id, v_loan_phases_id, 'notes', 'Notes', 'text', false, true, 6
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_loan_phases_id AND x.field_key = 'notes' AND x.deleted_at IS NULL);
END $$;
