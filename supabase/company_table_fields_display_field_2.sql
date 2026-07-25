-- Optional second field combined onto a relation field's search/display
-- label as "<linked_display_field> — <linked_display_field_2>" (e.g.
-- combining a Matter Number custom field with the matter's Project Name so
-- the search-and-choose bar shows "260586 — Onsell Contract - Dahlia by
-- Azure Lot 35" instead of just the project name). Same format convention
-- as linked_search_field_keys: a bare native column name, or
-- 'cf:<company_custom_fields.id>' for a custom field, when the field links
-- to a system table; a field_key on the linked custom table otherwise. See
-- components/dashboard/RelationPicker.tsx's displayField2 prop and
-- components/schema/FieldConfigPanel.tsx's "Also show" selector.
ALTER TABLE company_table_fields
  ADD COLUMN IF NOT EXISTS linked_display_field_2 text;
