-- Per-invoice overrides of the Detailed template's two itemised tables --
-- InvoiceTemplateSettingsTab.tsx's checkboxes set the TEMPLATE's default
-- (InvoiceTemplateDisplay.showProfessionalFeesTable/showSummaryFeesByLawyerTable);
-- these let one specific invoice deviate from that default without
-- changing the template or any other invoice. Nullable: null means "use
-- the template's setting" (every invoice created before this existed, and
-- any invoice where the admin didn't touch the checkbox), matching the
-- same optional/undefined-means-default convention the template-level
-- flags already use. See lib/invoices/hydrateInvoice.ts for the merge
-- order (invoice override > template default > true).
DO $$
DECLARE
  v_invoices_table_id uuid;
  v_max_order int;
BEGIN
  FOR v_invoices_table_id IN
    SELECT id FROM company_tables WHERE slug = 'invoices' AND deleted_at IS NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM company_table_fields WHERE table_id = v_invoices_table_id AND field_key = 'show_professional_fees_table') THEN
      SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM company_table_fields WHERE table_id = v_invoices_table_id;
      INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, display_order)
      SELECT ct.company_id, v_invoices_table_id, 'show_professional_fees_table', 'Show Professional Fees Table', 'boolean', false, v_max_order
      FROM company_tables ct WHERE ct.id = v_invoices_table_id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM company_table_fields WHERE table_id = v_invoices_table_id AND field_key = 'show_summary_fees_by_lawyer_table') THEN
      SELECT COALESCE(MAX(display_order), 0) + 1 INTO v_max_order FROM company_table_fields WHERE table_id = v_invoices_table_id;
      INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, display_order)
      SELECT ct.company_id, v_invoices_table_id, 'show_summary_fees_by_lawyer_table', 'Show Summary Fees by Lawyer Table', 'boolean', false, v_max_order
      FROM company_tables ct WHERE ct.id = v_invoices_table_id;
    END IF;
  END LOOP;
END $$;

-- Same fields on the Law Firm marketplace template's Invoices table.
INSERT INTO template_definition_table_fields (template_table_id, field_key, label, field_type, is_required, display_order)
SELECT tdt.id, f.field_key, f.label, 'boolean', false,
  COALESCE((SELECT MAX(display_order) FROM template_definition_table_fields WHERE template_table_id = tdt.id), 0) + row_number() OVER ()
FROM template_definition_tables tdt
JOIN template_definitions td ON td.id = tdt.template_id
CROSS JOIN (VALUES
  ('show_professional_fees_table', 'Show Professional Fees Table'),
  ('show_summary_fees_by_lawyer_table', 'Show Summary Fees by Lawyer Table')
) AS f(field_key, label)
WHERE td.slug = 'law-firm' AND tdt.name = 'Invoices'
  AND NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = tdt.id AND field_key = f.field_key
  );
