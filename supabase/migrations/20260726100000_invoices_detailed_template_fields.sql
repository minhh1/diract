-- Detailed law-firm invoice template: fields the reference invoice shows
-- that this app didn't track yet (Responsible Partner, Our/Your Reference).
-- "Position" for the Summary Fees by Lawyer table is NOT a new field --
-- entities.timekeeper_level (Partner/Senior Associate/Associate/Lawyer/
-- Paralegal/Clerk) already covers it, reused as-is.
INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_filter_column, linked_filter_value, show_in_table, display_order)
SELECT ct.company_id, ct.id, 'responsible_partner', 'Responsible Partner', 'entity', 'entities', 'entity_type', 'Staff', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_table_fields WHERE table_id = ct.id AND deleted_at IS NULL)
FROM company_tables ct
WHERE ct.slug = 'invoices' AND ct.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = ct.id AND x.field_key = 'responsible_partner' AND x.deleted_at IS NULL);

INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, show_in_table, display_order)
SELECT ct.company_id, ct.id, 'our_reference', 'Our Reference', 'text', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_table_fields WHERE table_id = ct.id AND deleted_at IS NULL)
FROM company_tables ct
WHERE ct.slug = 'invoices' AND ct.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = ct.id AND x.field_key = 'our_reference' AND x.deleted_at IS NULL);

INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, show_in_table, display_order)
SELECT ct.company_id, ct.id, 'your_reference', 'Your Reference', 'text', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM company_table_fields WHERE table_id = ct.id AND deleted_at IS NULL)
FROM company_tables ct
WHERE ct.slug = 'invoices' AND ct.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = ct.id AND x.field_key = 'your_reference' AND x.deleted_at IS NULL);

-- invoice_line_items.staff_position -- snapshotted from entities.timekeeper_level
-- at invoice-creation time, mirroring staff_name's existing snapshot exactly,
-- so the "Summary Fees by Lawyer" table on an issued invoice can't drift if
-- a timekeeper's level changes later.
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS staff_position text;

-- Mirror onto the marketplace catalog too (see
-- 20260726070900_template_definition_table_fields_extend.sql for why --
-- otherwise a brand-new install of the Law Firm template starts without
-- these fields).
INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, linked_system_table, show_in_table, display_order)
SELECT tt.id, 'responsible_partner', 'Responsible Partner', 'entity', 'entities', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM template_definition_table_fields WHERE template_table_id = tt.id)
FROM template_definition_tables tt
WHERE tt.slug = 'invoices'
  AND NOT EXISTS (SELECT 1 FROM template_definition_table_fields x WHERE x.template_table_id = tt.id AND x.field_key = 'responsible_partner');

-- linked_filter_column/linked_filter_value already exist on this table
-- (see 20260726070900_template_definition_table_fields_extend.sql) --
-- responsible_partner is just the first catalog field to actually use them
-- for a static (non-sentinel) filter.
UPDATE template_definition_table_fields tdf
SET linked_filter_column = 'entity_type', linked_filter_value = 'Staff'
FROM template_definition_tables tt
WHERE tdf.template_table_id = tt.id AND tt.slug = 'invoices' AND tdf.field_key = 'responsible_partner';

INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, show_in_table, display_order)
SELECT tt.id, 'our_reference', 'Our Reference', 'text', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM template_definition_table_fields WHERE template_table_id = tt.id)
FROM template_definition_tables tt
WHERE tt.slug = 'invoices'
  AND NOT EXISTS (SELECT 1 FROM template_definition_table_fields x WHERE x.template_table_id = tt.id AND x.field_key = 'our_reference');

INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, show_in_table, display_order)
SELECT tt.id, 'your_reference', 'Your Reference', 'text', true,
  (SELECT COALESCE(MAX(display_order), 0) + 1 FROM template_definition_table_fields WHERE template_table_id = tt.id)
FROM template_definition_tables tt
WHERE tt.slug = 'invoices'
  AND NOT EXISTS (SELECT 1 FROM template_definition_table_fields x WHERE x.template_table_id = tt.id AND x.field_key = 'your_reference');
