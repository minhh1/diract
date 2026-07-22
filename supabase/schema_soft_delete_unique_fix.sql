-- Fix: company_tables/company_dashboards/company_table_fields/
-- company_custom_fields each have a plain UNIQUE(...) constraint that does
-- NOT exclude soft-deleted rows, even though every caller that avoids
-- naming collisions (install_company_template, upgrade_company_template,
-- CustomTableBuilder, etc.) only checks for a conflict `WHERE deleted_at IS
-- NULL`. The result: soft-delete a table/dashboard/field, then try to
-- create a new one with the same slug/field_key (e.g. a template install or
-- upgrade recreating it), and the INSERT fails with
-- "duplicate key value violates unique constraint ..." even though no LIVE
-- row actually conflicts -- confirmed hitting this via
-- upgrade_company_template while backfilling a soft-deleted-then-reinstalled
-- Trust Transactions table.
--
-- Fix: convert each to a partial unique index scoped to WHERE deleted_at IS
-- NULL, the standard soft-delete pattern -- a slug/field_key becomes
-- reusable again once the row that held it is trashed, matching what every
-- collision-avoidance loop already assumes.

ALTER TABLE company_tables DROP CONSTRAINT IF EXISTS company_tables_company_id_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS company_tables_company_id_slug_live_key
  ON company_tables (company_id, slug) WHERE deleted_at IS NULL;

ALTER TABLE company_dashboards DROP CONSTRAINT IF EXISTS company_dashboards_company_id_slug_key;
CREATE UNIQUE INDEX IF NOT EXISTS company_dashboards_company_id_slug_live_key
  ON company_dashboards (company_id, slug) WHERE deleted_at IS NULL;

ALTER TABLE company_table_fields DROP CONSTRAINT IF EXISTS company_table_fields_table_id_field_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS company_table_fields_table_id_field_key_live_key
  ON company_table_fields (table_id, field_key) WHERE deleted_at IS NULL;

ALTER TABLE company_custom_fields DROP CONSTRAINT IF EXISTS company_custom_fields_company_id_table_name_field_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS company_custom_fields_company_id_table_name_field_key_live_key
  ON company_custom_fields (company_id, table_name, field_key) WHERE deleted_at IS NULL;
