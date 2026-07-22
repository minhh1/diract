-- Soft-delete for the three schema-definition tables that back the custom
-- tables engine, so deleting a custom table or a field never destroys the
-- data stored against it (company_table_records/company_table_values,
-- company_custom_field_values) -- it's just hidden until restored or
-- permanently purged from Trash. This also lets revert_schema_change
-- actually bring back real data when undoing a delete, not just the shape
-- (see schema_change_log.sql).
--
-- Every read of these three tables in the dashboard app must now filter
-- `deleted_at IS NULL` -- see components/CustomTableBuilder.tsx,
-- SchemaVisualisation.tsx, lib/hooks/useCustomTable(s).ts,
-- GridTabEditor.tsx, RecordDashboard.tsx, NewEntityModal/NewProjectModal/
-- NewPropertyModal.tsx, useCompanyCustomFields.ts, SchemaMap.tsx,
-- AdminDefaultViewsTab.tsx. Two Supabase Edge Functions (gmail-addon,
-- calendar-sync) also read company_custom_fields by field_key and were
-- deliberately left unfixed for now -- flagged as known follow-up, low risk
-- since a soft-deleted field lingering there just means a stale lookup
-- misses a field, not that data leaks.

ALTER TABLE company_tables ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE company_custom_fields ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS company_tables_deleted_at_idx ON company_tables (company_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS company_table_fields_deleted_at_idx ON company_table_fields (table_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS company_custom_fields_deleted_at_idx ON company_custom_fields (company_id, table_name) WHERE deleted_at IS NULL;
