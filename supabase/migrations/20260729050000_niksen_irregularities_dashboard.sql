SET request.jwt.claim.role = 'service_role';

-- Restricts a dashboard to company_admin + the leader of one team, in
-- addition to (not instead of) the existing company-wide RLS on
-- company_dashboards -- enforced app-side in app/dashboard/boards/[slug]/page.tsx
-- and lib/hooks/useCustomDashboards.ts, the same way every other role-gated
-- page in this app (billing, admin) already only gates in the UI rather
-- than via RLS. NULL (the default) means every company member can see it,
-- same as today for every existing dashboard.
ALTER TABLE company_dashboards ADD COLUMN IF NOT EXISTS restricted_to_team_id uuid REFERENCES teams(id) ON DELETE SET NULL;

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
  v_team_id uuid;
  v_f_entity uuid; v_f_issue uuid; v_f_class uuid; v_f_detail uuid; v_f_status uuid; v_f_detected uuid;
  v_grid_fields jsonb;
  v_widgets jsonb;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL;
  SELECT id INTO v_team_id FROM teams WHERE company_id = v_company_id AND team_name = 'Administration Team';
  IF v_table_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_f_entity   FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'entity' AND deleted_at IS NULL;
  SELECT id INTO v_f_issue    FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'issue_type' AND deleted_at IS NULL;
  SELECT id INTO v_f_class    FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'classification' AND deleted_at IS NULL;
  SELECT id INTO v_f_detail   FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'detail' AND deleted_at IS NULL;
  SELECT id INTO v_f_status   FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'status' AND deleted_at IS NULL;
  SELECT id INTO v_f_detected FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'detected_at' AND deleted_at IS NULL;

  v_grid_fields := jsonb_build_array(v_f_entity, v_f_issue, v_f_detail, v_f_status, v_f_detected);

  v_widgets := jsonb_build_array(
    jsonb_build_object('id', 'heading-important', 'type', 'heading', 'layout', jsonb_build_object('x', 0, 'y', 0, 'w', 12, 'h', 1),
      'config', jsonb_build_object('text', 'Important — missing Trust link', 'level', 2)),
    jsonb_build_object('id', 'grid-important', 'type', 'grid', 'layout', jsonb_build_object('x', 0, 'y', 1, 'w', 12, 'h', 6),
      'config', jsonb_build_object('fieldIds', v_grid_fields, 'conditions', jsonb_build_array(
        jsonb_build_object('fieldId', v_f_class, 'operator', 'eq', 'value', 'Important'),
        jsonb_build_object('fieldId', v_f_status, 'operator', 'eq', 'value', 'Open')))),
    jsonb_build_object('id', 'heading-moderate', 'type', 'heading', 'layout', jsonb_build_object('x', 0, 'y', 7, 'w', 12, 'h', 1),
      'config', jsonb_build_object('text', 'Moderate — incomplete established date', 'level', 2)),
    jsonb_build_object('id', 'grid-moderate', 'type', 'grid', 'layout', jsonb_build_object('x', 0, 'y', 8, 'w', 12, 'h', 6),
      'config', jsonb_build_object('fieldIds', v_grid_fields, 'conditions', jsonb_build_array(
        jsonb_build_object('fieldId', v_f_class, 'operator', 'eq', 'value', 'Moderate'),
        jsonb_build_object('fieldId', v_f_status, 'operator', 'eq', 'value', 'Open')))),
    jsonb_build_object('id', 'heading-minor', 'type', 'heading', 'layout', jsonb_build_object('x', 0, 'y', 14, 'w', 12, 'h', 1),
      'config', jsonb_build_object('text', 'Minor — missing GST report frequency', 'level', 2)),
    jsonb_build_object('id', 'grid-minor', 'type', 'grid', 'layout', jsonb_build_object('x', 0, 'y', 15, 'w', 12, 'h', 6),
      'config', jsonb_build_object('fieldIds', v_grid_fields, 'conditions', jsonb_build_array(
        jsonb_build_object('fieldId', v_f_class, 'operator', 'eq', 'value', 'Minor'),
        jsonb_build_object('fieldId', v_f_status, 'operator', 'eq', 'value', 'Open'))))
  );

  IF NOT EXISTS (SELECT 1 FROM company_dashboards WHERE company_id = v_company_id AND slug = 'irregularities' AND deleted_at IS NULL) THEN
    INSERT INTO company_dashboards (company_id, name, slug, icon, color, source_table_id, widgets, restricted_to_team_id, builder_mode)
    VALUES (v_company_id, 'Irregularities', 'irregularities', 'AlertTriangle', '#ef4444', v_table_id, v_widgets, v_team_id, 'canvas');
  END IF;
END $$;
