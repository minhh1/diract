-- Consolidates "Add to template" into one Marketplace modal covering every
-- exportable category (tables visibility, custom tables/fields, system
-- fields, dashboards & record tabs, default views/sort/filter, three page
-- kinds + their rules, and a safe subset of settings), replacing three
-- separate scattered "Publish to marketplace" buttons
-- (CustomTableBuilder.tsx, SchemaVisualisation.tsx, the Marketplace page's
-- own "Sync dashboards" button) that each duplicated their own
-- always-create-a-new-template insert logic and covered only one narrow
-- slice. See app/api/templates/[slug]/export/route.ts and
-- components/marketplace/AddToTemplateModal.tsx for the new consolidated
-- entry point these functions serve.

-- ── 1. New template_definitions columns ─────────────────────────────────

-- Mirrors companies.disabled_system_tables' shape (tables visibility).
ALTER TABLE template_definitions ADD COLUMN IF NOT EXISTS disabled_system_tables jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Shape: { tableLabelOverrides: {...}, invoiceSettings: { creditTerms,
-- otherTerms, templates: [{ id, name, display: {...} }] } }. bankDetails is
-- structurally never written here -- sync_template_settings_from_company
-- below simply never selects that key, not a runtime filter -- so there is
-- no possible way for a company's real bank account details to land in a
-- shared marketplace template.
ALTER TABLE template_definitions ADD COLUMN IF NOT EXISTS settings_template jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ── 2. template_definition_default_views ────────────────────────────────
-- Snapshot of company_default_views (columns/expansion_columns/column_widths/
-- filters/sort/preset_name all bundle together there already, covering
-- "default views", "default sort", and "default filter" in one row).
-- Custom-table column/filter/sort entries referencing `custom_field:<uuid>`
-- are rewritten at export time to the portable `custom_field:<table_slug>.
-- <field_key>` form and resolved back to a real id at install time -- same
-- "field_key text, resolved via a map at install" convention
-- resolve_template_dashboard_widget already established for dashboard
-- widgets (see supabase/template_dashboards_owner_sync.sql).

CREATE TABLE IF NOT EXISTS template_definition_default_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  table_slug text NOT NULL,
  columns jsonb,
  expansion_columns jsonb,
  column_widths jsonb,
  filters jsonb,
  sort jsonb,
  preset_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, table_slug)
);

ALTER TABLE template_definition_default_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_definition_default_views_rw ON template_definition_default_views
  USING (template_id IN (
    SELECT id FROM template_definitions
    WHERE is_published OR owner_company_id IN (SELECT active_company_id())
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM template_definitions
    WHERE owner_company_id IN (SELECT active_company_id() WHERE is_current_user_admin())
  ));

-- ── 3. template_definition_pages (+ its two rule tables) ────────────────
-- Three page kinds share one table (tagged via page_kind), each exported as
-- structure only, never live/client data:
--   - detailed_table: Detailed Table Pages (client_update_pages) -- title,
--     base table, column/field selection, visibility default. Never
--     `items` (the real matters/clients added), `access_code`, or
--     `client_label`.
--   - public_task: Public Task Pages (public_task_pages) -- despite the
--     name this is an authenticated, team-scoped saved task view (no
--     access_code/slug on that table at all). team_id is dropped -- not
--     portable to another company's teams, re-picked at install time same
--     as the manual creation flow already requires.
--   - document_fill_pack: document_fill_pages has no reusable structure of
--     its own (project_id is NOT NULL, access_code/client_name/draft_values
--     are all single-matter data) -- what's templatable is narrower: the
--     PATTERN of "bundle these document templates into one client fill
--     link", exported as a named pack (title + the bundled
--     document_templates.name's, not ids). Installed by name-matching
--     against the receiving company's own precedent library; a template
--     whose name doesn't exist for that company is simply skipped, not
--     blocking. Not auto-installed as a real document_fill_pages row
--     (that table requires a real project_id, which doesn't exist at
--     install time) -- surfaced as a suggestion instead, see
--     upgrade/install_company_template below.
CREATE TABLE IF NOT EXISTS template_definition_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  page_kind text NOT NULL CHECK (page_kind IN ('detailed_table', 'public_task', 'document_fill_pack')),
  title text NOT NULL,
  -- detailed_table only
  base_table text,
  source_template_table_id uuid REFERENCES template_definition_tables(id) ON DELETE SET NULL,
  columns jsonb,
  visibility text,
  date_format text,
  freeze_first_column boolean,
  redact_figures boolean,
  ai_ask_enabled boolean,
  ai_ask_scope text,
  -- public_task only (columns above is shared/reused for its own column list)
  scope text,
  -- document_fill_pack only
  document_template_names jsonb,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE template_definition_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_definition_pages_rw ON template_definition_pages
  USING (template_id IN (
    SELECT id FROM template_definitions
    WHERE is_published OR owner_company_id IN (SELECT active_company_id())
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM template_definitions
    WHERE owner_company_id IN (SELECT active_company_id() WHERE is_current_user_admin())
  ));

CREATE TABLE IF NOT EXISTS template_definition_page_format_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_page_id uuid NOT NULL REFERENCES template_definition_pages(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  value text,
  color text,
  display_order int NOT NULL DEFAULT 0
);

ALTER TABLE template_definition_page_format_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_definition_page_format_rules_rw ON template_definition_page_format_rules
  USING (template_page_id IN (
    SELECT p.id FROM template_definition_pages p JOIN template_definitions td ON td.id = p.template_id
    WHERE td.is_published OR td.owner_company_id IN (SELECT active_company_id())
  ))
  WITH CHECK (template_page_id IN (
    SELECT p.id FROM template_definition_pages p JOIN template_definitions td ON td.id = p.template_id
    WHERE td.owner_company_id IN (SELECT active_company_id() WHERE is_current_user_admin())
  ));

CREATE TABLE IF NOT EXISTS template_definition_page_auto_add_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_page_id uuid NOT NULL REFERENCES template_definition_pages(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  operator text NOT NULL,
  value text,
  is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE template_definition_page_auto_add_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY template_definition_page_auto_add_rules_rw ON template_definition_page_auto_add_rules
  USING (template_page_id IN (
    SELECT p.id FROM template_definition_pages p JOIN template_definitions td ON td.id = p.template_id
    WHERE td.is_published OR td.owner_company_id IN (SELECT active_company_id())
  ))
  WITH CHECK (template_page_id IN (
    SELECT p.id FROM template_definition_pages p JOIN template_definitions td ON td.id = p.template_id
    WHERE td.owner_company_id IN (SELECT active_company_id() WHERE is_current_user_admin())
  ));

-- ── 4. Export RPCs ───────────────────────────────────────────────────────
-- All SECURITY DEFINER with a manual auth.uid()/company_memberships check,
-- matching sync_template_dashboards_from_company's existing convention
-- exactly (see supabase/template_dashboards_owner_sync.sql) -- this is the
-- established pattern for "push this company's live config into a template
-- it owns" functions in this codebase, reachable directly via
-- supabase.rpc() from the caller's own session.

-- Ports components/CustomTableBuilder.tsx's old handlePublish (client-side,
-- always-new-template) logic here, now targeting an existing template and
-- covering multiple tables in one call. Same-batch relations (a linked_
-- table_id pointing at ANOTHER table also in p_table_ids) resolve
-- correctly via the temp map below; a relation to a custom table NOT in
-- this batch is dropped, same limitation the original had ("nothing to
-- resolve them against outside this single table's export").
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

  -- Pass 1: table shells
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

  -- Pass 2: fields, wiped and reinserted fresh each sync (simplest correct
  -- approach -- template_definition_table_fields has no external FK
  -- pointing at individual field rows, widget configs reference by
  -- field_key text, not id).
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

-- Ports components/SchemaVisualisation.tsx's old handlePublishSystemFields
-- (client-side, always-new-template) logic here, now targeting an existing
-- template.
CREATE OR REPLACE FUNCTION sync_template_system_fields_from_company(p_template_id uuid, p_table_name text, p_field_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_owner uuid;
  v_fld RECORD;
  v_existing_id uuid;
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

  FOR v_fld IN
    SELECT * FROM company_custom_fields
    WHERE id = ANY(p_field_ids) AND company_id = v_owner AND table_name = p_table_name AND deleted_at IS NULL
  LOOP
    SELECT id INTO v_existing_id FROM template_definition_system_fields
      WHERE template_id = p_template_id AND table_name = p_table_name AND field_key = v_fld.field_key;
    IF v_existing_id IS NOT NULL THEN
      UPDATE template_definition_system_fields SET
        label = v_fld.label, field_type = v_fld.field_type, select_options = v_fld.select_options,
        is_required = v_fld.is_required, is_unique = v_fld.is_unique, display_order = v_fld.display_order,
        section_name = v_fld.section_name, help_text = v_fld.help_text, default_value = v_fld.default_value,
        auto_generate = v_fld.auto_generate, auto_generate_type = v_fld.auto_generate_type, auto_generate_prefix = v_fld.auto_generate_prefix,
        linked_table = v_fld.linked_table, linked_display_column = v_fld.linked_display_column
      WHERE id = v_existing_id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO template_definition_system_fields (
        template_id, table_name, field_key, label, field_type, select_options,
        is_required, is_unique, display_order, section_name, help_text, default_value,
        auto_generate, auto_generate_type, auto_generate_prefix, linked_table, linked_display_column
      ) VALUES (
        p_template_id, p_table_name, v_fld.field_key, v_fld.label, v_fld.field_type, v_fld.select_options,
        v_fld.is_required, v_fld.is_unique, v_fld.display_order, v_fld.section_name, v_fld.help_text, v_fld.default_value,
        v_fld.auto_generate, v_fld.auto_generate_type, v_fld.auto_generate_prefix, v_fld.linked_table, v_fld.linked_display_column
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated);
END;
$$;

-- Widen the existing owner-dashboard-sync entry point to accept explicit id
-- lists so the consolidated modal's per-item checkboxes control exactly
-- what gets synced -- NULL on either param preserves the exact existing
-- "sync everything" behavior, so nothing that already calls this (the old
-- "Sync dashboards" button) breaks. Body otherwise identical to the current
-- definition in supabase/template_record_tabs.sql (both passes), just with
-- an id filter added to each loop.
CREATE OR REPLACE FUNCTION sync_template_dashboards_from_company(
  p_template_id uuid, p_dashboard_ids uuid[] DEFAULT NULL, p_record_tab_ids uuid[] DEFAULT NULL
)
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

  -- ── Pass 1: table dashboards ───────────────────────────────────────────
  FOR v_dash IN
    SELECT * FROM company_dashboards
    WHERE company_id = v_owner AND deleted_at IS NULL
      AND (p_dashboard_ids IS NULL OR id = ANY(p_dashboard_ids))
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
  FOR v_tab IN
    SELECT DISTINCT ON (t.record_table, t.linked_table_id)
        t.*, w.widgets AS tab_widgets
      FROM record_tabs t
      JOIN record_tab_dashboard_widgets w ON w.tab_id = t.id
      WHERE t.company_id = v_owner AND t.tab_type = 'custom_dashboard' AND t.linked_table_id IS NOT NULL
        AND (p_record_tab_ids IS NULL OR t.id = ANY(p_record_tab_ids))
      ORDER BY t.record_table, t.linked_table_id, t.created_at DESC
  LOOP
    SELECT source_template_table_id INTO v_linked_template_table_id
      FROM company_template_table_map
      WHERE company_id = v_owner AND template_id = p_template_id
        AND installed_company_table_id = v_tab.linked_table_id;
    IF v_linked_template_table_id IS NULL THEN CONTINUE; END IF;

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

-- Snapshot of company_default_views (columns/expansion_columns/column_widths/
-- filters/sort/preset_name -- covers "default views"/"default sort"/
-- "default filter" in one row). Only ever considers company-wide views
-- (team_id/user_id both null) -- a team/person-scoped override is
-- inherently non-portable to another company's teams/people.
--
-- remap_default_view_field_ref is direction-agnostic (same idea as
-- map_dashboard_widget_fields): export passes a map keyed by the LIVE
-- field uuid -> portable "<table_slug>.<field_key>" string; install passes
-- the reverse, "<table_slug>.<field_key>" -> the newly-installed field's
-- uuid. Only "custom_field:" prefixed refs are ever touched -- plain base
-- column names (system tables) pass through untouched either way.
CREATE OR REPLACE FUNCTION remap_default_view_field_ref(p_ref text, p_map jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_ref LIKE 'custom_field:%' AND p_map ? substring(p_ref from 14)
      THEN 'custom_field:' || (p_map->>substring(p_ref from 14))
    ELSE p_ref
  END;
$$;

CREATE OR REPLACE FUNCTION sync_template_default_views_from_company(p_template_id uuid, p_view_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_owner uuid;
  v_view RECORD;
  v_map jsonb;
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

  FOR v_view IN
    SELECT * FROM company_default_views
    WHERE id = ANY(p_view_ids) AND company_id = v_owner AND team_id IS NULL AND user_id IS NULL
  LOOP
    -- Only populated (and only relevant) for a custom-table view -- a
    -- system-table view (projects/entities/properties) uses plain base
    -- column names throughout, nothing to map.
    SELECT jsonb_object_agg(ctf.id::text, v_view.table_slug || '.' || ctf.field_key) INTO v_map
      FROM company_table_fields ctf
      JOIN company_tables ct ON ct.id = ctf.table_id
      WHERE ct.company_id = v_owner AND ct.slug = v_view.table_slug AND ctf.deleted_at IS NULL;
    v_map := COALESCE(v_map, '{}'::jsonb);

    IF EXISTS (SELECT 1 FROM template_definition_default_views WHERE template_id = p_template_id AND table_slug = v_view.table_slug) THEN
      UPDATE template_definition_default_views SET
        columns = (SELECT COALESCE(jsonb_agg(remap_default_view_field_ref(c, v_map)), '[]'::jsonb) FROM jsonb_array_elements_text(COALESCE(v_view.columns, '[]'::jsonb)) AS c),
        expansion_columns = (SELECT COALESCE(jsonb_agg(remap_default_view_field_ref(c, v_map)), '[]'::jsonb) FROM jsonb_array_elements_text(COALESCE(v_view.expansion_columns, '[]'::jsonb)) AS c),
        column_widths = (SELECT COALESCE(jsonb_object_agg(remap_default_view_field_ref(key, v_map), value), '{}'::jsonb) FROM jsonb_each(COALESCE(v_view.column_widths, '{}'::jsonb))),
        filters = (SELECT COALESCE(jsonb_agg(f.value || jsonb_build_object('fieldId', remap_default_view_field_ref(f.value->>'fieldId', v_map))), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(v_view.filters, '[]'::jsonb)) AS f(value)),
        sort = CASE WHEN v_view.sort IS NULL THEN NULL ELSE v_view.sort || jsonb_build_object('colId', remap_default_view_field_ref(v_view.sort->>'colId', v_map)) END,
        preset_name = v_view.preset_name
      WHERE template_id = p_template_id AND table_slug = v_view.table_slug;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO template_definition_default_views (template_id, table_slug, columns, expansion_columns, column_widths, filters, sort, preset_name)
      VALUES (
        p_template_id, v_view.table_slug,
        (SELECT COALESCE(jsonb_agg(remap_default_view_field_ref(c, v_map)), '[]'::jsonb) FROM jsonb_array_elements_text(COALESCE(v_view.columns, '[]'::jsonb)) AS c),
        (SELECT COALESCE(jsonb_agg(remap_default_view_field_ref(c, v_map)), '[]'::jsonb) FROM jsonb_array_elements_text(COALESCE(v_view.expansion_columns, '[]'::jsonb)) AS c),
        (SELECT COALESCE(jsonb_object_agg(remap_default_view_field_ref(key, v_map), value), '{}'::jsonb) FROM jsonb_each(COALESCE(v_view.column_widths, '{}'::jsonb))),
        (SELECT COALESCE(jsonb_agg(f.value || jsonb_build_object('fieldId', remap_default_view_field_ref(f.value->>'fieldId', v_map))), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(v_view.filters, '[]'::jsonb)) AS f(value)),
        CASE WHEN v_view.sort IS NULL THEN NULL ELSE v_view.sort || jsonb_build_object('colId', remap_default_view_field_ref(v_view.sort->>'colId', v_map)) END,
        v_view.preset_name
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', v_created, 'updated', v_updated);
END;
$$;

-- Covers all three page kinds (tagged via page_kind) in one call, since the
-- modal's Pages section submits all three id lists together. See this
-- migration's own header comment on template_definition_pages for what each
-- kind does and doesn't carry over.
CREATE OR REPLACE FUNCTION sync_template_pages_from_company(
  p_template_id uuid,
  p_detailed_table_page_ids uuid[] DEFAULT NULL,
  p_public_task_page_ids uuid[] DEFAULT NULL,
  p_document_fill_page_ids uuid[] DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_owner uuid;
  v_page RECORD;
  v_ptp RECORD;
  v_dfp RECORD;
  v_base_table_text text;
  v_source_template_table_id uuid;
  v_columns jsonb;
  v_doc_names jsonb;
  v_template_page_id uuid;
  v_pages_synced int := 0;
BEGIN
  SELECT owner_company_id INTO v_owner FROM template_definitions WHERE id = p_template_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'template not found'; END IF;
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_owner AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'only members of the template''s owner company can add to it';
  END IF;

  -- ── Detailed Table Pages ──────────────────────────────────────────────
  FOR v_page IN
    SELECT * FROM client_update_pages
    WHERE id = ANY(COALESCE(p_detailed_table_page_ids, ARRAY[]::uuid[])) AND company_id = v_owner
  LOOP
    IF v_page.base_table IN ('projects', 'entities', 'properties') THEN
      v_base_table_text := v_page.base_table;
      v_source_template_table_id := NULL;
    ELSE
      v_base_table_text := NULL;
      SELECT source_template_table_id INTO v_source_template_table_id FROM company_template_table_map
        WHERE company_id = v_owner AND template_id = p_template_id AND installed_company_table_id = v_page.source_table_id;
      -- The page's own custom table isn't (yet) part of this template --
      -- nothing portable to point it at, so this page is skipped rather
      -- than exported with a dangling reference.
      IF v_source_template_table_id IS NULL THEN CONTINUE; END IF;
    END IF;

    -- client_update_page_fields.field_key is already a portable text key
    -- (see lib/clientUpdatePageTableResolver.ts) -- no id resolution needed.
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'field_source', f.field_source, 'field_key', f.field_key, 'label', f.label,
        'display_order', f.display_order, 'client_visible', f.client_visible,
        'field_type', f.field_type, 'select_options', f.select_options
      ) ORDER BY f.display_order), '[]'::jsonb) INTO v_columns
    FROM client_update_page_fields f WHERE f.page_id = v_page.id;

    SELECT id INTO v_template_page_id FROM template_definition_pages
      WHERE template_id = p_template_id AND page_kind = 'detailed_table' AND title = v_page.title;

    IF v_template_page_id IS NOT NULL THEN
      UPDATE template_definition_pages SET
        base_table = v_base_table_text, source_template_table_id = v_source_template_table_id, columns = v_columns,
        visibility = v_page.visibility, date_format = v_page.date_format, freeze_first_column = v_page.freeze_first_column,
        redact_figures = v_page.redact_figures, ai_ask_enabled = v_page.ai_ask_enabled, ai_ask_scope = v_page.ai_ask_scope
      WHERE id = v_template_page_id;
      DELETE FROM template_definition_page_format_rules WHERE template_page_id = v_template_page_id;
      DELETE FROM template_definition_page_auto_add_rules WHERE template_page_id = v_template_page_id;
    ELSE
      INSERT INTO template_definition_pages (
        template_id, page_kind, title, base_table, source_template_table_id, columns,
        visibility, date_format, freeze_first_column, redact_figures, ai_ask_enabled, ai_ask_scope, display_order
      ) VALUES (
        p_template_id, 'detailed_table', v_page.title, v_base_table_text, v_source_template_table_id, v_columns,
        v_page.visibility, v_page.date_format, v_page.freeze_first_column, v_page.redact_figures, v_page.ai_ask_enabled, v_page.ai_ask_scope,
        (SELECT COALESCE(MAX(display_order), -1) + 1 FROM template_definition_pages WHERE template_id = p_template_id)
      ) RETURNING id INTO v_template_page_id;
    END IF;

    -- Format rules key off client_update_page_fields.id, which already has
    -- a portable field_key one join away.
    INSERT INTO template_definition_page_format_rules (template_page_id, field_key, value, color, display_order)
    SELECT v_template_page_id, cpf.field_key, r.value, r.color, r.display_order
    FROM client_update_page_format_rules r JOIN client_update_page_fields cpf ON cpf.id = r.field_id
    WHERE r.page_id = v_page.id;

    -- Auto-add rules key off the REAL underlying field id (company_custom_
    -- fields for a system base_table, company_table_fields for a custom
    -- one) -- resolve whichever one actually matches to its field_key.
    INSERT INTO template_definition_page_auto_add_rules (template_page_id, field_key, operator, value, is_active)
    SELECT v_template_page_id,
      COALESCE(
        (SELECT field_key FROM company_custom_fields WHERE id = r.field_id AND company_id = v_owner),
        (SELECT field_key FROM company_table_fields WHERE id = r.field_id)
      ),
      r.operator, r.value, r.is_active
    FROM client_update_auto_add_rules r WHERE r.page_id = v_page.id;

    v_pages_synced := v_pages_synced + 1;
  END LOOP;

  -- ── Public Task Pages ─────────────────────────────────────────────────
  -- columns copied as-is (no id-resolution) -- Tasks custom fields are rare
  -- enough that this matches this page kind's existing "no server-side
  -- authoring" simplicity rather than adding a third resolution path.
  FOR v_ptp IN
    SELECT * FROM public_task_pages
    WHERE id = ANY(COALESCE(p_public_task_page_ids, ARRAY[]::uuid[])) AND company_id = v_owner
  LOOP
    SELECT id INTO v_template_page_id FROM template_definition_pages
      WHERE template_id = p_template_id AND page_kind = 'public_task' AND title = v_ptp.title;
    IF v_template_page_id IS NOT NULL THEN
      UPDATE template_definition_pages SET scope = v_ptp.scope, columns = v_ptp.columns WHERE id = v_template_page_id;
    ELSE
      INSERT INTO template_definition_pages (template_id, page_kind, title, scope, columns, display_order)
      VALUES (p_template_id, 'public_task', v_ptp.title, v_ptp.scope, v_ptp.columns,
        (SELECT COALESCE(MAX(display_order), -1) + 1 FROM template_definition_pages WHERE template_id = p_template_id));
    END IF;
    v_pages_synced := v_pages_synced + 1;
  END LOOP;

  -- ── Document Fill packs ───────────────────────────────────────────────
  -- Named by the bundled document_templates.name's, not ids -- see this
  -- migration's header comment for why (project_id-bound, no portable id
  -- to carry).
  FOR v_dfp IN
    SELECT * FROM document_fill_pages
    WHERE id = ANY(COALESCE(p_document_fill_page_ids, ARRAY[]::uuid[])) AND company_id = v_owner
  LOOP
    SELECT COALESCE(jsonb_agg(dt.name), '[]'::jsonb) INTO v_doc_names
    FROM document_fill_page_templates dfpt JOIN document_templates dt ON dt.id = dfpt.template_id
    WHERE dfpt.page_id = v_dfp.id;

    SELECT id INTO v_template_page_id FROM template_definition_pages
      WHERE template_id = p_template_id AND page_kind = 'document_fill_pack' AND title = v_dfp.title;
    IF v_template_page_id IS NOT NULL THEN
      UPDATE template_definition_pages SET document_template_names = v_doc_names WHERE id = v_template_page_id;
    ELSE
      INSERT INTO template_definition_pages (template_id, page_kind, title, document_template_names, display_order)
      VALUES (p_template_id, 'document_fill_pack', v_dfp.title, v_doc_names,
        (SELECT COALESCE(MAX(display_order), -1) + 1 FROM template_definition_pages WHERE template_id = p_template_id));
    END IF;
    v_pages_synced := v_pages_synced + 1;
  END LOOP;

  RETURN jsonb_build_object('pages_synced', v_pages_synced);
END;
$$;

-- p_include: { tableLabelOverrides: bool, invoiceSettings: bool,
-- tablesVisibility: bool }. invoiceSettings is built as an explicit
-- allowlist (creditTerms/otherTerms/paymentTermsDays/templates), never a
-- copy with keys removed -- bankDetails and firmAddress (company-
-- identifying, not reusable structure) are never selected, so there's no
-- way for them to end up in a template regardless of what's passed here.
CREATE OR REPLACE FUNCTION sync_template_settings_from_company(p_template_id uuid, p_include jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_owner uuid;
  v_company RECORD;
  v_settings jsonb;
BEGIN
  SELECT owner_company_id INTO v_owner FROM template_definitions WHERE id = p_template_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'template not found'; END IF;
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_owner AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'only members of the template''s owner company can add to it';
  END IF;

  SELECT * INTO v_company FROM companies WHERE id = v_owner;
  SELECT COALESCE(settings_template, '{}'::jsonb) INTO v_settings FROM template_definitions WHERE id = p_template_id;

  IF COALESCE((p_include->>'tableLabelOverrides')::boolean, false) THEN
    v_settings := jsonb_set(v_settings, '{tableLabelOverrides}', COALESCE(v_company.table_label_overrides, '{}'::jsonb));
  END IF;

  IF COALESCE((p_include->>'invoiceSettings')::boolean, false) THEN
    v_settings := jsonb_set(v_settings, '{invoiceSettings}', jsonb_build_object(
      'creditTerms', v_company.invoice_settings->'creditTerms',
      'otherTerms', v_company.invoice_settings->'otherTerms',
      'paymentTermsDays', v_company.invoice_settings->'paymentTermsDays',
      'templates', v_company.invoice_settings->'templates'
    ));
  END IF;

  UPDATE template_definitions SET settings_template = v_settings WHERE id = p_template_id;

  IF COALESCE((p_include->>'tablesVisibility')::boolean, false) THEN
    UPDATE template_definitions SET disabled_system_tables = v_company.disabled_system_tables WHERE id = p_template_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
