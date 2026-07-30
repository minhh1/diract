-- Bank Reconciliation sign-off needs to be a real confirmation from an
-- authorized person, not a free-text window.prompt anyone with page access
-- can fill in with any name (see components/trust/BankReconciliationTab.tsx's
-- old handleMarkReviewed). The Law Firm template already has a per-person
-- seniority field for exactly this purpose -- entities.timekeeper_level
-- (select field, options include 'Partner' -- see
-- template_law_firm_seed.sql's "Law-specific fields on entities" block),
-- set on each staff member's own Staff entity (entities.linked_profile_id =
-- their profiles.id, see lib/services/staffEntityService.ts).
--
-- sign_bank_reconciliation() is a SECURITY DEFINER RPC (same shape as
-- insert_ledger_record()/mark_trust_transactions_reconciled()) so the
-- authorization check and the identity written into reviewed_by are both
-- enforced server-side -- the caller can't just POST an arbitrary name:
--   - confirms the caller's OWN Staff entity has timekeeper_level = 'Partner';
--   - writes the caller's OWN profiles.full_name (not client-supplied text)
--     plus now() as reviewed_by/reviewed_at;
--   - refuses to re-sign a reconciliation that already has a reviewed_by.
CREATE OR REPLACE FUNCTION sign_bank_reconciliation(
  p_reconciliation_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_table_id uuid;
  v_company_id uuid;
  v_is_partner boolean;
  v_already_signed text;
  v_signer_name text;
  v_reviewed_by_field_id uuid;
  v_reviewed_at_field_id uuid;
  v_today date := now()::date;
BEGIN
  IF p_actor IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT ctr.table_id, ct.company_id INTO v_table_id, v_company_id
  FROM company_table_records ctr
  JOIN company_tables ct ON ct.id = ctr.table_id
  WHERE ctr.id = p_reconciliation_id AND ctr.deleted_at IS NULL
    AND ct.slug = 'bank-reconciliations' AND ct.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconciliation not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  -- Caller's own Staff entity must be marked 'Partner'.
  SELECT (ccfv.value_text = 'Partner') INTO v_is_partner
  FROM entities e
  JOIN company_custom_fields ccf
    ON ccf.company_id = e.company_id AND ccf.table_name = 'entities'
   AND ccf.field_key = 'timekeeper_level' AND ccf.deleted_at IS NULL
  JOIN company_custom_field_values ccfv
    ON ccfv.field_id = ccf.id AND ccfv.record_id = e.id
  WHERE e.company_id = v_company_id AND e.linked_profile_id = p_actor AND e.deleted_at IS NULL
  LIMIT 1;

  IF NOT COALESCE(v_is_partner, false) THEN
    RAISE EXCEPTION 'NOT_A_PARTNER: only a Partner can sign off a bank reconciliation';
  END IF;

  SELECT id INTO v_reviewed_by_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'reviewed_by' AND deleted_at IS NULL;
  SELECT id INTO v_reviewed_at_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'reviewed_at' AND deleted_at IS NULL;
  IF v_reviewed_by_field_id IS NULL OR v_reviewed_at_field_id IS NULL THEN
    RAISE EXCEPTION 'this table has no reviewed_by/reviewed_at field';
  END IF;

  SELECT value_text INTO v_already_signed FROM company_table_values WHERE record_id = p_reconciliation_id AND field_id = v_reviewed_by_field_id;
  IF v_already_signed IS NOT NULL AND v_already_signed <> '' THEN
    RAISE EXCEPTION 'ALREADY_SIGNED: this reconciliation has already been signed off by %', v_already_signed;
  END IF;

  SELECT full_name INTO v_signer_name FROM profiles WHERE id = p_actor;
  IF v_signer_name IS NULL OR v_signer_name = '' THEN
    RAISE EXCEPTION 'your profile has no name on file -- add one before signing';
  END IF;

  INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
    VALUES (v_company_id, v_table_id, p_reconciliation_id, v_reviewed_by_field_id, v_signer_name)
    ON CONFLICT (record_id, field_id) DO UPDATE SET value_text = EXCLUDED.value_text;
  INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_date)
    VALUES (v_company_id, v_table_id, p_reconciliation_id, v_reviewed_at_field_id, v_today)
    ON CONFLICT (record_id, field_id) DO UPDATE SET value_date = EXCLUDED.value_date;

  INSERT INTO company_table_record_log (company_id, table_id, record_id, actor_id, action, after)
    VALUES (v_company_id, v_table_id, p_reconciliation_id, p_actor, 'sign_off', jsonb_build_object('reviewed_by', v_signer_name, 'reviewed_at', v_today));

  RETURN jsonb_build_object('reviewed_by', v_signer_name, 'reviewed_at', v_today);
END;
$$;
