-- AI-classified section name for grouping a tab's fields in the Details
-- view (e.g. "Client Details", "Trust Settings") -- scoped per-tab/per-field
-- like col_span/row_order, not company-wide like company_custom_fields.section_name.
ALTER TABLE record_tab_fields ADD COLUMN IF NOT EXISTS section text;
