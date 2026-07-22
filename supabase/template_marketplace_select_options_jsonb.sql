-- Fix: template_definition_table_fields/template_definition_system_fields'
-- select_options was declared text[] in template_marketplace.sql, but the
-- real install targets (company_table_fields/company_custom_fields) actually
-- store select_options as jsonb, not text[] -- discovered when
-- install_company_template's INSERT hit "column select_options is of type
-- jsonb but expression is of type text[]". Converting existing text[] data
-- to jsonb via USING so this is safe to run after the template already has
-- seeded data.

ALTER TABLE template_definition_table_fields
  ALTER COLUMN select_options TYPE jsonb USING to_jsonb(select_options);

ALTER TABLE template_definition_system_fields
  ALTER COLUMN select_options TYPE jsonb USING to_jsonb(select_options);
