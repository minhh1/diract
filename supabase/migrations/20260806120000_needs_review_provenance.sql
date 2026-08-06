-- The "needs review" banner (components/GenericMasterTable.tsx) only ever
-- showed the free-text review_reason ("...didn't match any existing
-- record") with no way to see which matter/table record triggered the
-- auto-create, who was syncing when it happened, or which field typed the
-- name. Adds that provenance so the banner can show it and offer merging
-- into an existing record instead of only Confirm/Discard.
--
-- review_source_table/review_source_record_id are polymorphic on purpose
-- (same tradeoff as company_default_scopes.resource_id / record_tabs.
-- record_table): the parent is either the literal 'projects' or a
-- company_tables.id. No FK, since it doesn't exist yet at the moment the
-- flagged row itself is inserted -- resolveOrCreateRelation runs before the
-- parent record's own insert -- so it's filled in by a follow-up update
-- once the parent record exists.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS review_created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS review_field_label text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS review_source_table text;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS review_source_record_id uuid;

ALTER TABLE properties ADD COLUMN IF NOT EXISTS review_created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS review_field_label text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS review_source_table text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS review_source_record_id uuid;

-- 'project' is itself a resolvable relation field type (RESOLVABLE_RELATION_
-- TABLES in gmail-addon/index.ts) -- e.g. a "Related Matter" field -- so a
-- flagged row can land on projects too, not just entities/properties.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_created_by uuid REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_field_label text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_source_table text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS review_source_record_id uuid;
