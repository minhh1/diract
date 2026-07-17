-- The Document templates tab type (components/dashboard/tabs/DocumentTemplatesTab.tsx)
-- was missing from record_tabs' tab_type CHECK constraint, causing every
-- "Add tab" -> Document templates to fail with a 400 (constraint violation).
ALTER TABLE record_tabs DROP CONSTRAINT IF EXISTS record_tabs_tab_type_check;
ALTER TABLE record_tabs ADD CONSTRAINT record_tabs_tab_type_check
  CHECK (tab_type = ANY (ARRAY['fields'::text, 'sub_projects'::text, 'checklist'::text, 'calendar'::text, 'emails'::text, 'custom_table'::text, 'document_templates'::text]));
