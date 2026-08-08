-- Mirrors 20260808180300_install_extras.sql's additions onto
-- upgrade_company_template, for the same reason install got them: a
-- company that installed a template before it had default views/pages/
-- settings should be able to pull those in later via upgrade, not just new
-- tables/fields/dashboards. Same opt-in shape (p_install_extras), same
-- non-destructive skip-if-already-present rules.
DROP FUNCTION IF EXISTS upgrade_company_template(uuid, uuid, jsonb, boolean);

CREATE OR REPLACE FUNCTION upgrade_company_template(
  p_company_id uuid,
  p_template_id uuid,
  p_resolutions jsonb DEFAULT '{}'::jsonb,
  p_install_dashboards boolean DEFAULT false,
  p_install_extras jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- This function is SECURITY DEFINER and reachable directly via
  -- supabase.rpc() by any authenticated client -- see the same note on
  -- install_company_template in template_marketplace.sql.
  p_actor uuid := auth.uid();
  v_tbl RECORD;
  v_fld RECORD;
  v_sf RECORD;
  v_view RECORD;
  v_page RECORD;
  v_resolution text;
  v_existing_id uuid;
  v_explicit_existing_id uuid;
  v_new_table_id uuid;
  v_new_field_id uuid;
  v_new_slug text;
  v_new_key text;
  v_suffix int;
  v_linked_table_id uuid;
  v_target_table_id uuid;
  v_tables_created int := 0;
  v_fields_created int := 0;
  v_dashboards_created int := 0;
  v_formula_table_id uuid;
  v_a_id uuid;
  v_b_id uuid;
  v_rel_id uuid;
  v_disabled jsonb;
  v_map jsonb;
  v_overrides jsonb;
  v_base_table_text text;
  v_source_company_table_id uuid;
  v_new_page_id uuid;
  v_document_packs_suggested jsonb := '[]'::jsonb;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM company_template_installs WHERE company_id = p_company_id AND template_id = p_template_id) THEN
    RAISE EXCEPTION 'template is not installed for this company -- use install_company_template first';
  END IF;

  -- Pass 1: any template table not yet mapped for this company (added to
  -- the template's catalog after this company's original install).
  FOR v_tbl IN SELECT * FROM template_definition_tables WHERE template_id = p_template_id ORDER BY display_order LOOP
    IF EXISTS (
      SELECT 1 FROM company_template_table_map
      WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_table_id = v_tbl.id
    ) THEN
      CONTINUE;
    END IF;

    v_resolution := COALESCE(p_resolutions->'tables'->>v_tbl.slug, 'create_new');
    IF v_resolution = 'use_existing' THEN
      SELECT id INTO v_existing_id FROM company_tables WHERE company_id = p_company_id AND slug = v_tbl.slug AND deleted_at IS NULL LIMIT 1;
      IF v_existing_id IS NULL THEN
        RAISE EXCEPTION 'use_existing chosen for table % but no matching table exists', v_tbl.slug;
      END IF;
      INSERT INTO company_template_table_map (company_id, template_id, source_template_table_id, installed_company_table_id, resolution)
        VALUES (p_company_id, p_template_id, v_tbl.id, v_existing_id, 'used_existing');
    ELSE
      v_new_slug := v_tbl.slug;
      v_suffix := 1;
      WHILE EXISTS (SELECT 1 FROM company_tables WHERE company_id = p_company_id AND slug = v_new_slug AND deleted_at IS NULL) LOOP
        v_suffix := v_suffix + 1;
        v_new_slug := v_tbl.slug || '-' || v_suffix;
      END LOOP;

      INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key, display_order, is_ledger)
        VALUES (p_company_id, v_tbl.name, v_new_slug, v_tbl.icon, v_tbl.color, v_tbl.primary_field_key, v_tbl.display_order, v_tbl.is_ledger)
        RETURNING id INTO v_new_table_id;
      v_tables_created := v_tables_created + 1;

      INSERT INTO company_template_table_map (company_id, template_id, source_template_table_id, installed_company_table_id, resolution)
        VALUES (p_company_id, p_template_id, v_tbl.id, v_new_table_id, 'created');

      INSERT INTO schema_change_log (company_id, actor_id, entity_type, entity_id, entity_label, action, after)
        VALUES (p_company_id, p_actor, 'company_table', v_new_table_id, v_tbl.name, 'create',
          jsonb_build_object('name', v_tbl.name, 'slug', v_new_slug, 'from_template', p_template_id, 'via', 'upgrade'));
    END IF;
  END LOOP;

  -- Pass 2: any template field not yet present on its mapped table.
  FOR v_tbl IN SELECT * FROM template_definition_tables WHERE template_id = p_template_id LOOP
    SELECT installed_company_table_id, resolution INTO v_target_table_id, v_resolution
      FROM company_template_table_map
      WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_table_id = v_tbl.id;
    IF v_target_table_id IS NULL OR v_resolution IS DISTINCT FROM 'created' THEN CONTINUE; END IF;

    FOR v_fld IN SELECT * FROM template_definition_table_fields WHERE template_table_id = v_tbl.id ORDER BY display_order LOOP
      IF EXISTS (SELECT 1 FROM company_table_fields WHERE table_id = v_target_table_id AND field_key = v_fld.field_key AND deleted_at IS NULL) THEN
        CONTINUE;
      END IF;

      v_linked_table_id := NULL;
      IF v_fld.linked_template_table_id IS NOT NULL THEN
        SELECT installed_company_table_id INTO v_linked_table_id FROM company_template_table_map
          WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_table_id = v_fld.linked_template_table_id;
      END IF;

      INSERT INTO company_table_fields (
        company_id, table_id, field_key, label, field_type, select_options,
        linked_table_id, linked_system_table, linked_display_field,
        is_required, is_unique, show_in_table, display_order, section_name, help_text,
        auto_number_prefix, auto_number_start, auto_number_pad
      ) VALUES (
        p_company_id, v_target_table_id, v_fld.field_key, v_fld.label, v_fld.field_type, v_fld.select_options,
        v_linked_table_id, v_fld.linked_system_table, v_fld.linked_display_field,
        v_fld.is_required, v_fld.is_unique, v_fld.show_in_table, v_fld.display_order, v_fld.section_name, v_fld.help_text,
        v_fld.auto_number_prefix, v_fld.auto_number_start, v_fld.auto_number_pad
      );
      v_fields_created := v_fields_created + 1;
    END LOOP;
  END LOOP;

  -- Pass 3: (re)resolve formula wiring for any field that has formula_type
  -- in the catalog but not yet on the installed field.
  FOR v_tbl IN SELECT * FROM template_definition_tables WHERE template_id = p_template_id LOOP
    SELECT installed_company_table_id, resolution INTO v_target_table_id, v_resolution
      FROM company_template_table_map
      WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_table_id = v_tbl.id;
    IF v_target_table_id IS NULL OR v_resolution IS DISTINCT FROM 'created' THEN CONTINUE; END IF;

    FOR v_fld IN SELECT * FROM template_definition_table_fields
      WHERE template_table_id = v_tbl.id AND formula_type IS NOT NULL LOOP

      IF EXISTS (
        SELECT 1 FROM company_table_fields
        WHERE table_id = v_target_table_id AND field_key = v_fld.field_key AND deleted_at IS NULL AND formula_type IS NOT NULL
      ) THEN CONTINUE; END IF;

      IF v_fld.formula_type = 'sum_related' THEN
        SELECT m.installed_company_table_id INTO v_formula_table_id
          FROM template_definition_tables tt
          JOIN company_template_table_map m ON m.source_template_table_id = tt.id AND m.company_id = p_company_id AND m.template_id = p_template_id
          WHERE tt.template_id = p_template_id AND tt.slug = v_fld.formula_related_table_slug;
      ELSE
        v_formula_table_id := v_target_table_id;
      END IF;
      IF v_formula_table_id IS NULL THEN CONTINUE; END IF;

      v_a_id := NULL; v_b_id := NULL; v_rel_id := NULL;
      SELECT id INTO v_a_id FROM company_table_fields
        WHERE table_id = v_formula_table_id AND field_key = v_fld.formula_field_a_key AND deleted_at IS NULL;
      IF v_fld.formula_field_b_key IS NOT NULL THEN
        SELECT id INTO v_b_id FROM company_table_fields
          WHERE table_id = v_formula_table_id AND field_key = v_fld.formula_field_b_key AND deleted_at IS NULL;
      END IF;
      IF v_fld.formula_relation_field_key IS NOT NULL THEN
        SELECT id INTO v_rel_id FROM company_table_fields
          WHERE table_id = v_formula_table_id AND field_key = v_fld.formula_relation_field_key AND deleted_at IS NULL;
      END IF;

      UPDATE company_table_fields SET
        formula_type = v_fld.formula_type,
        formula_field_a_id = v_a_id,
        formula_field_b_id = v_b_id,
        formula_percent = v_fld.formula_percent,
        formula_relation_field_id = v_rel_id
      WHERE table_id = v_target_table_id AND field_key = v_fld.field_key AND deleted_at IS NULL;
    END LOOP;
  END LOOP;

  -- Pass 4: dashboards, only when the user opted in.
  IF p_install_dashboards THEN
    SELECT install_template_dashboards(p_company_id, p_template_id) INTO v_dashboards_created;
  END IF;

  -- System fields (entities/projects/properties): any not yet mapped.
  FOR v_sf IN SELECT * FROM template_definition_system_fields WHERE template_id = p_template_id ORDER BY display_order LOOP
    IF EXISTS (
      SELECT 1 FROM company_template_field_map
      WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_system_field_id = v_sf.id
    ) THEN
      CONTINUE;
    END IF;

    v_resolution := COALESCE(p_resolutions->'systemFields'->>(v_sf.table_name || ':' || v_sf.field_key), 'create_new');
    IF v_resolution = 'use_existing' THEN
      v_explicit_existing_id := NULLIF(p_resolutions->'systemFieldExistingIds'->>(v_sf.table_name || ':' || v_sf.field_key), '')::uuid;
      IF v_explicit_existing_id IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM company_custom_fields
          WHERE id = v_explicit_existing_id AND company_id = p_company_id AND table_name = v_sf.table_name AND deleted_at IS NULL LIMIT 1;
      ELSE
        SELECT id INTO v_existing_id FROM company_custom_fields
          WHERE company_id = p_company_id AND table_name = v_sf.table_name AND field_key = v_sf.field_key AND deleted_at IS NULL LIMIT 1;
      END IF;
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
          jsonb_build_object('table_name', v_sf.table_name, 'field_key', v_new_key, 'from_template', p_template_id, 'via', 'upgrade'));
    END IF;
  END LOOP;

  -- ── Extras (all opt-in, all additive/non-destructive) ──────────────────
  -- Identical logic to install_company_template's own extras block -- see
  -- that function's comments for why each rule is the way it is.

  IF COALESCE((p_install_extras->>'tablesVisibility')::boolean, false) THEN
    SELECT disabled_system_tables INTO v_disabled FROM template_definitions WHERE id = p_template_id;
    IF v_disabled IS NOT NULL AND v_disabled <> '{}'::jsonb THEN
      UPDATE companies SET disabled_system_tables = disabled_system_tables || v_disabled WHERE id = p_company_id;
    END IF;
  END IF;

  IF COALESCE((p_install_extras->>'defaultViews')::boolean, false) THEN
    FOR v_view IN SELECT * FROM template_definition_default_views WHERE template_id = p_template_id LOOP
      IF EXISTS (SELECT 1 FROM company_default_views WHERE company_id = p_company_id AND table_slug = v_view.table_slug AND team_id IS NULL AND user_id IS NULL) THEN
        CONTINUE;
      END IF;
      SELECT jsonb_object_agg(v_view.table_slug || '.' || ctf.field_key, ctf.id::text) INTO v_map
        FROM company_table_fields ctf JOIN company_tables ct ON ct.id = ctf.table_id
        WHERE ct.company_id = p_company_id AND ct.slug = v_view.table_slug AND ctf.deleted_at IS NULL;
      v_map := COALESCE(v_map, '{}'::jsonb);
      INSERT INTO company_default_views (company_id, table_slug, columns, expansion_columns, column_widths, filters, sort, preset_name, created_by)
      VALUES (
        p_company_id, v_view.table_slug,
        (SELECT COALESCE(jsonb_agg(remap_default_view_field_ref(c, v_map)), '[]'::jsonb) FROM jsonb_array_elements_text(COALESCE(v_view.columns, '[]'::jsonb)) AS c),
        (SELECT COALESCE(jsonb_agg(remap_default_view_field_ref(c, v_map)), '[]'::jsonb) FROM jsonb_array_elements_text(COALESCE(v_view.expansion_columns, '[]'::jsonb)) AS c),
        (SELECT COALESCE(jsonb_object_agg(remap_default_view_field_ref(key, v_map), value), '{}'::jsonb) FROM jsonb_each(COALESCE(v_view.column_widths, '{}'::jsonb))),
        (SELECT COALESCE(jsonb_agg(f.value || jsonb_build_object('fieldId', remap_default_view_field_ref(f.value->>'fieldId', v_map))), '[]'::jsonb) FROM jsonb_array_elements(COALESCE(v_view.filters, '[]'::jsonb)) AS f(value)),
        CASE WHEN v_view.sort IS NULL THEN NULL ELSE v_view.sort || jsonb_build_object('colId', remap_default_view_field_ref(v_view.sort->>'colId', v_map)) END,
        v_view.preset_name, p_actor
      );
    END LOOP;
  END IF;

  IF COALESCE((p_install_extras->>'pages')::boolean, false) THEN
    FOR v_page IN SELECT * FROM template_definition_pages WHERE template_id = p_template_id AND page_kind = 'detailed_table' ORDER BY display_order LOOP
      IF EXISTS (SELECT 1 FROM client_update_pages WHERE company_id = p_company_id AND title = v_page.title) THEN CONTINUE; END IF;

      IF v_page.base_table IS NOT NULL THEN
        v_base_table_text := v_page.base_table;
        v_source_company_table_id := NULL;
      ELSE
        v_base_table_text := NULL;
        SELECT installed_company_table_id INTO v_source_company_table_id FROM company_template_table_map
          WHERE company_id = p_company_id AND template_id = p_template_id AND source_template_table_id = v_page.source_template_table_id;
        IF v_source_company_table_id IS NULL THEN CONTINUE; END IF;
      END IF;

      v_new_slug := regexp_replace(lower(v_page.title), '[^a-z0-9]+', '-', 'g');
      v_suffix := 1;
      WHILE EXISTS (SELECT 1 FROM client_update_pages WHERE slug = v_new_slug) LOOP
        v_suffix := v_suffix + 1;
        v_new_slug := regexp_replace(lower(v_page.title), '[^a-z0-9]+', '-', 'g') || '-' || v_suffix;
      END LOOP;

      INSERT INTO client_update_pages (
        company_id, title, slug, access_code, visibility, base_table, source_table_id,
        date_format, freeze_first_column, redact_figures, ai_ask_enabled, ai_ask_scope, created_by
      ) VALUES (
        p_company_id, v_page.title, v_new_slug,
        CASE WHEN v_page.visibility = 'public' THEN lpad(floor(random() * 900000 + 100000)::text, 6, '0') ELSE NULL END,
        COALESCE(v_page.visibility, 'team'), COALESCE(v_base_table_text, v_source_company_table_id::text), v_source_company_table_id,
        v_page.date_format, v_page.freeze_first_column, v_page.redact_figures, v_page.ai_ask_enabled, v_page.ai_ask_scope, p_actor
      ) RETURNING id INTO v_new_page_id;

      IF v_page.columns IS NOT NULL THEN
        INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
        SELECT v_new_page_id, c->>'field_source', c->>'field_key', c->>'label', (c->>'display_order')::int, (c->>'client_visible')::boolean, c->>'field_type', c->'select_options'
        FROM jsonb_array_elements(v_page.columns) AS c;
      END IF;

      INSERT INTO client_update_page_format_rules (page_id, field_id, value, color, display_order)
      SELECT v_new_page_id, cpf.id, r.value, r.color, r.display_order
      FROM template_definition_page_format_rules r
      JOIN client_update_page_fields cpf ON cpf.page_id = v_new_page_id AND cpf.field_key = r.field_key
      WHERE r.template_page_id = v_page.id;

      INSERT INTO client_update_auto_add_rules (page_id, field_id, operator, value, is_active)
      SELECT v_new_page_id,
        COALESCE(
          (SELECT id FROM company_custom_fields WHERE company_id = p_company_id AND table_name = v_base_table_text AND field_key = r.field_key AND deleted_at IS NULL),
          (SELECT id FROM company_table_fields WHERE table_id = v_source_company_table_id AND field_key = r.field_key AND deleted_at IS NULL)
        ),
        r.operator, r.value, r.is_active
      FROM template_definition_page_auto_add_rules r WHERE r.template_page_id = v_page.id;
    END LOOP;

    FOR v_page IN SELECT * FROM template_definition_pages WHERE template_id = p_template_id AND page_kind = 'public_task' ORDER BY display_order LOOP
      IF EXISTS (SELECT 1 FROM public_task_pages WHERE company_id = p_company_id AND title = v_page.title) THEN CONTINUE; END IF;
      INSERT INTO public_task_pages (company_id, title, scope, columns, created_by)
      VALUES (p_company_id, v_page.title, COALESCE(v_page.scope, 'my_and_unassigned'), v_page.columns, p_actor);
    END LOOP;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('title', title, 'documentTemplateNames', document_template_names)), '[]'::jsonb)
      INTO v_document_packs_suggested
      FROM template_definition_pages WHERE template_id = p_template_id AND page_kind = 'document_fill_pack';
  END IF;

  IF COALESCE((p_install_extras->>'settings')::boolean, false) THEN
    SELECT settings_template INTO v_overrides FROM template_definitions WHERE id = p_template_id;
    IF v_overrides ? 'tableLabelOverrides' THEN
      UPDATE companies SET table_label_overrides = table_label_overrides || (v_overrides->'tableLabelOverrides') WHERE id = p_company_id;
    END IF;
    IF v_overrides ? 'invoiceSettings' THEN
      UPDATE companies SET invoice_settings = invoice_settings || (v_overrides->'invoiceSettings') WHERE id = p_company_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'upgraded',
    'tables_created', v_tables_created, 'fields_created', v_fields_created, 'dashboards_created', v_dashboards_created,
    'document_packs_suggested', v_document_packs_suggested
  );
END;
$$;
