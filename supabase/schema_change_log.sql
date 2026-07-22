-- App-wide, append-only log of schema-*shape* changes (creating/renaming/
-- deleting a custom table or a field on a custom table or on
-- entities/projects/properties, plus template authoring/install/uninstall).
-- Not a log of data changes -- company_table_values/company_custom_field_values
-- are untouched by this file. Written to via lib/services/schemaChangeLog.ts
-- from the handful of real mutation call sites: components/CustomTableBuilder.tsx,
-- components/SchemaVisualisation.tsx, the template schema editor, and the
-- template install/uninstall routes.
--
-- revert_schema_change() lets a company step back to any earlier point by
-- undoing every logged change that happened after it, in reverse order, then
-- recording the revert itself as a brand-new log entry -- history is never
-- rewritten, only added to (same idea as `git revert`, not `git reset`).

CREATE TABLE IF NOT EXISTS schema_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN (
    'company_table', 'company_table_field', 'company_custom_field',
    'template_definition', 'template_definition_table',
    'template_definition_table_field', 'template_definition_system_field',
    'company_template_install',
    -- Marker row for a revert itself (see revert_schema_change below) -- not
    -- a real table, so its entity_id is not meant to be looked up anywhere.
    'schema_revert'
  )),
  entity_id uuid NOT NULL,
  entity_label text,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  before jsonb,
  after jsonb,
  reverted_from_seq bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schema_change_log_company_seq_idx ON schema_change_log (company_id, seq DESC);

ALTER TABLE schema_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schema_change_log_company_members ON schema_change_log;
CREATE POLICY schema_change_log_company_members ON schema_change_log
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Reverts p_company_id's schema back to how it looked immediately after
-- log entry p_log_seq -- i.e. undoes every entry logged after it, most
-- recent first. Descending order naturally respects dependency order: a
-- field created after its table is deleted (undoing the create) before the
-- table itself is deleted, and a field deleted before its table was deleted
-- is restored after the table is restored.
--
-- Scope: only the schema-definition tables below. Restoring a deleted row
-- brings back its shape (name, type, config) exactly as it was, not any
-- data that had been stored in company_table_values/company_custom_field_values
-- against it -- those are data, not schema, and are out of scope here.
CREATE OR REPLACE FUNCTION revert_schema_change(
  p_company_id uuid,
  p_log_seq bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor_id uuid := auth.uid();
  v_row schema_change_log%ROWTYPE;
BEGIN
  -- SECURITY DEFINER + reachable directly via supabase.rpc() by any
  -- authenticated client -- must check membership itself, not just rely on
  -- the API route's own auth check.
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
        -- Tables are soft-deleted (see schema_soft_delete.sql) so their
        -- records/fields are never actually gone -- undoing a create or a
        -- delete just flips deleted_at, restoring real data either way.
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
             linked_display_field, is_required, is_unique, show_in_table, display_order, section_name, help_text) =
            (SELECT field_key, label, field_type, select_options, linked_table_id, linked_system_table,
             linked_display_field, is_required, is_unique, show_in_table, display_order, section_name, help_text
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

    END CASE;
  END LOOP;

  INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, before, after, reverted_from_seq)
  VALUES (p_company_id, p_actor_id, 'schema_revert', p_company_id, 'Reverted schema', 'update', null, null, p_log_seq);
END;
$$;
