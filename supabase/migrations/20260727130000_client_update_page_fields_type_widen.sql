-- client_update_page_fields.field_type was only ever meant to cover adhoc
-- fields' own text/select choice -- widening it now that base/custom
-- fields also snapshot their real type here (date/number), so the display
-- layer (date formatting, numeric alignment) doesn't need a second lookup
-- per render.
ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_type_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_type_check
  CHECK (field_type IN ('text', 'select', 'date', 'number', 'boolean'));
