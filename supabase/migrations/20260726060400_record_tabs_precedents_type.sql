-- Adds the Precedent tab type (components/dashboard/tabs/PrecedentsTab.tsx)
-- to record_tabs' tab_type CHECK constraint. Based on the constraint as it
-- stands after supabase/remove_grid_layout_tab_type.sql (which dropped
-- 'custom_table' -- fully superseded by 'custom_dashboard' -- and added
-- 'custom_dashboard'), NOT the older list in
-- record_tabs_document_templates_type.sql, since live rows already use
-- 'custom_dashboard' and re-adding 'custom_table' would just resurrect a
-- removed, broken feature.
ALTER TABLE record_tabs DROP CONSTRAINT IF EXISTS record_tabs_tab_type_check;
ALTER TABLE record_tabs ADD CONSTRAINT record_tabs_tab_type_check
  CHECK (tab_type = ANY (ARRAY['fields'::text, 'sub_projects'::text, 'checklist'::text, 'calendar'::text, 'emails'::text, 'document_templates'::text, 'custom_dashboard'::text, 'precedents'::text]));
