-- A report column can now be sourced from a table related to the matter,
-- not just projects/properties/its own custom fields -- specifically an
-- ENTITY linked via one of the matter's own 'entity'-type custom fields
-- (e.g. the "Client Name" field links to an entities row; a related_entity
-- column can pull that entity's ABN, email, etc. onto the report).
-- field_key packs "<linkFieldId>:<entitiesColumn>" -- linkFieldId is the
-- company_custom_fields.id of the 'entity'-type field ON PROJECTS that
-- provides the link, entitiesColumn is one of a small curated allow-list
-- (see lib/clientUpdatePageDetail.ts) -- deliberately excludes sensitive
-- entities columns (tfn, bank_name, bsb, account_number, date_of_birth)
-- since this can end up on a client-facing page. Read-only for now: editing
-- continues to happen on the entity's own record, not through this report.
ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_source_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_source_check
  CHECK (field_source IN ('base', 'custom', 'adhoc', 'related_entity'));
