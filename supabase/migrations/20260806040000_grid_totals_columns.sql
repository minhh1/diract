-- Grid widget totals footer used to blindly sum every number/currency
-- column, including per-unit Rate columns -- summing an hourly/unit rate
-- across rows is meaningless (e.g. the "Time Entry" matter dashboard's te8
-- grid showed a $14,000 "total" that was really just every entry's Rate
-- added together, not a real figure). GridWidget.config now supports an
-- explicit `totalsColumns` (subset of field ids) so an admin picks which
-- columns actually get totaled; a `boolean` column counts checked rows
-- instead of summing, since there's nothing to sum. See
-- resolve_template_dashboard_widget below and components/dashboard/
-- DashboardGrid.tsx / WidgetConfigPanel.tsx for the read/write sides.

-- Redeploy resolve_template_dashboard_widget with totalsColumns support so
-- future template installs resolve it the same way fieldIds already is.
CREATE OR REPLACE FUNCTION resolve_template_dashboard_widget(p_widget jsonb, p_field_map jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_type text := p_widget->>'type';
  v_config jsonb := p_widget->'config';
  v_key text;
  v_field_id text;
  v_ids jsonb;
  v_totals_ids jsonb;
BEGIN
  IF v_type IN ('filter_bar', 'quick_add_form', 'grid') THEN
    v_ids := '[]'::jsonb;
    FOR v_key IN SELECT jsonb_array_elements_text(COALESCE(v_config->'fieldIds', '[]'::jsonb)) LOOP
      v_field_id := p_field_map->>v_key;
      IF v_field_id IS NOT NULL THEN v_ids := v_ids || to_jsonb(v_field_id); END IF;
    END LOOP;
    v_config := v_config || jsonb_build_object('fieldIds', v_ids);

    IF v_type = 'grid' AND v_config ? 'totalsColumns' THEN
      v_totals_ids := '[]'::jsonb;
      FOR v_key IN SELECT jsonb_array_elements_text(COALESCE(v_config->'totalsColumns', '[]'::jsonb)) LOOP
        v_field_id := p_field_map->>v_key;
        IF v_field_id IS NOT NULL THEN v_totals_ids := v_totals_ids || to_jsonb(v_field_id); END IF;
      END LOOP;
      v_config := v_config || jsonb_build_object('totalsColumns', v_totals_ids);
    END IF;

  ELSIF v_type = 'summary_tile' THEN
    v_config := v_config
      || jsonb_build_object('fieldId', p_field_map->>(v_config->>'fieldId'))
      || CASE WHEN v_config->>'fieldBId' IS NOT NULL THEN jsonb_build_object('fieldBId', p_field_map->>(v_config->>'fieldBId')) ELSE '{}'::jsonb END
      || CASE WHEN v_config->>'filterFieldId' IS NOT NULL THEN jsonb_build_object('filterFieldId', p_field_map->>(v_config->>'filterFieldId')) ELSE '{}'::jsonb END;

  ELSIF v_type = 'chart' THEN
    v_config := v_config
      || jsonb_build_object('dateFieldId', p_field_map->>(v_config->>'dateFieldId'))
      || CASE WHEN v_config->>'valueFieldId' IS NOT NULL THEN jsonb_build_object('valueFieldId', p_field_map->>(v_config->>'valueFieldId')) ELSE '{}'::jsonb END;
  END IF;

  RETURN p_widget || jsonb_build_object('config', v_config);
END;
$$;

-- Patch the live "Time Entry" template definition (law-firm template) so
-- future installs pick up totalsColumns=[duration_hours, amount, billable]
-- on te8 -- template_law_firm_seed.sql's own INSERT is guarded by
-- `WHERE NOT EXISTS`, so re-running the seed file alone would never touch
-- an already-existing row.
UPDATE template_definition_dashboards
SET widgets_template = (
  SELECT jsonb_agg(
    CASE WHEN elem->>'id' = 'te8'
      THEN jsonb_set(elem, '{config,totalsColumns}', '["duration_hours","amount","billable"]'::jsonb)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(widgets_template) elem
)
WHERE slug = 'time-entry'
  AND widgets_template @> '[{"id":"te8"}]'::jsonb;

-- Patch every already-installed company's matter "Time Entry" dashboard the
-- same way, resolving field_key -> id per-company against that dashboard's
-- own source_table_id (each company has its own company_table_fields rows).
UPDATE company_dashboards cd
SET widgets = (
  SELECT jsonb_agg(
    CASE WHEN elem->>'id' = 'te8'
      THEN jsonb_set(elem, '{config,totalsColumns}', COALESCE(fids.ids, '[]'::jsonb))
      ELSE elem
    END
  )
  FROM jsonb_array_elements(cd.widgets) elem
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(ctf.id::text) AS ids
    FROM company_table_fields ctf
    WHERE ctf.table_id = cd.source_table_id
      AND ctf.field_key IN ('duration_hours', 'amount', 'billable')
      AND ctf.deleted_at IS NULL
  ) fids ON true
)
WHERE cd.slug = 'time-entry'
  AND cd.deleted_at IS NULL
  AND cd.widgets @> '[{"id":"te8"}]'::jsonb;
