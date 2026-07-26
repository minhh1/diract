-- Remembers which of companies.invoice_settings.templates[] an invoice was
-- created with (CreateInvoiceModal's template picker), so regenerating its
-- PDF later always uses the same layout even if the company adds more
-- templates or changes which one is default afterward. Plain text field
-- holding a templates[].id value -- not a relation, since invoice_settings
-- templates aren't a real table.
DO $$
DECLARE
  v_invoices_table_id uuid;
BEGIN
  FOR v_invoices_table_id IN SELECT id FROM company_tables WHERE slug = 'invoices' AND deleted_at IS NULL
  LOOP
    INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, display_order)
    SELECT (SELECT company_id FROM company_tables WHERE id = v_invoices_table_id), v_invoices_table_id, 'template_id', 'Template', 'text',
      COALESCE((SELECT MAX(display_order) + 1 FROM company_table_fields WHERE table_id = v_invoices_table_id), 0)
    WHERE NOT EXISTS (
      SELECT 1 FROM company_table_fields WHERE table_id = v_invoices_table_id AND field_key = 'template_id' AND deleted_at IS NULL
    );
  END LOOP;
END $$;

DO $$
DECLARE
  v_template_table_id uuid;
BEGIN
  SELECT id INTO v_template_table_id FROM template_definition_tables WHERE slug = 'invoices';
  IF v_template_table_id IS NOT NULL THEN
    INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, display_order)
    SELECT v_template_table_id, 'template_id', 'Template', 'text',
      COALESCE((SELECT MAX(display_order) + 1 FROM template_definition_table_fields WHERE template_table_id = v_template_table_id), 0)
    WHERE NOT EXISTS (
      SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_template_table_id AND field_key = 'template_id'
    );
  END IF;
END $$;
