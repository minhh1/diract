-- Corrects the widget layout for the Law Firm template's three dashboards,
-- superseding the broken first attempt in dashboard_widget_repack.sql (whose
-- repack_dashboard_widgets stacked every widget sequentially, breaking the
-- four-summary-tiles-per-row layout -- see dashboard_widget_repack_fix.sql's
-- comment for the full story). Rather than trying to "un-break" already-
-- mutated y values generically, this sets each known widget id's
-- layout.y/layout.h explicitly -- the ids (ta1..ta12/te1..te8/bi1..bi9) are
-- fixed, established in template_law_firm_seed.sql.
CREATE OR REPLACE FUNCTION set_widget_layout(p_widgets jsonb, p_id text, p_y int, p_h int)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(
    CASE WHEN w->>'id' = p_id
      THEN jsonb_set(jsonb_set(w, '{layout,y}', to_jsonb(p_y)), '{layout,h}', to_jsonb(p_h))
      ELSE w
    END
  )
  FROM jsonb_array_elements(p_widgets) AS w
$$;

CREATE OR REPLACE FUNCTION fix_law_firm_dashboard_layout(p_widgets jsonb, p_slug text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  w jsonb := p_widgets;
  v_known_ids text[];
  v_next_y int;
  v_extra jsonb;
  v_widget jsonb;
BEGIN
  IF p_slug = 'time-entry' THEN
    v_known_ids := ARRAY['te1','te2','te3','te4','te5','te6','te7','te8'];
    w := set_widget_layout(w, 'te1', 0, 2);
    w := set_widget_layout(w, 'te2', 2, 5);
    w := set_widget_layout(w, 'te3', 7, 2);
    w := set_widget_layout(w, 'te4', 7, 2);
    w := set_widget_layout(w, 'te5', 7, 2);
    w := set_widget_layout(w, 'te6', 7, 2);
    w := set_widget_layout(w, 'te7', 9, 4);
    w := set_widget_layout(w, 'te8', 13, 6);
  ELSIF p_slug = 'trust-account' THEN
    v_known_ids := ARRAY['ta1','ta2','ta3','ta4','ta5','ta6','ta7','ta8','ta9','ta10','ta11','ta12'];
    w := set_widget_layout(w, 'ta1', 0, 2);
    w := set_widget_layout(w, 'ta2', 2, 8);
    w := set_widget_layout(w, 'ta3', 10, 2);
    w := set_widget_layout(w, 'ta4', 10, 2);
    w := set_widget_layout(w, 'ta5', 10, 2);
    w := set_widget_layout(w, 'ta6', 10, 2);
    w := set_widget_layout(w, 'ta7', 12, 4);
    w := set_widget_layout(w, 'ta8', 16, 6);
    w := set_widget_layout(w, 'ta9', 22, 10);
    w := set_widget_layout(w, 'ta10', 32, 8);
    w := set_widget_layout(w, 'ta11', 40, 8);
    w := set_widget_layout(w, 'ta12', 48, 6);
  ELSIF p_slug = 'billing' THEN
    v_known_ids := ARRAY['bi1','bi2','bi3','bi4','bi5','bi6','bi7','bi8','bi9'];
    w := set_widget_layout(w, 'bi1', 0, 2);
    w := set_widget_layout(w, 'bi2', 2, 4);
    w := set_widget_layout(w, 'bi3', 6, 2);
    w := set_widget_layout(w, 'bi4', 6, 2);
    w := set_widget_layout(w, 'bi5', 6, 2);
    w := set_widget_layout(w, 'bi6', 6, 2);
    w := set_widget_layout(w, 'bi7', 8, 4);
    w := set_widget_layout(w, 'bi8', 12, 6);
    w := set_widget_layout(w, 'bi9', 18, 6);
  ELSE
    RETURN w;
  END IF;

  -- Bottom edge of whichever known widgets actually exist on THIS
  -- dashboard (not every known id is guaranteed present -- e.g. an
  -- installed dashboard's trust-reporting widgets were backfilled with
  -- gen_random_uuid() ids, not the catalog's literal "ta10..12", so those
  -- three set_widget_layout calls above were no-ops for it; computing this
  -- from the actual data avoids assuming all ids landed).
  SELECT COALESCE(MAX((value->'layout'->>'y')::int + (value->'layout'->>'h')::int), 0)
    INTO v_next_y
    FROM jsonb_array_elements(w) AS value
    WHERE value->>'id' = ANY(v_known_ids);

  -- Second pass: any widget NOT among the known template ids (e.g. the
  -- trust-reporting widgets backfilled onto an already-installed dashboard
  -- via trust_reporting_widgets_backfill.sql, which get gen_random_uuid()
  -- ids, not the catalog's literal "taN" ids) -- stack them, in their
  -- current relative order, starting right after the known widgets.
  FOR v_widget IN
    SELECT value FROM jsonb_array_elements(w) AS t(value)
    WHERE NOT (value->>'id' = ANY(v_known_ids))
    ORDER BY (value->'layout'->>'y')::int
  LOOP
    v_widget := jsonb_set(v_widget, '{layout,y}', to_jsonb(v_next_y));
    v_next_y := v_next_y + (v_widget->'layout'->>'h')::int;
    w := (SELECT jsonb_agg(CASE WHEN e->>'id' = v_widget->>'id' THEN v_widget ELSE e END) FROM jsonb_array_elements(w) AS e);
  END LOOP;

  RETURN w;
END;
$$;

-- Catalog (future installs)
UPDATE template_definition_dashboards SET widgets_template = fix_law_firm_dashboard_layout(widgets_template, slug)
WHERE slug IN ('time-entry', 'trust-account', 'billing');

-- Already-installed dashboards (backfilled widgets keep their real field ids
-- untouched -- only layout.y/h are rewritten, matched by the same fixed ids)
UPDATE company_dashboards cd
SET widgets = fix_law_firm_dashboard_layout(cd.widgets, cd.slug)
FROM company_template_dashboard_map m
WHERE m.installed_company_dashboard_id = cd.id
  AND m.template_id = (SELECT id FROM template_definitions WHERE slug = 'law-firm')
  AND cd.slug IN ('time-entry', 'trust-account', 'billing')
  AND cd.deleted_at IS NULL;

DROP FUNCTION fix_law_firm_dashboard_layout(jsonb, text);
DROP FUNCTION set_widget_layout(jsonb, text, int, int);
