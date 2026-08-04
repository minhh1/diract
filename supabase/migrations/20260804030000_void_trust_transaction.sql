-- Voiding a Trust Transactions row -- append-only (see
-- supabase/company_table_ledger.sql), so "void" can't mean UPDATE/DELETE.
-- Instead: void_trust_transaction() creates a fresh reversing entry
-- (opposite amount_in/amount_out, same matter/trust_account) via the
-- EXISTING insert_ledger_record() -- reusing its numbering/balance/
-- overdraw logic rather than duplicating it -- then marks the ORIGINAL row
-- with voided_at/void_reason/voided_by (the narrow INSERT-only bypass
-- pattern from mark_trust_transactions_reconciled(), see
-- 20260731130000_bank_reconciliation_workflow.sql) and the new reversing
-- row with reversal_of pointing back at it.
--
-- A voided Deposit's reversal is a Withdrawal (and vice versa) so
-- amount_in/amount_out stay directionally consistent with every report
-- that reads `type` (Cash Books etc.); a voided Journal Transfer leg's
-- reversal stays a Journal Transfer, since flipping just that one leg's
-- amount already reverses it correctly on its own.
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
    (template_table_id, field_key, label, field_type, linked_template_table_id, linked_display_field, display_order, help_text)
  SELECT v_trust_table_id, v.field_key, v.label, v.field_type, v.linked_template_table_id, v.linked_display_field, v.display_order, v.help_text
  FROM (VALUES
    ('voided_at',    'Voided',            'date',           NULL::uuid, NULL::text, 22, NULL::text),
    ('void_reason',  'Void Reason',       'text',           NULL::uuid, NULL::text, 23, NULL::text),
    ('voided_by',    'Voided By',         'text',           NULL::uuid, NULL::text, 24, NULL::text),
    ('reversal_of',  'Reversal Of',       'table_relation', v_trust_table_id, 'receipt_number'::text, 25, 'Set automatically when this row is a voiding reversal of another'::text)
  ) AS v(field_key, label, field_type, linked_template_table_id, linked_display_field, display_order, help_text)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = v.field_key
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

CREATE OR REPLACE FUNCTION void_trust_transaction(
  p_table_id uuid,
  p_record_id uuid,
  p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_table company_tables%ROWTYPE;
  v_actor_name text;
  v_type_field_id uuid;
  v_in_field_id uuid;
  v_out_field_id uuid;
  v_matter_field_id uuid;
  v_account_field_id uuid;
  v_payee_field_id uuid;
  v_receipt_field_id uuid;
  v_payment_field_id uuid;
  v_journal_field_id uuid;
  v_voided_field_id uuid;
  v_reason_field_id uuid;
  v_voidedby_field_id uuid;
  v_reversal_field_id uuid;
  v_orig_type text;
  v_orig_in numeric;
  v_orig_out numeric;
  v_orig_matter uuid;
  v_orig_account uuid;
  v_orig_payee text;
  v_orig_number text;
  v_new_type text;
  v_payload jsonb;
  v_result jsonb;
  v_new_record_id uuid;
BEGIN
  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'VOID_REASON_REQUIRED: a reason is required to void a trust transaction';
  END IF;

  SELECT * INTO v_table FROM company_tables WHERE id = p_table_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT v_table.is_ledger THEN
    RAISE EXCEPTION 'not a ledger table';
  END IF;

  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Only a company admin can void a trust transaction -- same bar as
  -- archiving/deleting any other record (prevent_non_admin_delete()).
  IF NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_table.company_id AND user_id = p_actor AND role = 'company_admin'
  ) THEN
    RAISE EXCEPTION 'VOID_ADMIN_ONLY: only a company admin can void a trust transaction';
  END IF;

  SELECT id INTO v_type_field_id     FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'type'          AND deleted_at IS NULL;
  SELECT id INTO v_in_field_id       FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'amount_in'     AND deleted_at IS NULL;
  SELECT id INTO v_out_field_id      FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'amount_out'    AND deleted_at IS NULL;
  SELECT id INTO v_matter_field_id   FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'matter'        AND deleted_at IS NULL;
  SELECT id INTO v_account_field_id  FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'trust_account' AND deleted_at IS NULL;
  SELECT id INTO v_payee_field_id    FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'payor_payee'   AND deleted_at IS NULL;
  SELECT id INTO v_receipt_field_id  FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'receipt_number' AND deleted_at IS NULL;
  SELECT id INTO v_payment_field_id  FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'payment_number' AND deleted_at IS NULL;
  SELECT id INTO v_journal_field_id  FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'journal_number' AND deleted_at IS NULL;
  SELECT id INTO v_voided_field_id   FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'voided_at'     AND deleted_at IS NULL;
  SELECT id INTO v_reason_field_id   FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'void_reason'  AND deleted_at IS NULL;
  SELECT id INTO v_voidedby_field_id FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'voided_by'    AND deleted_at IS NULL;
  SELECT id INTO v_reversal_field_id FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'reversal_of' AND deleted_at IS NULL;

  IF v_voided_field_id IS NULL THEN
    RAISE EXCEPTION 'this table does not support voiding';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_table_records WHERE id = p_record_id AND table_id = p_table_id AND company_id = v_table.company_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'record not found';
  END IF;

  IF EXISTS (SELECT 1 FROM company_table_values WHERE record_id = p_record_id AND field_id = v_voided_field_id) THEN
    RAISE EXCEPTION 'VOID_ALREADY: this transaction has already been voided';
  END IF;

  SELECT value_text INTO v_orig_type FROM company_table_values WHERE record_id = p_record_id AND field_id = v_type_field_id;
  SELECT value_number INTO v_orig_in FROM company_table_values WHERE record_id = p_record_id AND field_id = v_in_field_id;
  SELECT value_number INTO v_orig_out FROM company_table_values WHERE record_id = p_record_id AND field_id = v_out_field_id;
  SELECT value_record_id INTO v_orig_matter FROM company_table_values WHERE record_id = p_record_id AND field_id = v_matter_field_id;
  SELECT value_record_id INTO v_orig_account FROM company_table_values WHERE record_id = p_record_id AND field_id = v_account_field_id;
  SELECT value_text INTO v_orig_payee FROM company_table_values WHERE record_id = p_record_id AND field_id = v_payee_field_id;
  SELECT COALESCE(
    (SELECT value_text FROM company_table_values WHERE record_id = p_record_id AND field_id = v_receipt_field_id),
    (SELECT value_text FROM company_table_values WHERE record_id = p_record_id AND field_id = v_payment_field_id),
    (SELECT value_text FROM company_table_values WHERE record_id = p_record_id AND field_id = v_journal_field_id)
  ) INTO v_orig_number;

  IF COALESCE(v_orig_in, 0) = 0 AND COALESCE(v_orig_out, 0) = 0 THEN
    RAISE EXCEPTION 'nothing to reverse on this record';
  END IF;

  v_new_type := CASE
    WHEN v_orig_type = 'Deposit' THEN 'Withdrawal - EFT'
    WHEN v_orig_type LIKE 'Withdrawal%' THEN 'Deposit'
    ELSE v_orig_type -- Journal Transfer reverses to Journal Transfer
  END;

  v_payload := jsonb_build_object(
    'type', v_new_type,
    'purpose', 'Void of ' || COALESCE(v_orig_number, 'entry') || ': ' || p_reason
  );
  IF v_orig_matter IS NOT NULL THEN v_payload := v_payload || jsonb_build_object('matter', v_orig_matter); END IF;
  IF v_orig_account IS NOT NULL THEN v_payload := v_payload || jsonb_build_object('trust_account', v_orig_account); END IF;
  IF v_orig_payee IS NOT NULL THEN v_payload := v_payload || jsonb_build_object('payor_payee', v_orig_payee); END IF;
  IF COALESCE(v_orig_in, 0) > 0 THEN v_payload := v_payload || jsonb_build_object('amount_out', v_orig_in); END IF;
  IF COALESCE(v_orig_out, 0) > 0 THEN v_payload := v_payload || jsonb_build_object('amount_in', v_orig_out); END IF;

  -- insert_ledger_record() re-runs the full overdraw guard for the
  -- reversing entry -- voiding a Deposit that's already been (correctly)
  -- spent elsewhere on the matter would overdraw it, and correctly fails
  -- here rather than silently pushing the matter's trust ledger negative.
  v_result := insert_ledger_record(p_table_id, v_payload);
  v_new_record_id := (v_result->>'id')::uuid;

  PERFORM set_config('app.ledger_write', 'on', true);

  IF v_reversal_field_id IS NOT NULL THEN
    INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_record_id)
      VALUES (v_table.company_id, p_table_id, v_new_record_id, v_reversal_field_id, p_record_id);
  END IF;

  SELECT full_name INTO v_actor_name FROM profiles WHERE id = p_actor;

  INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_date)
    VALUES (v_table.company_id, p_table_id, p_record_id, v_voided_field_id, now()::date);
  IF v_reason_field_id IS NOT NULL THEN
    INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
      VALUES (v_table.company_id, p_table_id, p_record_id, v_reason_field_id, p_reason);
  END IF;
  IF v_voidedby_field_id IS NOT NULL THEN
    INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
      VALUES (v_table.company_id, p_table_id, p_record_id, v_voidedby_field_id, COALESCE(v_actor_name, 'Unknown'));
  END IF;

  INSERT INTO company_table_record_log (company_id, table_id, record_id, actor_id, action, after)
    VALUES (v_table.company_id, p_table_id, p_record_id, p_actor, 'void', jsonb_build_object('reason', p_reason, 'reversal_record_id', v_new_record_id));

  RETURN jsonb_build_object('reversalRecordId', v_new_record_id, 'reversalNumber', v_result->>'number');
END;
$$;
