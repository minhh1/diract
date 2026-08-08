-- Fixes sync_template_tables_from_company (20260808180000): this database
-- rejects a bare DELETE with no WHERE clause even on a temp table ("DELETE
-- requires a WHERE clause", confirmed live on first real call) -- the
-- established convention elsewhere (install_company_template's own
-- tmp_template_table_map) already uses TRUNCATE for exactly this reason.
CREATE OR REPLACE FUNCTION sync_template_tables_from_company(p_template_id uuid, p_table_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_owner uuid;
  v_tbl RECORD;
  v_template_table_id uuid;
  v_created int := 0;
  v_updated int := 0;
BEGIN
  SELECT owner_company_id INTO v_owner FROM template_definitions WHERE id = p_template_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'template not found'; END IF;
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_owner AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'only members of the template''s owner company can add to it';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_export_table_map (source_id uuid PRIMARY KEY, template_table_id uuid) ON COMMIT DROP;
  TRUNCATE tmp_export_table_map;

  FOR v_tbl IN SELECT * FROM company_tables WHERE id = ANY(p_table_ids) AND company_id = v_owner AND deleted_at IS NULL LOOP
    SELECT id INTO v_template_table_id FROM template_definition_tables WHERE template_id = p_template_id AND slug = v_tbl.slug;
    IF v_template_table_id IS NOT NULL THEN
      UPDATE template_definition_tables SET
        name = v_tbl.name, icon = v_tbl.icon, color = v_tbl.color, primary_field_key = v_tbl.primary_field_key,
        is_ledger = v_tbl.is_ledger, disable_record_dashboard = v_tbl.disable_record_dashboard
      WHERE id = v_template_table_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
        VALUES (p_template_id, v_tbl.slug, v_tbl.name, v_tbl.icon, v_tbl.color, v_tbl.primary_field_key,
          (SELECT COALESCE(MAX(display_order), -1) + 1 FROM template_definition_tables WHERE template_id = p_template_id),
          v_tbl.is_ledger, v_tbl.disable_record_dashboard)
        RETURNING id INTO v_template_table_id;
      v_created := v_created + 1;
    END IF;
    INSERT INTO tmp_export_table_map (source_id, template_table_id) VALUES (v_tbl.id, v_template_table_id);
  END LOOP;

  FOR v_tbl IN SELECT * FROM tmp_export_table_map LOOP
    DELETE FROM template_definition_table_fields WHERE template_table_id = v_tbl.template_table_id;
    INSERT INTO template_definition_table_fields (
      template_table_id, field_key, label, field_type, select_options,
      linked_template_table_id, linked_system_table, linked_display_field,
      is_required, is_unique, show_in_table, display_order, section_name, help_text,
      auto_number_prefix, auto_number_start, auto_number_pad, default_value,
      linked_filter_column, linked_filter_value
    )
    SELECT
      v_tbl.template_table_id, f.field_key, f.label, f.field_type, f.select_options,
      (SELECT m.template_table_id FROM tmp_export_table_map m WHERE m.source_id = f.linked_table_id),
      f.linked_system_table, f.linked_display_field,
      f.is_required, f.is_unique, f.show_in_table, f.display_order, f.section_name, f.help_text,
      f.auto_number_prefix, f.auto_number_start, f.auto_number_pad, f.default_value,
      f.linked_filter_column, f.linked_filter_value
    FROM company_table_fields f
    WHERE f.table_id = v_tbl.source_id AND f.deleted_at IS NULL;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated);
END;
$$;
