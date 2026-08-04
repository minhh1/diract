-- Trust Payment: a general trust withdrawal modal (Bank Cheque / Bank
-- Transfer / Direct Debit / Trust Cheque), alongside the existing Deposit
-- Funds / Print Cheques modals on /dashboard/trust-account and the new
-- per-matter "Deposit Trust" / "Trust Payment" buttons on TrustAccountTab.tsx.
-- Extends the EXISTING payment_method select (adds Bank Cheque / Direct
-- Debit / Trust Cheque -- Bank Transfer/Cash/Cheque/Credit Card/Funds
-- remained in Bank Account already exist) and adds four fields Trust
-- Transactions didn't have yet: transfer_type (Direct Deposit / BPAY --
-- only meaningful for Bank Transfer / Direct Debit payments), account_name
-- + account_number (the payee's bank details, printed on the payment
-- advice) and internal_note (an office-only note, distinct from
-- purpose/"Reason" which is the client-facing reason for the payment).
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

  -- ── Extend payment_method (catalog + every already-installed company) ──
  UPDATE template_definition_table_fields
  SET select_options = select_options || '["Bank Cheque"]'::jsonb
  WHERE template_table_id = v_trust_table_id AND field_key = 'payment_method' AND NOT (select_options ? 'Bank Cheque');
  UPDATE template_definition_table_fields
  SET select_options = select_options || '["Direct Debit"]'::jsonb
  WHERE template_table_id = v_trust_table_id AND field_key = 'payment_method' AND NOT (select_options ? 'Direct Debit');
  UPDATE template_definition_table_fields
  SET select_options = select_options || '["Trust Cheque"]'::jsonb
  WHERE template_table_id = v_trust_table_id AND field_key = 'payment_method' AND NOT (select_options ? 'Trust Cheque');

  UPDATE company_table_fields ctf
  SET select_options = select_options || '["Bank Cheque"]'::jsonb
  FROM company_tables ct
  WHERE ctf.table_id = ct.id AND ct.slug = 'trust-transactions' AND ctf.field_key = 'payment_method' AND ctf.deleted_at IS NULL
    AND NOT (ctf.select_options ? 'Bank Cheque');
  UPDATE company_table_fields ctf
  SET select_options = select_options || '["Direct Debit"]'::jsonb
  FROM company_tables ct
  WHERE ctf.table_id = ct.id AND ct.slug = 'trust-transactions' AND ctf.field_key = 'payment_method' AND ctf.deleted_at IS NULL
    AND NOT (ctf.select_options ? 'Direct Debit');
  UPDATE company_table_fields ctf
  SET select_options = select_options || '["Trust Cheque"]'::jsonb
  FROM company_tables ct
  WHERE ctf.table_id = ct.id AND ct.slug = 'trust-transactions' AND ctf.field_key = 'payment_method' AND ctf.deleted_at IS NULL
    AND NOT (ctf.select_options ? 'Trust Cheque');

  -- ── New fields (catalog) ──
  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, display_order, help_text)
  SELECT v_trust_table_id, v.field_key, v.label, v.field_type, v.select_options, v.display_order, v.help_text
  FROM (VALUES
    ('transfer_type',  'Transfer Type',  'select', to_jsonb(ARRAY['Direct Deposit','BPAY']), 17, 'Only shown for Bank Transfer / Direct Debit payments'::text),
    ('account_name',   'Account Name',   'text',   NULL::jsonb, 18, NULL::text),
    ('payee_bsb',       'BSB',            'text',   NULL::jsonb, 19, NULL::text),
    ('account_number', 'Account Number', 'text',   NULL::jsonb, 20, NULL::text),
    ('internal_note',  'Internal Note',  'text',   NULL::jsonb, 21, NULL::text)
  ) AS v(field_key, label, field_type, select_options, display_order, help_text)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = v.field_key
  );

  -- ── Roll out the 4 new fields to every already-installed company ──
  -- Same impersonation trick as 20260731100000_trust_account_page.sql:
  -- upgrade_company_template() checks auth.uid() is a member of the target
  -- company, which a migration has none of by default. Only ADDS fields
  -- missing from the target table (skips ones that already exist), so this
  -- is safe to run alongside the payment_method UPDATEs above.
  FOR v_install IN SELECT company_id FROM company_template_installs WHERE template_id = v_template_id LOOP
    SELECT user_id INTO v_member_id FROM company_memberships WHERE company_id = v_install.company_id LIMIT 1;
    CONTINUE WHEN v_member_id IS NULL;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_id)::text, true);
    PERFORM upgrade_company_template(v_install.company_id, v_template_id);
  END LOOP;
END $$;
