-- Lets a dashboard have no source table at all -- for one that only holds
-- table-independent link widgets (public_task_page/public_document_page,
-- see components/dashboard/DashboardBuilderPage.tsx's "No table" option).
-- source_table_id stays null for it, same as a system-table dashboard --
-- company_dashboards_source_table_id_matches_type already enforces that for
-- anything other than 'custom', so it needs no change here.

ALTER TABLE company_dashboards DROP CONSTRAINT company_dashboards_source_table_type_check;

ALTER TABLE company_dashboards ADD CONSTRAINT company_dashboards_source_table_type_check
  CHECK (source_table_type IN ('custom', 'projects', 'properties', 'entities', 'none'));
