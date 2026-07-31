SET request.jwt.claim.role = 'service_role';

-- Saved, named "what-if" scenarios for the Feasibility calculator --
-- e.g. "Sale price -10%" -- beyond the auto-generated Conservative/Base/
-- Optimistic table (lib/feasibilityCalculator.ts's runScenarios). A row
-- here only stores the override deltas; outputs are always recomputed
-- live from the project's current feasibility-inputs + these overrides,
-- never cached, so a scenario stays correct if the base inputs change
-- later.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-feasibility-scenarios' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Feasibility Scenarios', 'finance-model-feasibility-scenarios', 'GitBranch', '#f59e0b', 'name')
    RETURNING id INTO v_table_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_display_field, is_required, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_display_field, v.is_required, true, v.ord
  FROM (VALUES
    ('project', 'Project', 'project', 'projects', 'name', true, 0),
    ('name', 'Name', 'text', NULL, NULL, true, 1),
    ('sale_price_delta_pct', 'Sale Price Change (%)', 'number', NULL, NULL, false, 2),
    ('sale_price_override', 'Sale Price Override ($)', 'currency', NULL, NULL, false, 3),
    ('construction_cost_delta_pct', 'Construction Cost Change (%)', 'number', NULL, NULL, false, 4),
    ('notes', 'Notes', 'text', NULL, NULL, false, 5)
  ) AS v(field_key, label, field_type, linked_system_table, linked_display_field, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
