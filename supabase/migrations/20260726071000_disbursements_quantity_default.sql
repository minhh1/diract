-- Disbursements' quantity field should default to 1 on the quick-add form
-- (see DashboardQuickAddForm.tsx's getDefaultValues, just extended to honor
-- default_value for number/currency fields too) -- almost every disbursement
-- is a single item/expense, so re-typing "1" every time was pure friction.
UPDATE company_table_fields ctf
SET default_value = '1'
FROM company_tables ct
WHERE ctf.table_id = ct.id
  AND ct.slug = 'disbursements'
  AND ctf.field_key = 'quantity'
  AND ctf.deleted_at IS NULL;

UPDATE template_definition_table_fields tdf
SET default_value = '1'
FROM template_definition_tables tt
WHERE tdf.template_table_id = tt.id
  AND tt.slug = 'disbursements'
  AND tdf.field_key = 'quantity';
