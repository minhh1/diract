-- Template marketplace: reusable bundles of custom tables + custom fields
-- that any company can author (from scratch, or by exporting a snapshot of
-- one of their own tables/fields -- see components/CustomTableBuilder.tsx's
-- and components/SchemaVisualisation.tsx's "Publish to marketplace" actions)
-- and any company can install into their own workspace.
--
-- The catalog (template_definitions/_tables/_table_fields/_system_fields) is
-- its own independent schema -- installing copies rows out of it into the
-- installer's live company_tables/company_table_fields/company_custom_fields,
-- it never points live at another tenant's data. This mirrors the shape of
-- company_tables/company_table_fields (custom tables engine) and
-- company_custom_fields (system-table custom fields on entities/projects/
-- properties) one level up -- see lib/hooks/useCustomTable.ts and
-- components/schema/types.ts for the shapes being mirrored.

-- ── Catalog ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS template_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  industry text,
  icon text NOT NULL DEFAULT 'Table2',
  color text NOT NULL DEFAULT '#6366f1',
  owner_company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_published boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  suggested_label_overrides jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_definition_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text NOT NULL,
  icon text NOT NULL DEFAULT 'Table2',
  color text NOT NULL DEFAULT '#6366f1',
  primary_field_key text,
  display_order integer NOT NULL DEFAULT 0,
  UNIQUE (template_id, slug)
);

-- Mirrors company_table_fields exactly (no auto_generate/default_value/
-- grid_width -- those columns only exist on company_custom_fields, since
-- auto-id generation and default values aren't wired up for custom-table
-- fields in the live app either).
CREATE TABLE IF NOT EXISTS template_definition_table_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_table_id uuid NOT NULL REFERENCES template_definition_tables(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL,
  select_options jsonb,
  linked_template_table_id uuid REFERENCES template_definition_tables(id) ON DELETE SET NULL,
  linked_system_table text,
  linked_display_field text,
  is_required boolean NOT NULL DEFAULT false,
  is_unique boolean NOT NULL DEFAULT false,
  show_in_table boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  section_name text,
  help_text text,
  UNIQUE (template_table_id, field_key)
);

-- Mirrors company_custom_fields. table_name is 'entities' | 'projects' |
-- 'properties' -- this is where a template's "Matter" fields live
-- (table_name='projects'), since a Matter is a projects row, not a
-- dedicated custom table.
CREATE TABLE IF NOT EXISTS template_definition_system_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  table_name text NOT NULL CHECK (table_name IN ('entities', 'projects', 'properties')),
  field_key text NOT NULL,
  label text NOT NULL,
  field_type text NOT NULL,
  select_options jsonb,
  is_required boolean NOT NULL DEFAULT false,
  is_unique boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  section_name text,
  help_text text,
  default_value text,
  auto_generate boolean NOT NULL DEFAULT false,
  auto_generate_type text,
  auto_generate_prefix text,
  linked_table text,
  linked_display_column text,
  UNIQUE (template_id, table_name, field_key)
);

CREATE INDEX IF NOT EXISTS template_definition_tables_template_idx ON template_definition_tables (template_id);
CREATE INDEX IF NOT EXISTS template_definition_table_fields_table_idx ON template_definition_table_fields (template_table_id);
CREATE INDEX IF NOT EXISTS template_definition_system_fields_template_idx ON template_definition_system_fields (template_id);

ALTER TABLE template_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_definition_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_definition_table_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_definition_system_fields ENABLE ROW LEVEL SECURITY;

-- Anyone signed in can browse published templates; only admins of the
-- owning company can see/edit their own drafts or published templates.
DROP POLICY IF EXISTS template_definitions_read ON template_definitions;
CREATE POLICY template_definitions_read ON template_definitions
  FOR SELECT
  USING (
    is_published
    OR owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS template_definitions_write ON template_definitions;
CREATE POLICY template_definitions_write ON template_definitions
  FOR INSERT WITH CHECK (
    owner_company_id IN (
      SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS template_definitions_update ON template_definitions;
CREATE POLICY template_definitions_update ON template_definitions
  FOR UPDATE
  USING (
    owner_company_id IN (
      SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'
    )
  )
  WITH CHECK (
    owner_company_id IN (
      SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'
    )
  );

DROP POLICY IF EXISTS template_definitions_delete ON template_definitions;
CREATE POLICY template_definitions_delete ON template_definitions
  FOR DELETE
  USING (
    owner_company_id IN (
      SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin'
    )
  );

-- Child catalog tables follow the same read (published-or-own) / write
-- (own admins only) shape, scoped through their parent template.
DROP POLICY IF EXISTS template_definition_tables_rw ON template_definition_tables;
CREATE POLICY template_definition_tables_rw ON template_definition_tables
  FOR ALL
  USING (template_id IN (
    SELECT id FROM template_definitions WHERE is_published
      OR owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM template_definitions
    WHERE owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin')
  ));

DROP POLICY IF EXISTS template_definition_table_fields_rw ON template_definition_table_fields;
CREATE POLICY template_definition_table_fields_rw ON template_definition_table_fields
  FOR ALL
  USING (template_table_id IN (
    SELECT tt.id FROM template_definition_tables tt JOIN template_definitions td ON td.id = tt.template_id
    WHERE td.is_published
      OR td.owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (template_table_id IN (
    SELECT tt.id FROM template_definition_tables tt JOIN template_definitions td ON td.id = tt.template_id
    WHERE td.owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin')
  ));

DROP POLICY IF EXISTS template_definition_system_fields_rw ON template_definition_system_fields;
CREATE POLICY template_definition_system_fields_rw ON template_definition_system_fields
  FOR ALL
  USING (template_id IN (
    SELECT id FROM template_definitions WHERE is_published
      OR owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM template_definitions
    WHERE owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin')
  ));

-- ── Per-tenant install bookkeeping ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_template_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  installed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  label_overrides_applied boolean NOT NULL DEFAULT false,
  UNIQUE (company_id, template_id)
);

-- installed_company_table_id is null when resolution='used_existing' --
-- nothing new was created, so there is nothing here for uninstall to remove.
CREATE TABLE IF NOT EXISTS company_template_table_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  source_template_table_id uuid NOT NULL REFERENCES template_definition_tables(id) ON DELETE CASCADE,
  installed_company_table_id uuid REFERENCES company_tables(id) ON DELETE CASCADE,
  resolution text NOT NULL CHECK (resolution IN ('created', 'used_existing')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_id, source_template_table_id)
);

CREATE TABLE IF NOT EXISTS company_template_field_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  source_template_system_field_id uuid NOT NULL REFERENCES template_definition_system_fields(id) ON DELETE CASCADE,
  target_table_name text NOT NULL,
  installed_company_custom_field_id uuid REFERENCES company_custom_fields(id) ON DELETE CASCADE,
  resolution text NOT NULL CHECK (resolution IN ('created', 'used_existing')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_id, source_template_system_field_id)
);

ALTER TABLE company_template_installs ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_template_table_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_template_field_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_template_installs_company_members ON company_template_installs;
CREATE POLICY company_template_installs_company_members ON company_template_installs
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS company_template_table_map_company_members ON company_template_table_map;
CREATE POLICY company_template_table_map_company_members ON company_template_table_map
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS company_template_field_map_company_members ON company_template_field_map;
CREATE POLICY company_template_field_map_company_members ON company_template_field_map
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── Install ──────────────────────────────────────────────────────────────
--
-- p_resolutions shape:
-- {
--   "tables": { "<template_definition_tables.slug>": "use_existing"|"create_new" },
--   "systemFields": { "<table_name>:<field_key>": "use_existing"|"create_new" },
--   "applyLabelOverrides": boolean
-- }
--
-- Never UPDATEs/DELETEs anything pre-existing -- every branch either maps
-- onto an existing row (no write) or INSERTs a brand new one. Respects
-- companies.max_custom_tables via whatever constraint/trigger already
-- guards company_tables inserts (see components/CustomTableBuilder.tsx,
-- which already surfaces that same error today).
CREATE OR REPLACE FUNCTION install_company_template(
  p_company_id uuid,
  p_template_id uuid,
  p_resolutions jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_tbl RECORD;
  v_fld RECORD;
  v_sf RECORD;
  v_resolution text;
  v_existing_id uuid;
  v_new_table_id uuid;
  v_new_field_id uuid;
  v_new_slug text;
  v_new_key text;
  v_suffix int;
  v_linked_table_id uuid;
  v_target_table_id uuid;
  v_install_id uuid;
  v_overrides jsonb;
  v_apply_overrides boolean;
  v_tables_created int := 0;
  v_fields_created int := 0;
BEGIN
  -- This function is SECURITY DEFINER and reachable directly via
  -- supabase.rpc() by any authenticated client, not just through the
  -- app's own authorizeCompanyMember()-guarded API route -- so it must
  -- enforce membership itself rather than trusting the caller.
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  IF EXISTS (SELECT 1 FROM company_template_installs WHERE company_id = p_company_id AND template_id = p_template_id) THEN
    RETURN jsonb_build_object('status', 'already_installed');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_template_table_map (source_id uuid PRIMARY KEY, installed_id uuid) ON COMMIT DROP;
  TRUNCATE tmp_template_table_map;

  -- Pass 1: tables
  FOR v_tbl IN SELECT * FROM template_definition_tables WHERE template_id = p_template_id ORDER BY display_order LOOP
    v_resolution := COALESCE(p_resolutions->'tables'->>v_tbl.slug, 'create_new');

    IF v_resolution = 'use_existing' THEN
      SELECT id INTO v_existing_id FROM company_tables WHERE company_id = p_company_id AND slug = v_tbl.slug AND deleted_at IS NULL LIMIT 1;
      IF v_existing_id IS NULL THEN
        RAISE EXCEPTION 'use_existing chosen for table % but no matching table exists', v_tbl.slug;
      END IF;
      INSERT INTO tmp_template_table_map (source_id, installed_id) VALUES (v_tbl.id, v_existing_id);
      INSERT INTO company_template_table_map (company_id, template_id, source_template_table_id, installed_company_table_id, resolution)
        VALUES (p_company_id, p_template_id, v_tbl.id, v_existing_id, 'used_existing');
    ELSE
      v_new_slug := v_tbl.slug;
      v_suffix := 1;
      WHILE EXISTS (SELECT 1 FROM company_tables WHERE company_id = p_company_id AND slug = v_new_slug AND deleted_at IS NULL) LOOP
        v_suffix := v_suffix + 1;
        v_new_slug := v_tbl.slug || '-' || v_suffix;
      END LOOP;

      INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key, display_order)
        VALUES (p_company_id, v_tbl.name, v_new_slug, v_tbl.icon, v_tbl.color, v_tbl.primary_field_key, v_tbl.display_order)
        RETURNING id INTO v_new_table_id;
      v_tables_created := v_tables_created + 1;

      INSERT INTO tmp_template_table_map (source_id, installed_id) VALUES (v_tbl.id, v_new_table_id);
      INSERT INTO company_template_table_map (company_id, template_id, source_template_table_id, installed_company_table_id, resolution)
        VALUES (p_company_id, p_template_id, v_tbl.id, v_new_table_id, 'created');

      INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, after)
        VALUES (p_company_id, p_actor, 'company_table', v_new_table_id, v_tbl.name, 'create',
          jsonb_build_object('name', v_tbl.name, 'slug', v_new_slug, 'from_template', p_template_id));
    END IF;
  END LOOP;

  -- Pass 2: fields, only for tables actually created this install (a table
  -- mapped to 'used_existing' already has its own fields -- copying the
  -- template's field list onto it would risk clobbering the tenant's own setup).
  FOR v_tbl IN SELECT * FROM template_definition_tables WHERE template_id = p_template_id LOOP
    SELECT installed_id INTO v_target_table_id FROM tmp_template_table_map WHERE source_id = v_tbl.id;
    SELECT resolution INTO v_resolution FROM company_template_table_map
      WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_table_id = v_tbl.id;

    IF v_resolution = 'created' THEN
      FOR v_fld IN SELECT * FROM template_definition_table_fields WHERE template_table_id = v_tbl.id ORDER BY display_order LOOP
        v_linked_table_id := NULL;
        IF v_fld.linked_template_table_id IS NOT NULL THEN
          SELECT installed_id INTO v_linked_table_id FROM tmp_template_table_map WHERE source_id = v_fld.linked_template_table_id;
        END IF;

        INSERT INTO company_table_fields (
          company_id, table_id, field_key, label, field_type, select_options,
          linked_table_id, linked_system_table, linked_display_field,
          is_required, is_unique, show_in_table, display_order, section_name, help_text
        ) VALUES (
          p_company_id, v_target_table_id, v_fld.field_key, v_fld.label, v_fld.field_type, v_fld.select_options,
          v_linked_table_id, v_fld.linked_system_table, v_fld.linked_display_field,
          v_fld.is_required, v_fld.is_unique, v_fld.show_in_table, v_fld.display_order, v_fld.section_name, v_fld.help_text
        );
      END LOOP;
    END IF;
  END LOOP;

  -- System fields (entities/projects/properties)
  FOR v_sf IN SELECT * FROM template_definition_system_fields WHERE template_id = p_template_id ORDER BY display_order LOOP
    v_resolution := COALESCE(p_resolutions->'systemFields'->>(v_sf.table_name || ':' || v_sf.field_key), 'create_new');

    IF v_resolution = 'use_existing' THEN
      SELECT id INTO v_existing_id FROM company_custom_fields
        WHERE company_id = p_company_id AND table_name = v_sf.table_name AND field_key = v_sf.field_key AND deleted_at IS NULL LIMIT 1;
      IF v_existing_id IS NULL THEN
        RAISE EXCEPTION 'use_existing chosen for field %:% but no matching field exists', v_sf.table_name, v_sf.field_key;
      END IF;
      INSERT INTO company_template_field_map (company_id, template_id, source_template_system_field_id, target_table_name, installed_company_custom_field_id, resolution)
        VALUES (p_company_id, p_template_id, v_sf.id, v_sf.table_name, v_existing_id, 'used_existing');
    ELSE
      v_new_key := v_sf.field_key;
      v_suffix := 1;
      WHILE EXISTS (SELECT 1 FROM company_custom_fields WHERE company_id = p_company_id AND table_name = v_sf.table_name AND field_key = v_new_key AND deleted_at IS NULL) LOOP
        v_suffix := v_suffix + 1;
        v_new_key := v_sf.field_key || '_' || v_suffix;
      END LOOP;

      INSERT INTO company_custom_fields (
        company_id, table_name, field_key, label, field_type, select_options,
        is_required, is_unique, display_order, section_name, help_text, default_value,
        auto_generate, auto_generate_type, auto_generate_prefix,
        linked_table, linked_display_column, grid_width, show_in_table
      ) VALUES (
        p_company_id, v_sf.table_name, v_new_key, v_sf.label, v_sf.field_type, v_sf.select_options,
        v_sf.is_required, v_sf.is_unique, v_sf.display_order, v_sf.section_name, v_sf.help_text, v_sf.default_value,
        v_sf.auto_generate, v_sf.auto_generate_type, v_sf.auto_generate_prefix,
        v_sf.linked_table, v_sf.linked_display_column, 2, false
      ) RETURNING id INTO v_new_field_id;
      v_fields_created := v_fields_created + 1;

      INSERT INTO company_template_field_map (company_id, template_id, source_template_system_field_id, target_table_name, installed_company_custom_field_id, resolution)
        VALUES (p_company_id, p_template_id, v_sf.id, v_sf.table_name, v_new_field_id, 'created');

      INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, after)
        VALUES (p_company_id, p_actor, 'company_custom_field', v_new_field_id, v_sf.label, 'create',
          jsonb_build_object('table_name', v_sf.table_name, 'field_key', v_new_key, 'from_template', p_template_id));
    END IF;
  END LOOP;

  -- Optional label overrides
  v_apply_overrides := COALESCE((p_resolutions->>'applyLabelOverrides')::boolean, false);
  IF v_apply_overrides THEN
    SELECT suggested_label_overrides INTO v_overrides FROM template_definitions WHERE id = p_template_id;
    IF v_overrides IS NOT NULL AND v_overrides <> '{}'::jsonb THEN
      UPDATE companies SET table_label_overrides = table_label_overrides || v_overrides WHERE id = p_company_id;
    END IF;
  END IF;

  INSERT INTO company_template_installs (company_id, template_id, installed_by, label_overrides_applied)
    VALUES (p_company_id, p_template_id, p_actor, v_apply_overrides)
    RETURNING id INTO v_install_id;

  INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, after)
    VALUES (p_company_id, p_actor, 'company_template_install', v_install_id,
      (SELECT name FROM template_definitions WHERE id = p_template_id), 'create',
      jsonb_build_object('template_id', p_template_id));

  RETURN jsonb_build_object('status', 'installed', 'install_id', v_install_id, 'tables_created', v_tables_created, 'fields_created', v_fields_created);
END;
$$;

-- ── Uninstall ────────────────────────────────────────────────────────────
--
-- Removes exactly what this install created (per company_template_table_map/
-- company_template_field_map's resolution='created' rows) and nothing the
-- tenant already had ('used_existing' rows are left untouched). Deleting a
-- created company_tables/company_custom_fields row cascades to its own
-- fields/records/values, same as deleting it by hand would.
CREATE OR REPLACE FUNCTION uninstall_company_template(
  p_company_id uuid,
  p_template_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_install company_template_installs%ROWTYPE;
  v_overrides jsonb;
  v_key text;
  v_tables_removed int := 0;
  v_fields_removed int := 0;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  SELECT * INTO v_install FROM company_template_installs WHERE company_id = p_company_id AND template_id = p_template_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_installed');
  END IF;

  -- Soft-delete, not DELETE -- these tables/fields (and everything stored
  -- in them) stay fully recoverable from Trash, same as a manual delete.
  UPDATE company_tables SET deleted_at = now() WHERE id IN (
    SELECT installed_company_table_id FROM company_template_table_map
    WHERE company_id = p_company_id AND template_id = p_template_id AND resolution = 'created'
  ) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_tables_removed = ROW_COUNT;

  UPDATE company_custom_fields SET deleted_at = now() WHERE id IN (
    SELECT installed_company_custom_field_id FROM company_template_field_map
    WHERE company_id = p_company_id AND template_id = p_template_id AND resolution = 'created'
  ) AND deleted_at IS NULL;
  GET DIAGNOSTICS v_fields_removed = ROW_COUNT;

  IF v_install.label_overrides_applied THEN
    SELECT suggested_label_overrides INTO v_overrides FROM template_definitions WHERE id = p_template_id;
    IF v_overrides IS NOT NULL THEN
      FOR v_key IN SELECT jsonb_object_keys(v_overrides) LOOP
        UPDATE companies SET table_label_overrides = table_label_overrides - v_key WHERE id = p_company_id;
      END LOOP;
    END IF;
  END IF;

  DELETE FROM company_template_table_map WHERE company_id = p_company_id AND template_id = p_template_id;
  DELETE FROM company_template_field_map WHERE company_id = p_company_id AND template_id = p_template_id;

  INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, before)
    VALUES (p_company_id, p_actor, 'company_template_install', v_install.id,
      (SELECT name FROM template_definitions WHERE id = p_template_id), 'delete',
      to_jsonb(v_install));

  DELETE FROM company_template_installs WHERE id = v_install.id;

  RETURN jsonb_build_object('status', 'uninstalled', 'tables_removed', v_tables_removed, 'fields_removed', v_fields_removed);
END;
$$;
