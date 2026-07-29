SET request.jwt.claim.role = 'service_role';

-- Fixes a data gap left by 20260729210000: existing custom_table-based
-- pages (e.g. Niksen Irregularities) still hold the literal string
-- 'custom_table' in base_table, with the actual company_tables.id living
-- separately in source_table_id -- that split enum+FK shape is exactly
-- what 20260729210000 replaced going forward (base_table now holds the
-- company_tables.id directly for a custom-table page, same convention
-- record_tabs.record_table already uses), but it only ever updated NEW
-- writes/reads (lib/clientUpdatePageTableResolver.ts), not this existing
-- data. Without this backfill, isSystemTable('custom_table') is false, so
-- the resolver would try to treat the literal string 'custom_table' as a
-- company_tables.id -- matching nothing.
UPDATE client_update_pages
SET base_table = source_table_id::text
WHERE base_table = 'custom_table' AND source_table_id IS NOT NULL;
