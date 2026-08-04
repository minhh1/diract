-- Restores per-matter balance scoping by trust_account in
-- insert_ledger_record(), which supabase/migrations/20260731100000_trust_account_page.sql
-- originally added (two trust accounts posting against the same matter
-- would otherwise pool into one balance -- a real correctness bug once
-- multi-account support exists) but
-- supabase/migrations/20260802160000_trust_split_payment_journal_numbers.sql
-- silently dropped when it replaced the function to add type-based
-- auto-number field selection (payment_number/journal_number), reverting
-- the balance query to its pre-multi-account shape without saying so.
-- Harmless today (every live company has exactly one trust account) but
-- would resurface as a real bug the moment a firm adds a second one --
-- caught while investigating a wrong "Available After Payment" figure in
-- the Trust Payment modal (unrelated to this regression, but discovered
-- alongside it).
--
-- Restoring the scoping naively would reintroduce that Available-After-
-- Payment bug from the other direction: a matter's opening-balance rows
-- created before the trust_account field existed have no value for it, so
-- a literal account match would exclude them the moment a real account id
-- is supplied. Mirrors the fallback the company-wide trust account page
-- (app/dashboard/trust-account/page.tsx) already uses for exactly this:
-- an unattributed row still counts as long as the company only has ONE
-- active trust account (the common case) -- only a company with a genuine
-- second account needs the strict match, and by then any earlier
-- unattributed rows belong to whichever account existed at the time.
CREATE OR REPLACE FUNCTION insert_ledger_record(
  p_table_id uuid,
  p_values jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_table company_tables%ROWTYPE;
  v_fld company_table_fields%ROWTYPE;
  v_num_field company_table_fields%ROWTYPE;
  v_in_field_id uuid;
  v_out_field_id uuid;
  v_matter_field_id uuid;
  v_balance_field_id uuid;
  v_account_field_id uuid;
  v_matter_id uuid;
  v_account_id uuid;
  v_active_account_count int := 0;
  v_amount_in numeric := 0;
  v_amount_out numeric := 0;
  v_prior numeric := 0;
  v_balance numeric;
  v_record_id uuid;
  v_number text;
  v_val text;
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

  -- One writer per ledger table at a time: keeps receipt numbers strictly
  -- consecutive and running balances race-free.
  PERFORM pg_advisory_xact_lock(hashtext(p_table_id::text));
  PERFORM set_config('app.ledger_write', 'on', true);

  SELECT id INTO v_in_field_id      FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'amount_in'       AND deleted_at IS NULL;
  SELECT id INTO v_out_field_id     FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'amount_out'      AND deleted_at IS NULL;
  SELECT id INTO v_matter_field_id  FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'matter'          AND deleted_at IS NULL;
  SELECT id INTO v_balance_field_id FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'running_balance' AND deleted_at IS NULL;
  SELECT id INTO v_account_field_id FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'trust_account'   AND deleted_at IS NULL;
  SELECT * INTO v_num_field FROM company_table_fields
    WHERE table_id = p_table_id AND auto_number_prefix IS NOT NULL AND deleted_at IS NULL
    AND field_key = CASE COALESCE(p_values->>'type', '')
      WHEN 'Deposit' THEN 'receipt_number'
      WHEN 'Withdrawal - Cheque' THEN 'payment_number'
      WHEN 'Withdrawal - EFT' THEN 'payment_number'
      WHEN 'Journal Transfer' THEN 'journal_number'
      ELSE field_key
    END
    LIMIT 1;

  v_amount_in  := COALESCE(NULLIF(p_values->>'amount_in',  '')::numeric, 0);
  v_amount_out := COALESCE(NULLIF(p_values->>'amount_out', '')::numeric, 0);
  IF v_amount_in < 0 OR v_amount_out < 0 THEN
    RAISE EXCEPTION 'LEDGER_NEGATIVE_AMOUNT: amounts must be entered as positive values';
  END IF;
  v_matter_id := NULLIF(p_values->>'matter', '')::uuid;
  v_account_id := NULLIF(p_values->>'trust_account', '')::uuid;

  IF v_account_field_id IS NOT NULL THEN
    SELECT count(*) INTO v_active_account_count
    FROM company_table_records acc
    JOIN company_tables acct ON acct.id = acc.table_id AND acct.slug = 'trust-accounts' AND acct.company_id = v_table.company_id
    LEFT JOIN company_table_fields af ON af.table_id = acct.id AND af.field_key = 'is_active' AND af.deleted_at IS NULL
    LEFT JOIN company_table_values av ON av.record_id = acc.id AND av.field_id = af.id
    WHERE acc.deleted_at IS NULL AND COALESCE(av.value_boolean, true) = true;
  END IF;

  -- Running balance for this matter's sub-ledger (r 47): prior movements
  -- plus this entry; a matter ledger must never go into deficit.
  IF v_balance_field_id IS NOT NULL AND v_matter_field_id IS NOT NULL AND v_matter_id IS NOT NULL THEN
    SELECT COALESCE(SUM(COALESCE(vin.value_number, 0) - COALESCE(vout.value_number, 0)), 0) INTO v_prior
    FROM company_table_records r
    JOIN company_table_values vm ON vm.record_id = r.id AND vm.field_id = v_matter_field_id AND vm.value_record_id = v_matter_id
    LEFT JOIN company_table_values va   ON va.record_id   = r.id AND va.field_id   = v_account_field_id
    LEFT JOIN company_table_values vin  ON vin.record_id  = r.id AND vin.field_id  = v_in_field_id
    LEFT JOIN company_table_values vout ON vout.record_id = r.id AND vout.field_id = v_out_field_id
    WHERE r.table_id = p_table_id AND r.deleted_at IS NULL
      AND (
        v_account_field_id IS NULL
        OR va.value_record_id IS NOT DISTINCT FROM v_account_id
        OR (va.value_record_id IS NULL AND v_active_account_count <= 1)
      );

    v_balance := v_prior + v_amount_in - v_amount_out;
    IF v_balance < 0 THEN
      RAISE EXCEPTION 'LEDGER_OVERDRAW: this withdrawal would overdraw the matter''s trust ledger (balance %, withdrawal %)', v_prior, v_amount_out;
    END IF;
    p_values := p_values || jsonb_build_object('running_balance', v_balance);
  END IF;

  IF v_num_field.id IS NOT NULL AND COALESCE(p_values->>v_num_field.field_key, '') = '' THEN
    v_number := next_field_sequence(v_num_field.id);
    p_values := p_values || jsonb_build_object(v_num_field.field_key, v_number);
  END IF;

  INSERT INTO company_table_records (table_id, company_id, created_by)
    VALUES (p_table_id, v_table.company_id, p_actor)
    RETURNING id INTO v_record_id;

  FOR v_fld IN SELECT * FROM company_table_fields WHERE table_id = p_table_id AND deleted_at IS NULL LOOP
    v_val := p_values->>v_fld.field_key;
    IF v_val IS NULL OR v_val = '' THEN CONTINUE; END IF;
    IF v_fld.field_type IN ('number', 'currency') THEN
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_number)
        VALUES (v_table.company_id, p_table_id, v_record_id, v_fld.id, v_val::numeric);
    ELSIF v_fld.field_type = 'date' THEN
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_date)
        VALUES (v_table.company_id, p_table_id, v_record_id, v_fld.id, v_val::date);
    ELSIF v_fld.field_type = 'boolean' THEN
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_boolean)
        VALUES (v_table.company_id, p_table_id, v_record_id, v_fld.id, v_val::boolean);
    ELSIF v_fld.field_type IN ('property', 'entity', 'project', 'table_relation') THEN
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_record_id)
        VALUES (v_table.company_id, p_table_id, v_record_id, v_fld.id, v_val::uuid);
    ELSE
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
        VALUES (v_table.company_id, p_table_id, v_record_id, v_fld.id, v_val);
    END IF;
  END LOOP;

  INSERT INTO company_table_record_log (company_id, table_id, record_id, actor_id, action, after)
    VALUES (v_table.company_id, p_table_id, v_record_id, p_actor, 'insert', p_values);

  RETURN jsonb_build_object('id', v_record_id, 'number', v_number, 'running_balance', v_balance);
END;
$$;
