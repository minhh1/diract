-- One-off backfill: appends the three trust-reporting widgets (ledger
-- statement, cash book, aged/dormant balances -- see
-- lib/dashboardWidgets/types.ts) to every company's ALREADY-INSTALLED Trust
-- Account dashboard. Needed because install_template_dashboards only ever
-- creates a whole dashboard the first time -- it has no mechanism for
-- "this dashboard already exists but gained new widgets since", so a
-- widgets_template change to an existing template_definition_dashboards row
-- (see the UPDATE in template_law_firm_seed.sql) never reaches a company
-- that installed before the change. Idempotent: skips any dashboard whose
-- widgets already contain a trust_ledger_statement widget.
DO $$
DECLARE
  v_template_id uuid;
  v_dash RECORD;
  v_max_y int;
BEGIN
  SELECT id INTO v_template_id FROM template_definitions WHERE slug = 'law-firm';

  FOR v_dash IN
    SELECT cd.id, cd.widgets
    FROM company_dashboards cd
    JOIN company_template_dashboard_map m ON m.installed_company_dashboard_id = cd.id
    WHERE m.template_id = v_template_id AND cd.slug = 'trust-account' AND cd.deleted_at IS NULL
  LOOP
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_dash.widgets) w WHERE w->>'type' = 'trust_ledger_statement') THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(MAX((w->'layout'->>'y')::int + (w->'layout'->>'h')::int), 0)
      INTO v_max_y FROM jsonb_array_elements(v_dash.widgets) w;

    UPDATE company_dashboards SET widgets = widgets || jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid(), 'type', 'trust_ledger_statement',
        'layout', jsonb_build_object('x', 0, 'y', v_max_y, 'w', 12, 'h', 8), 'config', '{}'::jsonb),
      jsonb_build_object('id', gen_random_uuid(), 'type', 'trust_cash_book',
        'layout', jsonb_build_object('x', 0, 'y', v_max_y + 8, 'w', 12, 'h', 8), 'config', '{}'::jsonb),
      jsonb_build_object('id', gen_random_uuid(), 'type', 'trust_aged_balances',
        'layout', jsonb_build_object('x', 0, 'y', v_max_y + 16, 'w', 12, 'h', 6), 'config', jsonb_build_object('dormantDays', 365))
    )
    WHERE id = v_dash.id;
  END LOOP;
END $$;
