-- Adds the widget-array canvas/code builder's columns onto company_dashboards.
-- The old quick_add_field_ids/grid_field_ids/filter_field_ids/summary_tiles/
-- chart_config columns are NOT dropped -- kept for rollback safety -- but are
-- superseded: `widgets` is now the one canonical, ordered array of typed,
-- positioned widgets that both the Canvas (react-grid-layout) and Code (DSL)
-- authoring modes read/write, and that the view page renders from exclusively.
-- See lib/dashboardWidgets/types.ts for the widget shape and
-- lib/dashboardWidgets/legacyConvert.ts for the one-time legacy migration.

ALTER TABLE company_dashboards
  ADD COLUMN IF NOT EXISTS widgets jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS code_source text,
  ADD COLUMN IF NOT EXISTS builder_mode text NOT NULL DEFAULT 'canvas'
    CHECK (builder_mode IN ('canvas', 'code')),
  -- Set once, the first time this row's legacy quick_add/grid/filter/tiles/
  -- chart config is converted into `widgets` (see ensureDashboardWidgetsMigrated
  -- in lib/dashboardWidgets/ensureMigrated.ts). NULL means "either brand new
  -- under the new builder, or a legacy row not yet converted" -- the
  -- conversion check is `widgets_migrated_at IS NULL`, not "widgets is empty",
  -- so a dashboard the user deliberately emptied out in Canvas mode is never
  -- silently re-populated from stale legacy columns on a later open.
  ADD COLUMN IF NOT EXISTS widgets_migrated_at timestamptz;
