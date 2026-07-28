SET request.jwt.claim.role = 'service_role';

-- Extends Client Update Pages with a 3rd base_table kind, 'custom_table' --
-- a company_tables-backed page (e.g. the Irregularities registry), not a
-- system table like projects/entities. source_table_id names which
-- company_tables row the page reads from; client_update_page_items gets a
-- 3rd polymorphic column (custom_record_id) alongside project_id/entity_id,
-- exactly one of the three is ever set per item (same pattern as
-- 20260729080000_client_update_pages_entities_base_table.sql).
--
-- Scope note: unlike the entities extension, this one is read/view-only --
-- no "add item" (Irregularities rows are trigger-generated, never manually
-- added) and no inline cell editing (the registry's own field values are
-- system-computed; fixing an irregularity means editing the flagged
-- entity's actual field, which is a separate mechanism entirely -- see the
-- one-click-fix work). Filtering/sorting/color-coding/column visibility
-- still work fully, same as any other page, since those are all read-side
-- MatterBoard features.

ALTER TABLE client_update_pages DROP CONSTRAINT IF EXISTS client_update_pages_base_table_check;
ALTER TABLE client_update_pages ADD CONSTRAINT client_update_pages_base_table_check
  CHECK (base_table IN ('projects', 'entities', 'custom_table'));
ALTER TABLE client_update_pages ADD COLUMN IF NOT EXISTS source_table_id uuid REFERENCES company_tables(id) ON DELETE CASCADE;

ALTER TABLE client_update_page_items ADD COLUMN IF NOT EXISTS custom_record_id uuid REFERENCES company_table_records(id) ON DELETE CASCADE;
ALTER TABLE client_update_page_items DROP CONSTRAINT IF EXISTS client_update_page_items_one_record_chk;
ALTER TABLE client_update_page_items ADD CONSTRAINT client_update_page_items_one_record_chk
  CHECK (num_nonnulls(project_id, entity_id, custom_record_id) = 1);

CREATE UNIQUE INDEX IF NOT EXISTS client_update_page_items_page_custom_record_uidx
  ON client_update_page_items (page_id, custom_record_id) WHERE custom_record_id IS NOT NULL;
