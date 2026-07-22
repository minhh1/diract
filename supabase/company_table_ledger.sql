-- Ledger tables: append-only custom tables for statutory records (the Law
-- Firm template's Trust Transactions -- see template_law_firm_seed.sql).
-- Uniform General Rules 2015 r 40 requires trust records be kept in a form
-- that cannot be easily altered, so the guarantees live in DB triggers, not
-- just the UI:
--   - rows and values can never be UPDATEd or DELETEd (soft or hard) --
--     corrections are made by entering a reversing journal entry;
--   - rows can only be INSERTed through insert_ledger_record(), which
--     atomically assigns the consecutive receipt number (r 36), computes the
--     per-matter running balance (r 47), refuses inserts that would overdraw
--     a matter's ledger, and writes an audit row to company_table_record_log.
-- Depends on company_table_field_sequences.sql (auto_number_prefix + counter).

ALTER TABLE company_tables ADD COLUMN IF NOT EXISTS is_ledger boolean NOT NULL DEFAULT false;

-- Audit trail (shape follows task_activity_log.sql). Insert-only: RLS gives
-- members SELECT; there are no INSERT/UPDATE/DELETE policies, so clients
-- cannot write or tamper -- rows are written by the SECURITY DEFINER
-- insert_ledger_record() only. record_id has no FK on purpose: the log must
-- outlive anything that might ever remove the record row.
CREATE TABLE IF NOT EXISTS company_table_record_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  table_id uuid NOT NULL,
  record_id uuid NOT NULL,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_table_record_log_table_idx ON company_table_record_log (table_id, created_at);

ALTER TABLE company_table_record_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_table_record_log_read ON company_table_record_log;
CREATE POLICY company_table_record_log_read ON company_table_record_log
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- ── Guards ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION is_ledger_table(p_table_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT COALESCE((SELECT is_ledger FROM company_tables WHERE id = p_table_id), false) $$;

-- Inserts are only allowed from inside insert_ledger_record(), which sets a
-- transaction-local flag; direct client inserts (or the ordinary
-- createRecord path) are refused so nothing can bypass numbering/balance/audit.
CREATE OR REPLACE FUNCTION guard_ledger_records()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF is_ledger_table(NEW.table_id)
       AND current_setting('app.ledger_write', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'LEDGER_RPC_ONLY: ledger rows must be created via insert_ledger_record()';
    END IF;
    RETURN NEW;
  END IF;
  IF is_ledger_table(OLD.table_id) THEN
    RAISE EXCEPTION 'LEDGER_APPEND_ONLY: ledger entries cannot be changed or deleted -- enter a reversing journal entry instead';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_ledger_records_trg ON company_table_records;
CREATE TRIGGER guard_ledger_records_trg
  BEFORE INSERT OR UPDATE OR DELETE ON company_table_records
  FOR EACH ROW EXECUTE FUNCTION guard_ledger_records();

DROP TRIGGER IF EXISTS guard_ledger_values_trg ON company_table_values;
CREATE TRIGGER guard_ledger_values_trg
  BEFORE INSERT OR UPDATE OR DELETE ON company_table_values
  FOR EACH ROW EXECUTE FUNCTION guard_ledger_records();

-- ── Insert ───────────────────────────────────────────────────────────────
--
-- p_values is a field_key -> value jsonb map (same shape createRecord takes).
-- Ledger conventions, resolved by field_key when present on the table:
--   amount_in / amount_out  -- currency movements (both optional per row)
--   matter                  -- the sub-ledger key; running balance and the
--                              overdraw check are scoped to this value
--   running_balance         -- written by this function, never by the caller
--   one auto_number_prefix field -- assigned by this function (r 36)
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
  v_matter_id uuid;
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
  SELECT * INTO v_num_field FROM company_table_fields
    WHERE table_id = p_table_id AND auto_number_prefix IS NOT NULL AND deleted_at IS NULL LIMIT 1;

  v_amount_in  := COALESCE(NULLIF(p_values->>'amount_in',  '')::numeric, 0);
  v_amount_out := COALESCE(NULLIF(p_values->>'amount_out', '')::numeric, 0);
  IF v_amount_in < 0 OR v_amount_out < 0 THEN
    RAISE EXCEPTION 'LEDGER_NEGATIVE_AMOUNT: amounts must be entered as positive values';
  END IF;
  v_matter_id := NULLIF(p_values->>'matter', '')::uuid;

  -- Running balance for this matter's sub-ledger (r 47): prior movements
  -- plus this entry; a matter ledger must never go into deficit.
  IF v_balance_field_id IS NOT NULL AND v_matter_field_id IS NOT NULL AND v_matter_id IS NOT NULL THEN
    SELECT COALESCE(SUM(COALESCE(vin.value_number, 0) - COALESCE(vout.value_number, 0)), 0) INTO v_prior
    FROM company_table_records r
    JOIN company_table_values vm ON vm.record_id = r.id AND vm.field_id = v_matter_field_id AND vm.value_record_id = v_matter_id
    LEFT JOIN company_table_values vin  ON vin.record_id  = r.id AND vin.field_id  = v_in_field_id
    LEFT JOIN company_table_values vout ON vout.record_id = r.id AND vout.field_id = v_out_field_id
    WHERE r.table_id = p_table_id AND r.deleted_at IS NULL;

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
