SET request.jwt.claim.role = 'service_role';

-- Time-phasing fields for the cash-flow engine (lib/cashFlowEngine.ts) --
-- every budget line (cost OR revenue) gets a timing profile so its amount
-- can be spread across the months it actually lands in, instead of being
-- treated as instantaneous. linked_task_id is a plain text field storing
-- a tasks.id (NOT the generic company_table_fields relation-picker
-- system -- tasks is a real SQL table outside the custom-table registry,
-- and adding a new typed relation kind purely for this would mean
-- extending FieldConfigPanel/FieldValueInput/fieldCapabilities the same
-- way the abn/acn field type needed earlier -- overkill for one link).
-- The Cash Flow UI resolves/renders it by hand against the same task list
-- the Timeline subtab already fetches.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-budget-lines' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-budget-lines table not found for company %', v_company_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, select_options, is_required, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, v.select_options, false, true, v.ord
  FROM (VALUES
    ('linked_task_id', 'Linked Task', 'text', NULL::jsonb, 6),
    ('timing_profile', 'Timing Profile', 'select', '["Lump Sum at Start","Lump Sum at End","Even Spread","S-Curve"]'::jsonb, 7),
    ('timing_start_date', 'Timing Start', 'date', NULL::jsonb, 8),
    ('timing_end_date', 'Timing End', 'date', NULL::jsonb, 9)
  ) AS v(field_key, label, field_type, select_options, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
