SET request.jwt.claim.role = 'service_role';

-- Construction facility parameters for the debt-drawdown simulation
-- (lib/cashFlowEngine.ts's simulateFacility) -- distinct from the
-- existing interest_rate_pct/loan_to_cost_pct pair, which drive the
-- older parametric (instant, non-dated) Peak Debt approximation in
-- lib/feasibilityCalculator.ts. facility_limit is the hard cap on drawn
-- balance; max_lvr_pct is informational only (flagged when breached, not
-- enforced -- the limit is what mechanically constrains drawdown).
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
    ('facility_limit', 'Facility Limit ($)', 'currency', 15),
    ('facility_interest_rate_pct', 'Facility Interest Rate (% p.a.)', 'number', 16),
    ('max_lvr_pct', 'Max LVR Covenant (%)', 'number', 17)
  ) AS v(field_key, label, field_type, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
