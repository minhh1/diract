-- Adds a Payee Address field to Trust Transactions, printed on the Trust
-- Payment Advice PDF under PAID TO alongside the payee name. Needed so
-- TrustPaymentModal.tsx's new "PEXA Direct Debit" quick-fill (auto-fills
-- payee name + address for the recurring PEXA settlement-fee direct debit)
-- has somewhere to put the address -- there was previously no address
-- concept anywhere on the trust ledger, only a name (payor_payee) and bank
-- details (account_name/payee_bsb/account_number) for EFT. Generic, not
-- PEXA-specific -- any payment can use it.
DO $$
DECLARE
  v_template_id uuid;
  v_trust_table_id uuid;
  v_install RECORD;
  v_member_id uuid;
BEGIN
  SELECT id INTO v_template_id FROM template_definitions WHERE slug = 'law-firm';
  IF v_template_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_trust_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-transactions';
  IF v_trust_table_id IS NULL THEN RETURN; END IF;

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, display_order, help_text)
  SELECT v_trust_table_id, 'payee_address', 'Payee Address', 'text', 26, NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = 'payee_address'
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
