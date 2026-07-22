-- Custom dashboards: a user-built screen bound to one custom table (see
-- lib/hooks/useCustomTable.ts), combining a quick-entry form, a data grid,
-- summary stat tiles, and an optional daily activity chart. Built via
-- app/dashboard/dashboards/[slug]/builder/page.tsx, viewed via
-- app/dashboard/dashboards/[slug]/page.tsx, listed in the sidebar under
-- Tables via lib/hooks/useCustomDashboards.ts.
--
-- Soft-deleted (deleted_at) from the start, same convention as
-- company_tables/company_table_fields/company_custom_fields (see
-- supabase/schema_soft_delete.sql) -- deleting a dashboard is reversible via
-- the existing Trash screen (app/dashboard/settings/trash/page.tsx) and
-- revert_schema_change(), not a hard delete.

CREATE TABLE IF NOT EXISTS company_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  icon text NOT NULL DEFAULT 'LayoutDashboard',
  color text NOT NULL DEFAULT '#6366f1',
  source_table_id uuid NOT NULL REFERENCES company_tables(id) ON DELETE CASCADE,
  -- Ordered company_table_fields.id arrays -- order in the array is display order.
  quick_add_field_ids uuid[] NOT NULL DEFAULT '{}',
  grid_field_ids uuid[] NOT NULL DEFAULT '{}',
  filter_field_ids uuid[] NOT NULL DEFAULT '{}',
  -- [{ label, fieldId, aggregate: 'sum'|'count', filterFieldId?, filterValue? }]
  summary_tiles jsonb NOT NULL DEFAULT '[]',
  -- { dateFieldId, valueFieldId, aggregate: 'sum'|'count' } | null
  chart_config jsonb,
  display_order integer NOT NULL DEFAULT 0,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS company_dashboards_company_idx ON company_dashboards (company_id) WHERE deleted_at IS NULL;

ALTER TABLE company_dashboards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_dashboards_company_members ON company_dashboards;
CREATE POLICY company_dashboards_company_members ON company_dashboards
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
