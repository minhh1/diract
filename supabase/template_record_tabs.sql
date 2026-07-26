-- Record-dashboard tabs in templates: a template can now carry
-- 'custom_dashboard' record tabs (e.g. the Law Firm "Time & Fees" tab shown
-- on every Matter record) so installs reproduce them -- previously the only
-- mechanism was the hardcoded law-firm spec list in
-- lib/dashboardWidgets/defaultRecordDashboardTabs.ts.
--
-- Three pieces:
--  1. template_definition_record_tabs: the catalog. A tab appears on the
--     records of either a SYSTEM table (record_table_name, e.g. 'projects')
--     or a template table (record_template_table_id), and shows rows of
--     linked_template_table_id. widgets_template uses field_key references
--     (the linked table's fields), resolved on install by
--     map_dashboard_widget_fields (template_dashboards_owner_sync.sql).
--  2. company_record_tab_defaults: per-company materialized defaults.
--     record_tabs rows are PER RECORD, created lazily on first open (see
--     RecordDashboard.tsx's loadTabs top-up) -- installs can't reach into
--     future records, so they write defaults here and the top-up reads them
--     for every record of the matching table. record_table follows
--     record_tabs' convention: the system table name, or the
--     company_tables.id (as text) for custom tables.
--  3. install_template_record_tabs + sync extension: install writes
--     defaults (called from install_template_dashboards, so it's covered by
--     the dashboards opt-in); sync_template_dashboards_from_company also
--     promotes the owner's live custom_dashboard record tabs into the
--     catalog (latest per record-table/linked-table pair).

CREATE TABLE IF NOT EXISTS template_definition_record_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  -- exactly one of these two identifies whose records get the tab
  record_table_name text,
  record_template_table_id uuid REFERENCES template_definition_tables(id) ON DELETE CASCADE,
  title text NOT NULL,
  icon text,
  linked_template_table_id uuid NOT NULL REFERENCES template_definition_tables(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  widgets_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT template_record_tabs_one_target CHECK (
    (record_table_name IS NOT NULL) <> (record_template_table_id IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS company_record_tab_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_table text NOT NULL,
  title text NOT NULL,
  icon text,
  linked_table_id uuid NOT NULL REFERENCES company_tables(id) ON DELETE CASCADE,
  display_order int NOT NULL DEFAULT 0,
  widgets jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE company_record_tab_defaults ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_record_tab_defaults_members ON company_record_tab_defaults;
CREATE POLICY company_record_tab_defaults_members ON company_record_tab_defaults
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Materialize a template's record tabs as company defaults. Idempotent:
-- matched on (record_table, linked_table_id, title). Widgets reference the
-- LINKED table's fields, so that's the map used for resolution.
CREATE OR REPLACE FUNCTION install_template_record_tabs(
  p_company_id uuid,
  p_template_id uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tab RECORD;
  v_record_table text;
  v_linked_table_id uuid;
  v_field_map jsonb;
  v_widgets jsonb;
  v_created int := 0;
BEGIN
  FOR v_tab IN SELECT * FROM template_definition_record_tabs WHERE template_id = p_template_id ORDER BY display_order LOOP
    IF v_tab.record_table_name IS NOT NULL THEN
      v_record_table := v_tab.record_table_name;
    ELSE
      SELECT installed_company_table_id::text INTO v_record_table
        FROM company_template_table_map
        WHERE company_id = p_company_id AND template_id = p_template_id
          AND source_template_table_id = v_tab.record_template_table_id;
      IF v_record_table IS NULL THEN CONTINUE; END IF;
    END IF;

    SELECT installed_company_table_id INTO v_linked_table_id
      FROM company_template_table_map
      WHERE company_id = p_company_id AND template_id = p_template_id
        AND source_template_table_id = v_tab.linked_template_table_id;
    IF v_linked_table_id IS NULL THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM company_record_tab_defaults
      WHERE company_id = p_company_id AND record_table = v_record_table
        AND linked_table_id = v_linked_table_id AND title = v_tab.title
    ) THEN CONTINUE; END IF;

    SELECT jsonb_object_agg(field_key, id::text) INTO v_field_map
      FROM company_table_fields WHERE table_id = v_linked_table_id AND deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(map_dashboard_widget_fields(w.value, COALESCE(v_field_map, '{}'::jsonb))), '[]'::jsonb)
      INTO v_widgets
      FROM jsonb_array_elements(v_tab.widgets_template) AS w(value);

    INSERT INTO company_record_tab_defaults (company_id, record_table, title, icon, linked_table_id, display_order, widgets)
      VALUES (p_company_id, v_record_table, v_tab.title, v_tab.icon, v_linked_table_id, v_tab.display_order, v_widgets);
    v_created := v_created + 1;
  END LOOP;

  RETURN v_created;
END;
$$;

-- Redeclare install_template_dashboards to also materialize record-tab
-- defaults -- single hook point covered by the dashboards opt-in in both
-- install_company_template and upgrade_company_template (see
-- template_marketplace_dashboards_install.sql). Body identical to the
-- previous version apart from the final install_template_record_tabs call.
CREATE OR REPLACE FUNCTION install_template_dashboards(
  p_company_id uuid,
  p_template_id uuid
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_dash RECORD;
  v_target_table_id uuid;
  v_field_map jsonb;
  v_widgets jsonb;
  v_new_slug text;
  v_suffix int;
  v_new_dashboard_id uuid;
  v_created int := 0;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  FOR v_dash IN SELECT * FROM template_definition_dashboards WHERE template_id = p_template_id ORDER BY display_order LOOP
    IF EXISTS (
      SELECT 1 FROM company_template_dashboard_map
      WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_dashboard_id = v_dash.id
    ) THEN
      CONTINUE;
    END IF;

    SELECT installed_company_table_id INTO v_target_table_id
      FROM company_template_table_map
      WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_table_id = v_dash.source_template_table_id;
    IF v_target_table_id IS NULL THEN CONTINUE; END IF;

    SELECT jsonb_object_agg(field_key, id::text) INTO v_field_map
      FROM company_table_fields WHERE table_id = v_target_table_id AND deleted_at IS NULL;

    SELECT jsonb_agg(resolve_template_dashboard_widget(w.value, COALESCE(v_field_map, '{}'::jsonb)))
      INTO v_widgets
      FROM jsonb_array_elements(v_dash.widgets_template) AS w(value);

    v_new_slug := v_dash.slug;
    v_suffix := 1;
    WHILE EXISTS (SELECT 1 FROM company_dashboards WHERE company_id = p_company_id AND slug = v_new_slug AND deleted_at IS NULL) LOOP
      v_suffix := v_suffix + 1;
      v_new_slug := v_dash.slug || '-' || v_suffix;
    END LOOP;

    INSERT INTO company_dashboards (
      company_id, name, slug, icon, color, source_table_id, display_order,
      widgets, builder_mode, widgets_migrated_at
    ) VALUES (
      p_company_id, v_dash.name, v_new_slug, v_dash.icon, v_dash.color, v_target_table_id, v_dash.display_order,
      COALESCE(v_widgets, '[]'::jsonb), 'canvas', now()
    ) RETURNING id INTO v_new_dashboard_id;
    v_created := v_created + 1;

    INSERT INTO company_template_dashboard_map (company_id, template_id, source_template_dashboard_id, installed_company_dashboard_id)
      VALUES (p_company_id, p_template_id, v_dash.id, v_new_dashboard_id);

    INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, after)
      VALUES (p_company_id, p_actor, 'company_dashboard', v_new_dashboard_id, v_dash.name, 'create',
        jsonb_build_object('name', v_dash.name, 'slug', v_new_slug, 'from_template', p_template_id));
  END LOOP;

  -- record-tab defaults ride along with the dashboards opt-in
  PERFORM install_template_record_tabs(p_company_id, p_template_id);

  RETURN v_created;
END;
$$;

-- Redeclare the owner sync to also promote the owner's live
-- custom_dashboard record tabs into the catalog: latest tab per
-- (record_table, linked table) pair, matched into the catalog on the same
-- identity. Body identical to template_dashboards_owner_sync.sql's version
-- apart from the record-tab pass and the extra count in the result.
CREATE OR REPLACE FUNCTION sync_template_dashboards_from_company(p_template_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_owner uuid;
  v_dash RECORD;
  v_tab RECORD;
  v_source_template_table_id uuid;
  v_record_table_name text;
  v_record_template_table_id uuid;
  v_linked_template_table_id uuid;
  v_key_map jsonb;
  v_widgets jsonb;
  v_catalog_id uuid;
  v_new_slug text;
  v_suffix int;
  v_updated int := 0;
  v_created int := 0;
  v_skipped int := 0;
  v_tabs_synced int := 0;
BEGIN
  SELECT owner_company_id INTO v_owner FROM template_definitions WHERE id = p_template_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'template not found'; END IF;
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_owner AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'only members of the template''s owner company can sync its dashboards';
  END IF;

  -- ── Pass 1: table dashboards (unchanged) ──────────────────────────────
  FOR v_dash IN
    SELECT * FROM company_dashboards
    WHERE company_id = v_owner AND deleted_at IS NULL
    ORDER BY display_order
  LOOP
    IF v_dash.widgets IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    SELECT source_template_table_id INTO v_source_template_table_id
      FROM company_template_table_map
      WHERE company_id = v_owner AND template_id = p_template_id
        AND installed_company_table_id = v_dash.source_table_id;
    IF v_source_template_table_id IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    SELECT jsonb_object_agg(id::text, field_key) INTO v_key_map
      FROM company_table_fields WHERE table_id = v_dash.source_table_id AND deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(map_dashboard_widget_fields(w.value, COALESCE(v_key_map, '{}'::jsonb))), '[]'::jsonb)
      INTO v_widgets
      FROM jsonb_array_elements(v_dash.widgets) AS w(value);

    SELECT source_template_dashboard_id INTO v_catalog_id
      FROM company_template_dashboard_map
      WHERE company_id = v_owner AND template_id = p_template_id
        AND installed_company_dashboard_id = v_dash.id;
    IF v_catalog_id IS NULL THEN
      SELECT id INTO v_catalog_id FROM template_definition_dashboards
        WHERE template_id = p_template_id AND slug = v_dash.slug;
      IF v_catalog_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM company_template_dashboard_map
        WHERE company_id = v_owner AND template_id = p_template_id AND source_template_dashboard_id = v_catalog_id
      ) THEN
        INSERT INTO company_template_dashboard_map (company_id, template_id, source_template_dashboard_id, installed_company_dashboard_id)
          VALUES (v_owner, p_template_id, v_catalog_id, v_dash.id);
      END IF;
    END IF;

    IF v_catalog_id IS NOT NULL THEN
      UPDATE template_definition_dashboards SET
        name = v_dash.name,
        icon = v_dash.icon,
        color = v_dash.color,
        display_order = v_dash.display_order,
        source_template_table_id = v_source_template_table_id,
        widgets_template = v_widgets
      WHERE id = v_catalog_id;
      v_updated := v_updated + 1;
    ELSE
      v_new_slug := v_dash.slug;
      v_suffix := 1;
      WHILE EXISTS (SELECT 1 FROM template_definition_dashboards WHERE template_id = p_template_id AND slug = v_new_slug) LOOP
        v_suffix := v_suffix + 1;
        v_new_slug := v_dash.slug || '-' || v_suffix;
      END LOOP;
      INSERT INTO template_definition_dashboards
        (template_id, source_template_table_id, name, slug, icon, color, display_order, widgets_template)
        VALUES (p_template_id, v_source_template_table_id, v_dash.name, v_new_slug, v_dash.icon, v_dash.color, v_dash.display_order, v_widgets)
        RETURNING id INTO v_catalog_id;
      INSERT INTO company_template_dashboard_map (company_id, template_id, source_template_dashboard_id, installed_company_dashboard_id)
        VALUES (v_owner, p_template_id, v_catalog_id, v_dash.id);
      v_created := v_created + 1;
    END IF;
  END LOOP;

  -- ── Pass 2: record-dashboard tabs ────────────────────────────────────
  -- Latest live custom_dashboard tab per (record_table, linked table) --
  -- record tabs are per record, so the owner's most recently created
  -- instance of each tab stands in for "the" curated version.
  FOR v_tab IN
    SELECT DISTINCT ON (t.record_table, t.linked_table_id)
        t.*, w.widgets AS tab_widgets
      FROM record_tabs t
      JOIN record_tab_dashboard_widgets w ON w.tab_id = t.id
      WHERE t.company_id = v_owner AND t.tab_type = 'custom_dashboard' AND t.linked_table_id IS NOT NULL
      ORDER BY t.record_table, t.linked_table_id, t.created_at DESC
  LOOP
    -- the linked (data) table must be a template table
    SELECT source_template_table_id INTO v_linked_template_table_id
      FROM company_template_table_map
      WHERE company_id = v_owner AND template_id = p_template_id
        AND installed_company_table_id = v_tab.linked_table_id;
    IF v_linked_template_table_id IS NULL THEN CONTINUE; END IF;

    -- whose records the tab lives on: a system table name, or a company
    -- table id that must map back to a template table
    IF v_tab.record_table IN ('projects', 'entities', 'properties') THEN
      v_record_table_name := v_tab.record_table;
      v_record_template_table_id := NULL;
    ELSE
      v_record_table_name := NULL;
      SELECT source_template_table_id INTO v_record_template_table_id
        FROM company_template_table_map
        WHERE company_id = v_owner AND template_id = p_template_id
          AND installed_company_table_id::text = v_tab.record_table;
      IF v_record_template_table_id IS NULL THEN CONTINUE; END IF;
    END IF;

    SELECT jsonb_object_agg(id::text, field_key) INTO v_key_map
      FROM company_table_fields WHERE table_id = v_tab.linked_table_id AND deleted_at IS NULL;

    SELECT COALESCE(jsonb_agg(map_dashboard_widget_fields(w.value, COALESCE(v_key_map, '{}'::jsonb))), '[]'::jsonb)
      INTO v_widgets
      FROM jsonb_array_elements(v_tab.tab_widgets) AS w(value);

    UPDATE template_definition_record_tabs SET
      title = v_tab.title, icon = v_tab.icon,
      display_order = v_tab.display_order, widgets_template = v_widgets
    WHERE template_id = p_template_id
      AND linked_template_table_id = v_linked_template_table_id
      AND record_table_name IS NOT DISTINCT FROM v_record_table_name
      AND record_template_table_id IS NOT DISTINCT FROM v_record_template_table_id;
    IF NOT FOUND THEN
      INSERT INTO template_definition_record_tabs
        (template_id, record_table_name, record_template_table_id, title, icon, linked_template_table_id, display_order, widgets_template)
        VALUES (p_template_id, v_record_table_name, v_record_template_table_id, v_tab.title, v_tab.icon, v_linked_template_table_id, v_tab.display_order, v_widgets);
    END IF;
    v_tabs_synced := v_tabs_synced + 1;
  END LOOP;

  RETURN jsonb_build_object('updated', v_updated, 'created', v_created, 'skipped', v_skipped, 'record_tabs', v_tabs_synced);
END;
$$;
