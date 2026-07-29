SET request.jwt.claim.role = 'service_role';

-- client_update_page_fields.field_type's CHECK enum never allowed the 4
-- relation types at all ('text', 'select', 'date', 'number', 'currency',
-- 'boolean', 'abn', 'acn' only) -- so even with the code fix (KNOWN_FIELD_TYPES
-- in fields/route.ts), inserting a genuinely correct 'entity'/'property'/
-- 'project'/'table_relation' row would still fail at the DB level. Confirmed
-- live: zero rows anywhere have ever had one of these 4 as field_type.
ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_type_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_type_check
  CHECK (field_type = ANY (ARRAY['text'::text, 'select'::text, 'date'::text, 'number'::text, 'currency'::text, 'boolean'::text, 'abn'::text, 'acn'::text, 'entity'::text, 'property'::text, 'project'::text, 'table_relation'::text]));

-- Fixes client_update_page_fields.field_type for any 'custom' or
-- 'property'(custom:<id>) column whose underlying company_custom_fields row
-- is a relation type (entity/property/project/table_relation) but got
-- snapshotted as 'text' -- the add-field POST handler's field_type
-- allow-list previously didn't include the 4 relation types at all (see
-- app/api/client-update-pages/[id]/fields/route.ts's new KNOWN_FIELD_TYPES).
-- A field stuck this way renders as a plain text input instead of
-- RelationPicker (MatterBoard.tsx's isRelationField reads this exact
-- column), and typing free text into it tries to write that raw string
-- into a value_record_id column. Found live: Huynh Lawyers' "Property
-- Owner" column. Checked for other companies too, not just this one.
UPDATE client_update_page_fields cupf
SET field_type = cf.field_type
FROM company_custom_fields cf
WHERE cf.field_type IN ('entity', 'property', 'project', 'table_relation')
  AND cupf.field_type <> cf.field_type
  AND (
    (cupf.field_source = 'custom' AND cf.id::text = cupf.field_key)
    OR (cupf.field_source = 'property' AND cupf.field_key LIKE 'custom:%' AND cf.id::text = split_part(cupf.field_key, ':', 2))
  );
