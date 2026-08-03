-- Lets a template field auto-fill from a record ONE HOP away from the
-- matter (its linked Property, its parent Matter, or a custom
-- entity/property/project/table_relation field), not just a direct custom
-- field on the matter itself (see auto_fill_field_id above).
--
-- A field uses either auto_fill_field_id OR these three columns, never
-- both -- enforced in the save handler, not here, matching this table's
-- existing lightweight-validation style (see joined_to_field_id/
-- trigger_field_id, which also aren't mutually exclusive at the DB level).
--
-- auto_fill_relation_column: the relation's own key on `projects` -- either
--   a system FK/junction column name (`property_id`, `parent_project_id`,
--   see lib/schema/systemTableRelations.ts's SYSTEM_TABLE_RELATION_MAP) or
--   a custom relation-type field's field_key (category 'relation', field
--   types entity/property/project/table_relation -- see
--   lib/schema/fieldCapabilities.ts).
-- auto_fill_related_table: the target table (e.g. 'properties', 'entities').
-- auto_fill_related_field: the field to read on the target record -- a
--   native column name, or a custom field key on that table.
ALTER TABLE document_template_fields
  ADD COLUMN IF NOT EXISTS auto_fill_relation_column text,
  ADD COLUMN IF NOT EXISTS auto_fill_related_table text,
  ADD COLUMN IF NOT EXISTS auto_fill_related_field text;
