-- Lets a marketplace template bundle dashboards (see company_dashboards.sql)
-- alongside its tables/fields, so installing a template also creates its
-- ready-made dashboards -- e.g. the Law Firm template's Time Entry / Trust
-- Account / Billing dashboards install automatically instead of needing a
-- separate manual seed script.
--
-- widgets_template mirrors company_dashboards.widgets (see
-- lib/dashboardWidgets/types.ts) exactly, EXCEPT every field reference
-- (fieldId/fieldBId/dateFieldId/valueFieldId/filterFieldId, and each entry of
-- a fieldIds[] array) is the target field's field_key TEXT instead of a
-- company_table_fields.id uuid -- catalog rows can't hold a real field id
-- since that only exists after install. install_company_template resolves
-- these to the newly-installed table's field ids at install time (see
-- resolve_template_dashboard_widget below). Widget types with no field
-- references at all (heading, text, trust_reconciliation, ledes_export)
-- pass through unchanged.

CREATE TABLE IF NOT EXISTS template_definition_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  source_template_table_id uuid NOT NULL REFERENCES template_definition_tables(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  icon text NOT NULL DEFAULT 'LayoutDashboard',
  color text NOT NULL DEFAULT '#6366f1',
  display_order integer NOT NULL DEFAULT 0,
  widgets_template jsonb NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (template_id, slug)
);

CREATE INDEX IF NOT EXISTS template_definition_dashboards_template_idx ON template_definition_dashboards (template_id);

ALTER TABLE template_definition_dashboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_definition_dashboards_rw ON template_definition_dashboards;
CREATE POLICY template_definition_dashboards_rw ON template_definition_dashboards
  FOR ALL
  USING (template_id IN (
    SELECT id FROM template_definitions WHERE is_published
      OR owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid())
  ))
  WITH CHECK (template_id IN (
    SELECT id FROM template_definitions
    WHERE owner_company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid() AND role = 'company_admin')
  ));

CREATE TABLE IF NOT EXISTS company_template_dashboard_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES template_definitions(id) ON DELETE CASCADE,
  source_template_dashboard_id uuid NOT NULL REFERENCES template_definition_dashboards(id) ON DELETE CASCADE,
  installed_company_dashboard_id uuid REFERENCES company_dashboards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, template_id, source_template_dashboard_id)
);

ALTER TABLE company_template_dashboard_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_template_dashboard_map_company_members ON company_template_dashboard_map;
CREATE POLICY company_template_dashboard_map_company_members ON company_template_dashboard_map
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Resolves one widget's field_key references to field ids using p_field_map
-- (a jsonb object of field_key -> id-as-text for the dashboard's installed
-- source table). Unknown/blank keys resolve to null, same "silently drop
-- rather than error" posture as the rest of this widget system (see dsl.ts).
CREATE OR REPLACE FUNCTION resolve_template_dashboard_widget(p_widget jsonb, p_field_map jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_type text := p_widget->>'type';
  v_config jsonb := p_widget->'config';
  v_key text;
  v_field_id text;
  v_ids jsonb;
BEGIN
  IF v_type IN ('filter_bar', 'quick_add_form', 'grid') THEN
    v_ids := '[]'::jsonb;
    FOR v_key IN SELECT jsonb_array_elements_text(COALESCE(v_config->'fieldIds', '[]'::jsonb)) LOOP
      v_field_id := p_field_map->>v_key;
      IF v_field_id IS NOT NULL THEN v_ids := v_ids || to_jsonb(v_field_id); END IF;
    END LOOP;
    v_config := v_config || jsonb_build_object('fieldIds', v_ids);

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
  -- heading / text / trust_reconciliation / ledes_export: no field references, config unchanged.

  RETURN p_widget || jsonb_build_object('config', v_config);
END;
$$;
