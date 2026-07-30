SET request.jwt.claim.role = 'service_role';

-- Settlement Date used to just be a Conveyancing-only display label on the
-- shared projects.estimated_completion_date column (see lib/fieldLabels.ts,
-- now removed) -- that column also drives checklist/task due-dates,
-- templates, imports, and relation pickers for EVERY matter type, so it
-- can't be repurposed. This gives Settlement Date its own genuinely
-- independent field instead, per-(project, property) like Purchase Price
-- (see 20260729360000_project_property_values.sql) -- a matter with 2+
-- linked properties can have a different settlement date per property, and
-- a resold property never keeps a past matter's settlement date attached to
-- it. estimated_completion_date itself, and everything that reads it, is
-- untouched.
DO $$
DECLARE
  v_company_id uuid := 'a49b484d-100d-4c3e-b3b6-69c1a18cc783'; -- Huynh Lawyers, same company 20260729360000_project_property_values.sql set this up for
  v_max_order int;
  v_matter_type_field_id uuid;
  v_settlement_field_id uuid;
BEGIN
  SELECT COALESCE(MAX(display_order), 0) INTO v_max_order FROM company_custom_fields WHERE table_name = 'project_properties' AND company_id = v_company_id AND deleted_at IS NULL;

  INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, display_order)
  SELECT v_company_id, 'project_properties', 'settlement_date', 'Settlement Date', 'date', v_max_order + 1
  WHERE NOT EXISTS (
    SELECT 1 FROM company_custom_fields WHERE company_id = v_company_id AND table_name = 'project_properties' AND field_key = 'settlement_date' AND deleted_at IS NULL
  );

  SELECT id INTO v_settlement_field_id FROM company_custom_fields
  WHERE company_id = v_company_id AND table_name = 'project_properties' AND field_key = 'settlement_date' AND deleted_at IS NULL;

  SELECT id INTO v_matter_type_field_id FROM company_custom_fields
  WHERE company_id = v_company_id AND table_name = 'projects' AND field_key = 'matter_type' AND deleted_at IS NULL;

  -- Backfill from estimated_completion_date -- Conveyancing matters only,
  -- and (matching the purchase_price precedent) only for a project with
  -- EXACTLY ONE linked property, since a multi-property matter's old single
  -- date has no unambiguous property to attach to.
  IF v_settlement_field_id IS NOT NULL AND v_matter_type_field_id IS NOT NULL THEN
    INSERT INTO project_property_values (company_id, project_property_id, field_id, value_date)
    SELECT v_company_id, pp.id, v_settlement_field_id, p.estimated_completion_date
    FROM project_properties pp
    JOIN projects p ON p.id = pp.project_id
    JOIN company_custom_field_values ccv ON ccv.field_id = v_matter_type_field_id AND ccv.record_id = p.id
    WHERE pp.company_id = v_company_id
      AND ccv.value_text = 'Conveyancing'
      AND p.estimated_completion_date IS NOT NULL
      AND (SELECT count(*) FROM project_properties pp2 WHERE pp2.project_id = pp.project_id) = 1
    ON CONFLICT (project_property_id, field_id) DO NOTHING;
  END IF;
END $$;
