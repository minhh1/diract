-- record_tabs.tab_type has a CHECK constraint enumerating every valid tab
-- type -- widen it to allow 'related_matters' (see
-- components/dashboard/tabs/RelatedMattersTab.tsx), an entities-only tab
-- listing every Matter the entity is linked to.
ALTER TABLE record_tabs DROP CONSTRAINT IF EXISTS record_tabs_tab_type_check;
ALTER TABLE record_tabs ADD CONSTRAINT record_tabs_tab_type_check
  CHECK (tab_type = ANY (ARRAY[
    'fields'::text, 'sub_projects'::text, 'checklist'::text, 'calendar'::text,
    'emails'::text, 'document_templates'::text, 'custom_dashboard'::text,
    'precedents'::text, 'invoice_dashboard'::text, 'related_matters'::text
  ]));
