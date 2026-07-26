-- Owner dashboard sync: lets a template's owner company push its LIVE
-- dashboard configurations into the template catalog, so installs reproduce
-- the owner's curated setup -- field choices, widget positions, empty draft
-- rows, row-filter conditions, column widths, conditional highlights, pill
-- layouts -- instead of the hand-written seed JSON.
--
-- Two parts:
--  1. map_dashboard_widget_fields(widget, map): ONE direction-agnostic
--     field-reference mapper used both ways -- install passes a
--     field_key->id map (superseding resolve_template_dashboard_widget's
--     logic, which now delegates here), owner sync passes id->field_key.
--     Extends the previous resolver (see
--     template_marketplace_dashboards_my_tasks_button.sql) with the grid
--     settings it didn't know about: conditions, columnWidths,
--     columnHighlights (keys AND the nested condition's fieldId), and
--     fieldLayout on filter_bar/quick_add_form/grid. Scalars like
--     emptyRowCount/showTotalsRow/pillSize pass through untouched.
--  2. sync_template_dashboards_from_company(template_id): for every live
--     dashboard of the OWNER company bound to a template table, updates the
--     matching catalog row (matched via company_template_dashboard_map,
--     falling back to slug) or creates a new one, converting widgets to
--     field_key form. Dashboards without a template table binding (system
--     tables, non-template custom tables) and legacy dashboards without a
--     migrated `widgets` column are skipped and counted.

-- Object keyed by field references (columnWidths / fieldLayout): remap the
-- keys through p_map, dropping entries whose key doesn't resolve.
CREATE OR REPLACE FUNCTION remap_widget_key_object(p_obj jsonb, p_map jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    (SELECT jsonb_object_agg(p_map->>e.key, e.value)
       FROM jsonb_each(p_obj) AS e(key, value)
      WHERE p_map ? e.key),
    '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION map_dashboard_widget_fields(p_widget jsonb, p_map jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_type text := p_widget->>'type';
  v_config jsonb := p_widget->'config';
  v_key text;
  v_mapped text;
  v_ids jsonb;
  v_conditions jsonb;
  v_cond jsonb;
  v_series jsonb;
  v_one_series jsonb;
  v_obj jsonb;
  v_val jsonb;
  v_hl jsonb;
BEGIN
  IF v_type IN ('filter_bar', 'quick_add_form', 'grid') THEN
    v_ids := '[]'::jsonb;
    FOR v_key IN SELECT jsonb_array_elements_text(COALESCE(v_config->'fieldIds', '[]'::jsonb)) LOOP
      v_mapped := p_map->>v_key;
      IF v_mapped IS NOT NULL THEN v_ids := v_ids || to_jsonb(v_mapped); END IF;
    END LOOP;
    v_config := v_config || jsonb_build_object('fieldIds', v_ids);

    IF v_config ? 'fieldLayout' THEN
      v_config := v_config || jsonb_build_object('fieldLayout', remap_widget_key_object(v_config->'fieldLayout', p_map));
    END IF;
  END IF;

  IF v_type = 'grid' THEN
    IF v_config ? 'conditions' THEN
      v_conditions := '[]'::jsonb;
      FOR v_cond IN SELECT jsonb_array_elements(COALESCE(v_config->'conditions', '[]'::jsonb)) LOOP
        v_mapped := p_map->>(v_cond->>'fieldId');
        IF v_mapped IS NOT NULL THEN
          v_conditions := v_conditions || jsonb_build_array(v_cond || jsonb_build_object('fieldId', v_mapped));
        END IF;
      END LOOP;
      v_config := v_config || jsonb_build_object('conditions', v_conditions);
    END IF;

    IF v_config ? 'columnWidths' THEN
      v_config := v_config || jsonb_build_object('columnWidths', remap_widget_key_object(v_config->'columnWidths', p_map));
    END IF;

    IF v_config ? 'columnHighlights' THEN
      v_obj := '{}'::jsonb;
      FOR v_key, v_val IN SELECT * FROM jsonb_each(v_config->'columnHighlights') LOOP
        v_mapped := p_map->>v_key;
        IF v_mapped IS NULL THEN CONTINUE; END IF;
        v_hl := v_val;
        IF (v_hl->'condition') ? 'fieldId' AND p_map->>((v_hl->'condition')->>'fieldId') IS NOT NULL THEN
          v_hl := v_hl || jsonb_build_object(
            'condition', (v_hl->'condition') || jsonb_build_object('fieldId', p_map->>((v_hl->'condition')->>'fieldId')));
        END IF;
        v_obj := v_obj || jsonb_build_object(v_mapped, v_hl);
      END LOOP;
      v_config := v_config || jsonb_build_object('columnHighlights', v_obj);
    END IF;

  ELSIF v_type = 'summary_tile' THEN
    v_conditions := '[]'::jsonb;
    FOR v_cond IN SELECT jsonb_array_elements(COALESCE(v_config->'conditions', '[]'::jsonb)) LOOP
      v_mapped := p_map->>(v_cond->>'fieldId');
      IF v_mapped IS NOT NULL THEN
        v_conditions := v_conditions || jsonb_build_array(v_cond || jsonb_build_object('fieldId', v_mapped));
      END IF;
    END LOOP;
    v_config := v_config
      || jsonb_build_object('fieldId', p_map->>(v_config->>'fieldId'))
      || jsonb_build_object('conditions', v_conditions)
      || CASE WHEN v_config->>'fieldBId' IS NOT NULL THEN jsonb_build_object('fieldBId', p_map->>(v_config->>'fieldBId')) ELSE '{}'::jsonb END
      || CASE WHEN v_config->>'filterFieldId' IS NOT NULL THEN jsonb_build_object('filterFieldId', p_map->>(v_config->>'filterFieldId')) ELSE '{}'::jsonb END;

  ELSIF v_type = 'chart' THEN
    v_series := '[]'::jsonb;
    FOR v_one_series IN SELECT jsonb_array_elements(COALESCE(v_config->'series', '[]'::jsonb)) LOOP
      v_conditions := '[]'::jsonb;
      FOR v_cond IN SELECT jsonb_array_elements(COALESCE(v_one_series->'conditions', '[]'::jsonb)) LOOP
        v_mapped := p_map->>(v_cond->>'fieldId');
        IF v_mapped IS NOT NULL THEN
          v_conditions := v_conditions || jsonb_build_array(v_cond || jsonb_build_object('fieldId', v_mapped));
        END IF;
      END LOOP;
      v_series := v_series || jsonb_build_array(
        v_one_series
        || jsonb_build_object('conditions', v_conditions)
        || CASE WHEN v_one_series->>'valueFieldId' IS NOT NULL THEN jsonb_build_object('valueFieldId', p_map->>(v_one_series->>'valueFieldId')) ELSE '{}'::jsonb END
      );
    END LOOP;
    v_config := v_config
      || jsonb_build_object('dateFieldId', p_map->>(v_config->>'dateFieldId'))
      || jsonb_build_object('series', v_series)
      || CASE WHEN v_config->>'valueFieldId' IS NOT NULL THEN jsonb_build_object('valueFieldId', p_map->>(v_config->>'valueFieldId')) ELSE '{}'::jsonb END;

  ELSIF v_type = 'my_tasks_button' THEN
    v_config := v_config
      || CASE WHEN v_config->>'descriptionFieldId' IS NOT NULL THEN jsonb_build_object('descriptionFieldId', p_map->>(v_config->>'descriptionFieldId')) ELSE '{}'::jsonb END
      || CASE WHEN v_config->>'matterFieldId' IS NOT NULL THEN jsonb_build_object('matterFieldId', p_map->>(v_config->>'matterFieldId')) ELSE '{}'::jsonb END;
  END IF;
  -- heading / text / trust_reconciliation / ledes_export / public_task_page: no field references, config unchanged.

  RETURN p_widget || jsonb_build_object('config', v_config);
END;
$$;

-- Install path keeps its existing entry point but now shares the mapper.
CREATE OR REPLACE FUNCTION resolve_template_dashboard_widget(p_widget jsonb, p_field_map jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT map_dashboard_widget_fields(p_widget, p_field_map);
$$;

CREATE OR REPLACE FUNCTION sync_template_dashboards_from_company(p_template_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  -- SECURITY DEFINER and reachable directly via supabase.rpc() -- see the
  -- same note on install_company_template in template_marketplace.sql.
  p_actor uuid := auth.uid();
  v_owner uuid;
  v_dash RECORD;
  v_source_template_table_id uuid;
  v_key_map jsonb;
  v_widgets jsonb;
  v_catalog_id uuid;
  v_new_slug text;
  v_suffix int;
  v_updated int := 0;
  v_created int := 0;
  v_skipped int := 0;
BEGIN
  SELECT owner_company_id INTO v_owner FROM template_definitions WHERE id = p_template_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'template not found'; END IF;
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_owner AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'only members of the template''s owner company can sync its dashboards';
  END IF;

  FOR v_dash IN
    SELECT * FROM company_dashboards
    WHERE company_id = v_owner AND deleted_at IS NULL
    ORDER BY display_order
  LOOP
    -- Legacy dashboards never migrated to the widgets column can't be
    -- represented in widgets_template.
    IF v_dash.widgets IS NULL THEN v_skipped := v_skipped + 1; CONTINUE; END IF;

    -- Catalog dashboards must be bound to a template table; the reverse
    -- table map covers both 'created' and 'used_existing' installs.
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

    -- Prefer the explicit map (install lineage); fall back to slug so
    -- owner dashboards that predate the map still update their catalog row
    -- instead of duplicating it.
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

  RETURN jsonb_build_object('updated', v_updated, 'created', v_created, 'skipped', v_skipped);
END;
$$;
