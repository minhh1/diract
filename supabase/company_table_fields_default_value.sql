-- Mirrors company_custom_fields.default_value (system-table custom fields)
-- for custom-table fields -- lets a boolean field (e.g. "Billable") default
-- to checked instead of every boolean quick-add default hardcoding
-- unchecked (see components/dashboard/DashboardQuickAddForm.tsx's
-- getDefaultValues). Text encoding ('true'/'false' for booleans, raw text
-- otherwise) so one column covers every field type, same convention
-- company_custom_fields already uses.
ALTER TABLE company_table_fields
  ADD COLUMN IF NOT EXISTS default_value text;
