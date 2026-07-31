SET request.jwt.claim.role = 'service_role';

-- One-row-per-project settings for the Feasibility subtab -- currently just
-- the GST treatment method, which changes how GST Collected/Input Tax
-- Credits are computed from the project's existing Budget Lines (see
-- lib/financeModel/feasibility.ts). Kept as its own tiny custom table
-- rather than a field bolted onto Budget Lines (which is per-line, not
-- per-project) or Loans (unrelated concern) -- per the "custom tables
-- only" instruction from earlier this session, and matching the
-- Niksen-scoped direct-provisioning pattern of
-- 20260729280000_niksen_contacts_table_and_rule.sql.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-settings' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Settings', 'finance-model-settings', 'Settings', '#64748b', 'project')
    RETURNING id INTO v_table_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_display_field, select_options, is_required, is_unique, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_display_field, v.select_options, v.is_required, v.is_unique, true, v.ord
  FROM (VALUES
    ('project', 'Project', 'project', 'projects', 'name', NULL::jsonb, true, true, 0),
    ('gst_method', 'GST Method', 'select', NULL, NULL, '["Margin Scheme","Standard (1/11th)","GST-free"]'::jsonb, false, false, 1)
  ) AS v(field_key, label, field_type, linked_system_table, linked_display_field, select_options, is_required, is_unique, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
