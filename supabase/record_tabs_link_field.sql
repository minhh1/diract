ALTER TABLE record_tabs ADD COLUMN IF NOT EXISTS link_field_id uuid REFERENCES company_table_fields(id);
