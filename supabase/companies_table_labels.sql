-- Per-company display-name overrides for the three system tables, e.g. a
-- law firm renaming "Projects" to "Matters" throughout the sidebar. A
-- marketplace template can suggest a set of overrides at install time (see
-- template_marketplace.sql's template_definitions.suggested_label_overrides)
-- but the tenant has to opt in -- this column is what actually gets applied.
-- Shape: {"projects": {"singular": "Matter", "plural": "Matters"}, ...}.
-- Read by components/CompanyContext.tsx and components/Sidebar.tsx.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS table_label_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
