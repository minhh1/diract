SET request.jwt.claim.role = 'service_role';

-- Lets a specific relation LINK (e.g. this matter's Property Owner) record
-- which capacity the linked entity is acting in for that one link, separate
-- from the entity's own roles (entities.roles, see
-- 20260729420000_entities_multi_role.sql) -- the same company can be "just
-- itself" on one matter and "as trustee" on another, so this can't be a
-- fixed property of the entity. NULL means the entity's plain/primary
-- capacity (nothing shown); 'Trustee' means the picker's capacity prompt
-- was answered "acting as trustee for this" -- see RelationPicker.tsx's new
-- capacity-choice step, wired up so far for property-scoped custom fields
-- (company_custom_field_values) and per-(project,property) transaction
-- fields (project_property_values). Not added to company_table_values
-- (custom-table base relation fields) or client_update_page_values (adhoc
-- fields) in this pass -- narrower, less-used paths, deferred.
ALTER TABLE company_custom_field_values ADD COLUMN IF NOT EXISTS value_record_capacity text;
ALTER TABLE project_property_values ADD COLUMN IF NOT EXISTS value_record_capacity text;
