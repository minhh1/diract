-- resolve_template_dashboard_widget (template_marketplace_dashboards.sql)
-- only resolved field_key -> id references for the LEGACY single-series
-- chart shape (dateFieldId/valueFieldId) and the LEGACY single-condition
-- summary_tile shape (fieldId/fieldBId/filterFieldId) -- a template
-- following the DSL's own documented multi-series/multi-condition pattern
-- (e.g. chart `series` with per-series `conditions`, like billable vs
-- non-billable hours) would install with those field_key strings left
-- unresolved, silently producing an empty/broken widget. Extends the
-- resolver to walk `series`/`conditions` arrays the same way it already
-- walks `fieldIds`. Backward compatible: a widget with no `series`/
-- `conditions` array gets an empty one added, which compute.ts's
-- resolveChartSeries/resolveConditions already treat identically to absent
-- (both check `.length` before using the array).

CREATE OR REPLACE FUNCTION resolve_template_dashboard_widget(p_widget jsonb, p_field_map jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_type text := p_widget->>'type';
  v_config jsonb := p_widget->'config';
  v_key text;
  v_field_id text;
  v_ids jsonb;
  v_conditions jsonb;
  v_cond jsonb;
  v_series jsonb;
  v_one_series jsonb;
BEGIN
  IF v_type IN ('filter_bar', 'quick_add_form', 'grid') THEN
    v_ids := '[]'::jsonb;
    FOR v_key IN SELECT jsonb_array_elements_text(COALESCE(v_config->'fieldIds', '[]'::jsonb)) LOOP
      v_field_id := p_field_map->>v_key;
      IF v_field_id IS NOT NULL THEN v_ids := v_ids || to_jsonb(v_field_id); END IF;
    END LOOP;
    v_config := v_config || jsonb_build_object('fieldIds', v_ids);

  ELSIF v_type = 'summary_tile' THEN
    v_conditions := '[]'::jsonb;
    FOR v_cond IN SELECT jsonb_array_elements(COALESCE(v_config->'conditions', '[]'::jsonb)) LOOP
      v_field_id := p_field_map->>(v_cond->>'fieldId');
      IF v_field_id IS NOT NULL THEN
        v_conditions := v_conditions || jsonb_build_array(v_cond || jsonb_build_object('fieldId', v_field_id));
      END IF;
    END LOOP;
    v_config := v_config
      || jsonb_build_object('fieldId', p_field_map->>(v_config->>'fieldId'))
      || jsonb_build_object('conditions', v_conditions)
      || CASE WHEN v_config->>'fieldBId' IS NOT NULL THEN jsonb_build_object('fieldBId', p_field_map->>(v_config->>'fieldBId')) ELSE '{}'::jsonb END
      || CASE WHEN v_config->>'filterFieldId' IS NOT NULL THEN jsonb_build_object('filterFieldId', p_field_map->>(v_config->>'filterFieldId')) ELSE '{}'::jsonb END;

  ELSIF v_type = 'chart' THEN
    v_series := '[]'::jsonb;
    FOR v_one_series IN SELECT jsonb_array_elements(COALESCE(v_config->'series', '[]'::jsonb)) LOOP
      v_conditions := '[]'::jsonb;
      FOR v_cond IN SELECT jsonb_array_elements(COALESCE(v_one_series->'conditions', '[]'::jsonb)) LOOP
        v_field_id := p_field_map->>(v_cond->>'fieldId');
        IF v_field_id IS NOT NULL THEN
          v_conditions := v_conditions || jsonb_build_array(v_cond || jsonb_build_object('fieldId', v_field_id));
        END IF;
      END LOOP;
      v_series := v_series || jsonb_build_array(
        v_one_series
        || jsonb_build_object('conditions', v_conditions)
        || CASE WHEN v_one_series->>'valueFieldId' IS NOT NULL THEN jsonb_build_object('valueFieldId', p_field_map->>(v_one_series->>'valueFieldId')) ELSE '{}'::jsonb END
      );
    END LOOP;
    v_config := v_config
      || jsonb_build_object('dateFieldId', p_field_map->>(v_config->>'dateFieldId'))
      || jsonb_build_object('series', v_series)
      || CASE WHEN v_config->>'valueFieldId' IS NOT NULL THEN jsonb_build_object('valueFieldId', p_field_map->>(v_config->>'valueFieldId')) ELSE '{}'::jsonb END;
  END IF;
  -- heading / text / trust_reconciliation / ledes_export: no field references, config unchanged.

  RETURN p_widget || jsonb_build_object('config', v_config);
END;
$$;
