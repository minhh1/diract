-- 'currency' was being collapsed into 'number' when mirroring a base/custom
-- field's real type, losing the $ display distinction. Add it as its own
-- allowed field_type.
ALTER TABLE client_update_page_fields DROP CONSTRAINT IF EXISTS client_update_page_fields_field_type_check;
ALTER TABLE client_update_page_fields ADD CONSTRAINT client_update_page_fields_field_type_check
  CHECK (field_type IN ('text', 'select', 'date', 'number', 'currency', 'boolean'));
