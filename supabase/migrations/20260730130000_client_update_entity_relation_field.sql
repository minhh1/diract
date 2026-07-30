-- Adds 'entity_relation' to client_update_page_fields.field_source, for the
-- Entities Detailed Table Page's synthetic "Trust" column -- its value lives
-- on entity_relationships (relationship_type='Trustee'), not any of the
-- existing value tables the other field_source kinds read/write, so it
-- needed its own sentinel rather than fitting into 'custom'/'base'. See
-- app/api/client-update-pages/[id]/fields/route.ts's entityRelation bucket,
-- lib/clientUpdatePageDetail.ts's trustByEntityId resolution, and
-- values/route.ts's entity_relation write branch.
ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_source_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_source_check
  CHECK (field_source = ANY (ARRAY['base'::text, 'custom'::text, 'adhoc'::text, 'related_entity'::text, 'property'::text, 'project_property'::text, 'entity_relation'::text]));
