SET request.jwt.claim.role = 'service_role';

-- The Niksen Loans board's Project/Borrower columns (20260801320000) were
-- inserted as field_type 'text' -- client_update_page_fields.field_type
-- only supported display-oriented primitives when the Irregularities board
-- picked that same pattern for its own entity column, and the later fix
-- (20260729380000_fix_relation_field_type_snapshot.sql) that widened the
-- CHECK constraint + added a backfill only covered field_source='custom'/
-- 'property' (company_custom_fields-backed), never field_source='base' on
-- a custom-table page (company_table_fields-backed) -- this page is the
-- first of that specific shape, so the gap was never exercised until now.
-- Confirmed generic downstream support before writing this: MatterBoard's
-- isRelationField/RelationPicker rendering and values/route.ts's PATCH
-- write path (both keyed off field.field_type + field_source==='base' &&
-- isCustomTable) already handle 'entity'/'project' correctly for a
-- company_table_fields column -- lib/clientUpdatePageDetail.ts:590-597
-- computes linkedSystemTable purely from field_type, no base-vs-custom
-- branching needed.
UPDATE client_update_page_fields cupf
SET field_type = ctf.field_type
FROM company_table_fields ctf
WHERE cupf.page_id = (SELECT id FROM client_update_pages WHERE slug = 'niksen-loans')
  AND cupf.field_source = 'base'
  AND ctf.id::text = cupf.field_key
  AND ctf.field_type IN ('entity', 'property', 'project', 'table_relation')
  AND cupf.field_type <> ctf.field_type;
