-- Bug fix: company_dashboards' RLS was scoped to ANY company the user is a
-- MEMBER of (via company_memberships), not just their currently ACTIVE
-- company -- unlike every other custom-table-related table
-- (company_tables, company_table_fields, company_table_records,
-- company_table_values, company_custom_fields), which all use
-- `company_id = active_company_id()` (profiles.active_company_id for
-- auth.uid()). A user who is a member of more than one company saw every
-- company's dashboards mixed together in the Sidebar and could open any of
-- them regardless of which company was active -- reported directly:
-- "dashboards persist across companies, dashboard should be different
-- between companies".
--
-- No app-code changes needed alongside this: none of the dashboard hooks
-- (useCustomDashboards, useDashboardData, the builder page) filter by
-- company_id explicitly -- exactly like company_tables etc., they rely on
-- RLS alone, so fixing the policy fixes every read/write path at once.
DROP POLICY IF EXISTS company_dashboards_company_members ON company_dashboards;
CREATE POLICY company_dashboards_active_company ON company_dashboards
  FOR ALL
  USING (company_id = active_company_id())
  WITH CHECK (company_id = active_company_id());
