SET request.jwt.claim.role = 'service_role';

-- One-row-per-project inputs for the Feasibility calculator (see
-- lib/feasibilityCalculator.ts) -- a scoped-down PropDEV-style calculator
-- (dwellings/size/rates/percentages in, cost breakdown + margin/ROE/IRR
-- out). No defaults baked in here -- every field starts blank until the
-- user enters it, so nothing is silently fabricated. Same custom-table
-- provisioning pattern as 20260801110000_niksen_finance_model_settings_table.sql.
-- Niksen is already at the default 10-table cap (2 pre-existing + 6 from
-- the Finance Model v2 migration + Settings) -- this batch adds 2 more
-- (Feasibility Inputs + Feasibility Scenarios), so raise the cap first,
-- same guarded/idempotent bump as 20260731100000_trust_account_page.sql.
UPDATE companies SET max_custom_tables = 20
  WHERE id = '32d4fb0e-007d-41e7-bc5e-638163c28e3d' AND max_custom_tables < 20;

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-feasibility-inputs' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Feasibility Inputs', 'finance-model-feasibility-inputs', 'Calculator', '#10b981', 'project')
    RETURNING id INTO v_table_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_display_field, is_required, is_unique, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_display_field, v.is_required, v.is_unique, true, v.ord
  FROM (VALUES
    ('project', 'Project', 'project', 'projects', 'name', true, true, 0),
    ('dwellings_count', 'Number of Dwellings', 'number', NULL, NULL, false, false, 1),
    ('avg_dwelling_size_sqm', 'Average Dwelling Size (sqm)', 'number', NULL, NULL, false, false, 2),
    ('site_area_sqm', 'Site Area (sqm)', 'number', NULL, NULL, false, false, 3),
    ('expected_sale_price_per_dwelling', 'Expected Sale Price per Dwelling', 'currency', NULL, NULL, false, false, 4),
    ('construction_rate_per_sqm', 'Construction Rate ($/sqm)', 'currency', NULL, NULL, false, false, 5),
    ('professional_fees_pct', 'Professional Fees (% of Construction)', 'number', NULL, NULL, false, false, 6),
    ('contingency_pct', 'Contingency (% of Construction)', 'number', NULL, NULL, false, false, 7),
    ('marketing_selling_pct', 'Marketing & Selling (% of Revenue)', 'number', NULL, NULL, false, false, 8),
    ('other_acquisition_costs', 'Other Acquisition Costs (legal, DD, etc.)', 'currency', NULL, NULL, false, false, 9),
    ('holding_costs_annual', 'Holding Costs (per annum)', 'currency', NULL, NULL, false, false, 10),
    ('project_duration_months', 'Project Duration (months)', 'number', NULL, NULL, false, false, 11),
    ('interest_rate_pct', 'Interest Rate (% p.a.)', 'number', NULL, NULL, false, false, 12),
    ('loan_to_cost_pct', 'Loan to Cost (%)', 'number', NULL, NULL, false, false, 13),
    ('target_margin_pct', 'Target Margin on Cost (%)', 'number', NULL, NULL, false, false, 14)
  ) AS v(field_key, label, field_type, linked_system_table, linked_display_field, is_required, is_unique, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
