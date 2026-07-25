-- Lets a dashboard bind to a system table (projects/properties/entities) in
-- addition to a custom table (company_tables). source_table_id stays the FK
-- into company_tables.id for 'custom' dashboards; for a system-table
-- dashboard there's no row to point at (there's only ever one
-- projects/properties/entities "table" per company), so source_table_type
-- alone carries the table name and source_table_id is null. See
-- lib/hooks/useSystemTableAsCustomTable.ts / lib/services/systemTableRecordService.ts
-- for the read/write adapters that make a system table look like a custom
-- table to the rest of the dashboard-widget engine.

ALTER TABLE company_dashboards
  ALTER COLUMN source_table_id DROP NOT NULL;

ALTER TABLE company_dashboards
  ADD COLUMN IF NOT EXISTS source_table_type text NOT NULL DEFAULT 'custom'
    CHECK (source_table_type IN ('custom', 'projects', 'properties', 'entities'));

ALTER TABLE company_dashboards
  ADD CONSTRAINT company_dashboards_source_table_id_matches_type
  CHECK (
    (source_table_type = 'custom' AND source_table_id IS NOT NULL)
    OR (source_table_type != 'custom' AND source_table_id IS NULL)
  );
