-- "Grid layout" (custom_table) record tabs never worked reliably -- their
-- link-field auto-detection was broken (see lib/dashboardWidgets/linkField.ts
-- and the commit that fixed it) and left every existing grid-layout tab
-- unfiltered/unconfigured. Fully superseded by "Dashboard widgets"
-- (custom_dashboard) tabs, which reuse the same widget builder company-wide
-- dashboards use and got the link-field fix. Removing the feature and its
-- existing tabs entirely rather than leaving dead/broken tabs around.
DELETE FROM record_tab_grid_cells WHERE tab_id IN (SELECT id FROM record_tabs WHERE tab_type = 'custom_table');
DELETE FROM record_tabs WHERE tab_type = 'custom_table';

DROP TABLE IF EXISTS record_tab_grid_cells;

ALTER TABLE record_tabs DROP CONSTRAINT IF EXISTS record_tabs_tab_type_check;
ALTER TABLE record_tabs ADD CONSTRAINT record_tabs_tab_type_check
  CHECK (tab_type = ANY (ARRAY['fields'::text, 'sub_projects'::text, 'checklist'::text, 'calendar'::text, 'emails'::text, 'document_templates'::text, 'custom_dashboard'::text]));
