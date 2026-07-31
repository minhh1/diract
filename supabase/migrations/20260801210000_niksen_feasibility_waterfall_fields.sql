SET request.jwt.claim.role = 'service_role';

-- Equity waterfall parameters (lib/equityWaterfall.ts) -- only meaningful
-- once the project has a "Money Partner" lender_type loan (JV/investor
-- capital, per the Loans table's existing lender_type enum) to run the
-- return-of-capital -> preferred-return -> promote tiers against; the UI
-- panel stays hidden with no such loan on the project.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-feasibility-inputs' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-feasibility-inputs table not found for company %', v_company_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, false, true, v.ord
  FROM (VALUES
    ('preferred_return_pct', 'Preferred Return (% p.a., compounding)', 'number', 18),
    ('promote_pct', 'GP Promote on Residual Profit (%)', 'number', 19)
  ) AS v(field_key, label, field_type, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
