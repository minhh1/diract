-- Free-text field on Invoices: additional details a firm wants to add to
-- an invoice beyond the standard fee/disbursement breakdown (e.g. a project
-- summary, special payment arrangement, or context for a general/non-legal
-- client) -- rendered as its own section on the Standard (flexible)
-- template, see generateInvoicePdf.ts. Optional, never required -- unlike
-- professional_fees_description this isn't a substitute for anything else
-- on the invoice. Same DO $$ pattern as
-- supabase/invoices_professional_fees_description.sql.
DO $$
DECLARE
  v_invoices_table_id uuid;
  v_max_order int;
BEGIN
  FOR v_invoices_table_id IN
    SELECT id FROM company_tables WHERE slug = 'invoices' AND deleted_at IS NULL
  LOOP
    IF EXISTS (SELECT 1 FROM company_table_fields WHERE table_id = v_invoices_table_id AND field_key = 'additional_details') THEN
      CONTINUE;
    END IF;
    SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM company_table_fields WHERE table_id = v_invoices_table_id;
    INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, display_order)
    SELECT ct.company_id, v_invoices_table_id, 'additional_details', 'Additional Details', 'text', false, v_max_order
    FROM company_tables ct WHERE ct.id = v_invoices_table_id;
  END LOOP;
END $$;

-- Same field on the Law Firm marketplace template's Invoices table, so a
-- future install gets it too.
INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, is_required, display_order)
SELECT tdt.id, 'additional_details', 'Additional Details', 'text', false,
  COALESCE((SELECT MAX(display_order) FROM template_definition_table_fields WHERE template_table_id = tdt.id), 0) + 1
FROM template_definition_tables tdt
JOIN template_definitions td ON td.id = tdt.template_id
WHERE td.slug = 'law-firm' AND tdt.name = 'Invoices'
  AND NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = tdt.id AND field_key = 'additional_details'
  );
