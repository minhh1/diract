-- Widens client_update_page_fields.field_source to allow 'property' -- a
-- field that lives on a matter's linked property (base column or
-- properties-table custom field) rather than the matter itself, resolved
-- per-property by lib/clientUpdatePageDetail.ts and shown split across a
-- row/card per property for a matter with 2+ (see MatterBoard.tsx's
-- expandByProperty). Without this the fields POST route's insert violates
-- the existing CHECK constraint with a raw 500.
ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_source_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_source_check
  CHECK (field_source IN ('base', 'custom', 'adhoc', 'related_entity', 'property'));
