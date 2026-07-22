-- Extends revert_schema_change's company_dashboard case to restore the new
-- widgets/code_source/builder_mode columns (see company_dashboards_widgets.sql)
-- on an update-undo, the same way it already restores name/slug/icon/etc.
-- Deliberately excludes widgets_migrated_at -- that's one-time migration
-- bookkeeping, not user-authored content, and restoring it verbatim from an
-- old snapshot could wrongly reset an already-migrated row back to
-- unmigrated (harmless since the conversion is idempotent, but no reason to
-- churn it).
--
-- Known, accepted limitation (same pre-existing gap as company_table_fields'
-- formula columns in company_dashboards_revert.sql): schema_change_log
-- entries recorded before this migration ships won't have these keys in
-- their `before` snapshot, so jsonb_populate_record will populate them as
-- NULL/default if a revert reaches back past one of those old entries.

CREATE OR REPLACE FUNCTION revert_schema_change(
  p_company_id uuid,
  p_log_seq bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor_id uuid := auth.uid();
  v_row schema_change_log%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM schema_change_log WHERE company_id = p_company_id AND seq = p_log_seq
  ) THEN
    RAISE EXCEPTION 'log entry % not found for company %', p_log_seq, p_company_id;
  END IF;

  FOR v_row IN
    SELECT * FROM schema_change_log
    WHERE company_id = p_company_id AND seq > p_log_seq
    ORDER BY seq DESC
  LOOP
    CASE v_row.entity_type

      WHEN 'company_table' THEN
        IF v_row.action = 'create' THEN
          UPDATE company_tables SET deleted_at = now() WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          UPDATE company_tables SET deleted_at = NULL WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'update' THEN
          UPDATE company_tables t SET
            (name, slug, icon, color, primary_field_key, display_order) =
            (SELECT name, slug, icon, color, primary_field_key, display_order
             FROM jsonb_populate_record(null::company_tables, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

      WHEN 'company_table_field' THEN
        IF v_row.action = 'create' THEN
          UPDATE company_table_fields SET deleted_at = now() WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          UPDATE company_table_fields SET deleted_at = NULL WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'update' THEN
          UPDATE company_table_fields t SET
            (field_key, label, field_type, select_options, linked_table_id, linked_system_table,
             linked_display_field, is_required, is_unique, show_in_table, display_order, section_name, help_text,
             formula_type, formula_field_a_id, formula_field_b_id, formula_percent) =
            (SELECT field_key, label, field_type, select_options, linked_table_id, linked_system_table,
             linked_display_field, is_required, is_unique, show_in_table, display_order, section_name, help_text,
             formula_type, formula_field_a_id, formula_field_b_id, formula_percent
             FROM jsonb_populate_record(null::company_table_fields, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

      WHEN 'company_custom_field' THEN
        IF v_row.action = 'create' THEN
          UPDATE company_custom_fields SET deleted_at = now() WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          UPDATE company_custom_fields SET deleted_at = NULL WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'update' THEN
          UPDATE company_custom_fields t SET
            (table_name, field_key, label, field_type, select_options, is_required, is_unique, display_order,
             default_value, validation_regex, validation_min, validation_max, auto_generate, auto_generate_type,
             auto_generate_prefix, linked_table, linked_table_id, linked_display_column, section_name, grid_width,
             show_in_table, help_text) =
            (SELECT table_name, field_key, label, field_type, select_options, is_required, is_unique, display_order,
             default_value, validation_regex, validation_min, validation_max, auto_generate, auto_generate_type,
             auto_generate_prefix, linked_table, linked_table_id, linked_display_column, section_name, grid_width,
             show_in_table, help_text
             FROM jsonb_populate_record(null::company_custom_fields, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

      WHEN 'template_definition' THEN
        IF v_row.action = 'create' THEN
          DELETE FROM template_definitions WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          INSERT INTO template_definitions SELECT * FROM jsonb_populate_record(null::template_definitions, v_row.before);
        ELSIF v_row.action = 'update' THEN
          UPDATE template_definitions t SET
            (slug, name, description, industry, icon, color, owner_company_id, is_published,
             version, suggested_label_overrides, updated_at) =
            (SELECT slug, name, description, industry, icon, color, owner_company_id, is_published,
             version, suggested_label_overrides, now()
             FROM jsonb_populate_record(null::template_definitions, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

      WHEN 'template_definition_table' THEN
        IF v_row.action = 'create' THEN
          DELETE FROM template_definition_tables WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          INSERT INTO template_definition_tables SELECT * FROM jsonb_populate_record(null::template_definition_tables, v_row.before);
        ELSIF v_row.action = 'update' THEN
          UPDATE template_definition_tables t SET
            (template_id, slug, name, icon, color, primary_field_key, display_order) =
            (SELECT template_id, slug, name, icon, color, primary_field_key, display_order
             FROM jsonb_populate_record(null::template_definition_tables, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

      WHEN 'template_definition_table_field' THEN
        IF v_row.action = 'create' THEN
          DELETE FROM template_definition_table_fields WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          INSERT INTO template_definition_table_fields SELECT * FROM jsonb_populate_record(null::template_definition_table_fields, v_row.before);
        ELSIF v_row.action = 'update' THEN
          UPDATE template_definition_table_fields t SET
            (template_table_id, field_key, label, field_type, select_options, linked_template_table_id,
             linked_system_table, linked_display_field, is_required, is_unique, show_in_table, display_order,
             section_name, help_text) =
            (SELECT template_table_id, field_key, label, field_type, select_options, linked_template_table_id,
             linked_system_table, linked_display_field, is_required, is_unique, show_in_table, display_order,
             section_name, help_text
             FROM jsonb_populate_record(null::template_definition_table_fields, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

      WHEN 'template_definition_system_field' THEN
        IF v_row.action = 'create' THEN
          DELETE FROM template_definition_system_fields WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          INSERT INTO template_definition_system_fields SELECT * FROM jsonb_populate_record(null::template_definition_system_fields, v_row.before);
        ELSIF v_row.action = 'update' THEN
          UPDATE template_definition_system_fields t SET
            (template_id, table_name, field_key, label, field_type, select_options, is_required, is_unique,
             display_order, section_name, help_text, default_value, linked_table, linked_display_column) =
            (SELECT template_id, table_name, field_key, label, field_type, select_options, is_required, is_unique,
             display_order, section_name, help_text, default_value, linked_table, linked_display_column
             FROM jsonb_populate_record(null::template_definition_system_fields, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

      WHEN 'company_template_install' THEN
        IF v_row.action = 'create' THEN
          DELETE FROM company_template_installs WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          INSERT INTO company_template_installs SELECT * FROM jsonb_populate_record(null::company_template_installs, v_row.before);
        END IF;

      WHEN 'company_dashboard' THEN
        IF v_row.action = 'create' THEN
          UPDATE company_dashboards SET deleted_at = now() WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'delete' THEN
          UPDATE company_dashboards SET deleted_at = NULL WHERE id = v_row.entity_id;
        ELSIF v_row.action = 'update' THEN
          UPDATE company_dashboards t SET
            (name, slug, icon, color, source_table_id, quick_add_field_ids, grid_field_ids,
             filter_field_ids, summary_tiles, chart_config, widgets, code_source, builder_mode,
             display_order, updated_at) =
            (SELECT name, slug, icon, color, source_table_id, quick_add_field_ids, grid_field_ids,
             filter_field_ids, summary_tiles, chart_config, widgets, code_source, builder_mode,
             display_order, now()
             FROM jsonb_populate_record(null::company_dashboards, v_row.before))
          WHERE t.id = v_row.entity_id;
        END IF;

    END CASE;
  END LOOP;

  INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, before, after, reverted_from_seq)
  VALUES (p_company_id, p_actor_id, 'schema_revert', p_company_id, 'Reverted schema', 'update', null, null, p_log_seq);
END;
$$;
