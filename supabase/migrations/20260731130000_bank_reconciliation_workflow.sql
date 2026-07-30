-- Bank Reconciliation workflow: the Trust Account page's "Bank Reconciliation"
-- tab ticks off cleared Trust Transactions rows against a bank statement and
-- needs to record, on each cleared row, which reconciliation cleared it
-- (`reconciled_in`, added in 20260731100000_trust_account_page.sql).
--
-- Trust Transactions is a ledger table (is_ledger=true): guard_ledger_records()
-- (supabase/company_table_ledger.sql) unconditionally blocks UPDATE on
-- company_table_records/company_table_values for ledger rows, and blocks
-- INSERT unless the transaction-local app.ledger_write flag is set. Setting
-- reconciled_in later is therefore impossible through the ordinary
-- createRecord/updateRecord path -- it needs its own narrow, audited escape
-- hatch, exactly like insert_ledger_record() already is one.
--
-- mark_trust_transactions_reconciled() is that hatch, deliberately narrow:
--   - only ever INSERTs a company_table_values row for the 'reconciled_in'
--     field (never UPDATEs one) -- so even with the guard's INSERT flag
--     bypassed, every OTHER field on the row (amounts, dates, receipt
--     numbers...) remains exactly as append-only as before;
--   - skips any record that already has a reconciled_in value, so a row can
--     only ever be linked to ONE reconciliation, once;
--   - writes an audit row to company_table_record_log, same as
--     insert_ledger_record().
CREATE OR REPLACE FUNCTION mark_trust_transactions_reconciled(
  p_table_id uuid,
  p_record_ids uuid[],
  p_reconciliation_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_table company_tables%ROWTYPE;
  v_field_id uuid;
  v_rec_id uuid;
BEGIN
  SELECT * INTO v_table FROM company_tables WHERE id = p_table_id AND deleted_at IS NULL;
  IF NOT FOUND OR NOT v_table.is_ledger THEN
    RAISE EXCEPTION 'not a ledger table';
  END IF;

  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = v_table.company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  SELECT id INTO v_field_id FROM company_table_fields
    WHERE table_id = p_table_id AND field_key = 'reconciled_in' AND deleted_at IS NULL;
  IF v_field_id IS NULL THEN
    RAISE EXCEPTION 'this ledger table has no reconciled_in field';
  END IF;

  PERFORM set_config('app.ledger_write', 'on', true);

  FOREACH v_rec_id IN ARRAY p_record_ids LOOP
    IF EXISTS (
      SELECT 1 FROM company_table_records
      WHERE id = v_rec_id AND table_id = p_table_id AND company_id = v_table.company_id AND deleted_at IS NULL
    ) AND NOT EXISTS (
      SELECT 1 FROM company_table_values WHERE record_id = v_rec_id AND field_id = v_field_id
    ) THEN
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_record_id)
        VALUES (v_table.company_id, p_table_id, v_rec_id, v_field_id, p_reconciliation_id);

      INSERT INTO company_table_record_log (company_id, table_id, record_id, actor_id, action, after)
        VALUES (v_table.company_id, p_table_id, v_rec_id, p_actor, 'reconcile', jsonb_build_object('reconciled_in', p_reconciliation_id));
    END IF;
  END LOOP;
END;
$$;
