-- Adds a Discount field to Invoices -- CreateInvoiceModal.tsx's new
-- "Additional discount on total" lets an admin apply a further discretionary
-- discount to the whole invoice (fees + disbursements, post-GST), separate
-- from the existing per-line fee apportionment (which only discounts
-- selected FEE lines, pre-GST). subtotal/gst/total_inc_gst stay the
-- formula-computed, undiscounted figures (see template_law_firm_seed.sql's
-- fees_total -> subtotal -> gst -> total_inc_gst cascade) -- this field only
-- feeds amount_due, the same relationship waived_amount/trust_applied/
-- payments already have to it.
DO $$
DECLARE
  v_template_id uuid;
  v_invoices_table_id uuid;
  v_install RECORD;
  v_member_id uuid;
BEGIN
  SELECT id INTO v_template_id FROM template_definitions WHERE slug = 'law-firm';
  IF v_template_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_invoices_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'invoices';
  IF v_invoices_table_id IS NULL THEN RETURN; END IF;

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, display_order)
  SELECT v_invoices_table_id, 'discount_amount', 'Discount', 'currency', 17
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_invoices_table_id AND field_key = 'discount_amount'
  );

  -- Roll out to every already-installed company, same impersonation trick
  -- as every other template-catalog rollout in this codebase.
  FOR v_install IN SELECT company_id FROM company_template_installs WHERE template_id = v_template_id LOOP
    SELECT user_id INTO v_member_id FROM company_memberships WHERE company_id = v_install.company_id LIMIT 1;
    CONTINUE WHEN v_member_id IS NULL;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_id)::text, true);
    PERFORM upgrade_company_template(v_install.company_id, v_template_id);
  END LOOP;
END $$;
