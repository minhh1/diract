-- Free-text field on Invoices: a manually-typed description of the work
-- billed, shown as the page-1 fee-summary row label on the Detailed
-- template when its "Professional Fees" itemised table is toggled off
-- (InvoiceTemplateDisplay.showProfessionalFeesTable, see
-- generateDetailedInvoicePdf.ts) -- without the itemised table, the client
-- has no other way to see what the fees actually covered. Required
-- client-side in CreateInvoiceModal.tsx when that toggle is off, not at
-- the schema level (it's conditionally required, not always).
DO $$
DECLARE
  v_invoices_table_id uuid;
  v_max_order int;
BEGIN
  FOR v_invoices_table_id IN
    SELECT id FROM company_tables WHERE slug = 'invoices' AND deleted_at IS NULL
  LOOP
    IF EXISTS (SELECT 1 FROM company_table_fields WHERE table_id = v_invoices_table_id AND field_key = 'professional_fees_description') THEN
      CONTINUE;
    END IF;
    SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM company_table_fields WHERE table_id = v_invoices_table_id;
    INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, display_order)
    SELECT ct.company_id, v_invoices_table_id, 'professional_fees_description', 'Professional Fees Description', 'text', false, v_max_order
    FROM company_tables ct WHERE ct.id = v_invoices_table_id;
  END LOOP;
END $$;

-- Same field on the Law Firm marketplace template's Invoices table, so a
-- future install gets it too.
INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, is_required, display_order)
SELECT tdt.id, 'professional_fees_description', 'Professional Fees Description', 'text', false,
  COALESCE((SELECT MAX(display_order) FROM template_definition_table_fields WHERE template_table_id = tdt.id), 0) + 1
FROM template_definition_tables tdt
JOIN template_definitions td ON td.id = tdt.template_id
WHERE td.slug = 'law-firm' AND tdt.name = 'Invoices'
  AND NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = tdt.id AND field_key = 'professional_fees_description'
  );
