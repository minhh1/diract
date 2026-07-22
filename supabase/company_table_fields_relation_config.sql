-- Extra config for a custom-table relation field (property/entity/project/
-- table_relation) linked to a system table, so the picker in
-- components/dashboard/RelationPicker.tsx can do more than match one
-- display column:
--
--   linked_search_field_keys -- which extra fields the search box matches
--     against, besides linked_display_field. Entries are either a native
--     column name on the system table (see lib/columnDefinitions.ts) or
--     'cf:<company_custom_fields.id>' for a custom field on that table
--     (e.g. "Matter Number" on projects).
--
--   linked_filter_column / linked_filter_value -- restricts the picker to
--     rows where that native column equals that value, e.g. a "Staff" field
--     linked to entities with linked_filter_column='entity_type',
--     linked_filter_value='Staff' instead of listing every entity.
--
-- Configured per-field in the schema builder (components/schema/
-- FieldConfigPanel.tsx), same place as the existing "Display field" setting.

ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS linked_search_field_keys text[];
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS linked_filter_column text;
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS linked_filter_value text;
