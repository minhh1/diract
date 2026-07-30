-- Trust Account overhaul: multi-account support, protected funds, bank
-- reconciliation and an operating-side credit ledger -- backing a new
-- bespoke /dashboard/trust-account page (not the generic dashboard-widget
-- system). Extends the EXISTING Trust Transactions ledger table with a few
-- new fields rather than duplicating it; every new table here is additive,
-- following the same guarded-insert/idempotent shape as the Receipts ledger
-- (supabase/migrations/20260730120000_receipts_ledger.sql).
DO $$
DECLARE
  v_template_id uuid;
  v_trust_table_id uuid;
  v_invoices_table_id uuid;
  v_accounts_table_id uuid;
  v_protected_table_id uuid;
  v_recon_table_id uuid;
  v_credits_table_id uuid;
  v_install RECORD;
  v_member_id uuid;
BEGIN
  SELECT id INTO v_template_id FROM template_definitions WHERE name = 'Law Firm';
  IF v_template_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_trust_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-transactions';
  SELECT id INTO v_invoices_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'invoices';

  -- ── Trust Accounts (multiple bank accounts per firm) ──────────────────
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'trust-accounts', 'Trust Accounts', 'Landmark', '#0f766e', 'account_name', 7
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-accounts');

  SELECT id INTO v_accounts_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-accounts';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, display_order)
  SELECT v_accounts_table_id, v.field_key, v.label, v.field_type, v.select_options, v.display_order
  FROM (VALUES
    ('account_name',   'Account Name',   'text',    NULL::jsonb, 0),
    ('bsb',            'BSB',            'text',    NULL::jsonb, 1),
    ('account_number', 'Account Number', 'text',    NULL::jsonb, 2),
    ('is_active',      'Active',         'boolean', NULL::jsonb, 3)
  ) AS v(field_key, label, field_type, select_options, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_accounts_table_id AND field_key = v.field_key
  );

  -- ── Trust Transactions: account/payment-method/cheque fields ──────────
  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_template_table_id, linked_display_field, display_order)
  SELECT v_trust_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('trust_account',  'Trust Account',  'table_relation', NULL::jsonb, v_accounts_table_id, 'account_name'::text, 13),
    ('payment_method', 'Payment Method', 'select', to_jsonb(ARRAY['Bank Transfer','Cash','Cheque','Credit Card']), NULL::uuid, NULL::text, 14)
  ) AS v(field_key, label, field_type, select_options, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = v.field_key
  );

  -- cheque_number: a SECOND auto-numbered field on Trust Transactions.
  -- insert_ledger_record() only auto-fills the one field with
  -- auto_number_prefix set that it finds first (its own LIMIT 1) -- this
  -- one is assigned explicitly by the Print Cheques action calling
  -- next_field_sequence(field_id) itself before the ledger insert, which
  -- works for any field with auto_number_prefix regardless of ledger
  -- context (see supabase/company_table_field_sequences.sql).
  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, display_order, auto_number_prefix, help_text)
  SELECT v_trust_table_id, 'cheque_number', 'Cheque No.', 'text', 15, 'CHQ-', 'Assigned automatically when printing a trust cheque -- leave blank'
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = 'cheque_number');

  -- ── Trust Protected Funds (a hold, not a ledger movement) ──────────────
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'trust-protected-funds', 'Trust Protected Funds', 'ShieldCheck', '#b45309', 'matter', 8
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-protected-funds');

  SELECT id INTO v_protected_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-protected-funds';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_protected_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('matter',          'Matter',         'project',  NULL::jsonb, 'projects'::text, NULL::uuid,          'name'::text, 0),
    ('trust_account',   'Trust Account',  'table_relation', NULL::jsonb, NULL::text, v_accounts_table_id, 'account_name'::text, 1),
    ('amount',          'Amount',         'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 2),
    ('reason',          'Reason',         'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 3),
    ('date_protected',  'Date Protected', 'date',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 4),
    ('released_at',     'Released',       'date',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 5),
    ('released_reason', 'Release Reason', 'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 6)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_protected_table_id AND field_key = v.field_key
  );

  -- ── Bank Reconciliations ────────────────────────────────────────────────
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'bank-reconciliations', 'Bank Reconciliations', 'ClipboardCheck', '#0f766e', 'period_start', 9
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'bank-reconciliations');

  SELECT id INTO v_recon_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'bank-reconciliations';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_template_table_id, linked_display_field, display_order)
  SELECT v_recon_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('trust_account',          'Trust Account',           'table_relation', NULL::jsonb, v_accounts_table_id, 'account_name'::text, 0),
    ('period_start',           'Period Start',             'date',     NULL::jsonb, NULL::uuid, NULL::text, 1),
    ('period_end',              'Period End',               'date',     NULL::jsonb, NULL::uuid, NULL::text, 2),
    ('status',                  'Status',                   'select',   to_jsonb(ARRAY['Draft','Reconciled']), NULL::uuid, NULL::text, 3),
    ('bank_statement_balance',  'Bank Statement Balance',   'currency', NULL::jsonb, NULL::uuid, NULL::text, 4),
    ('prepared_by',             'Prepared By',              'text',     NULL::jsonb, NULL::uuid, NULL::text, 5),
    ('prepared_at',             'Date Of Preparation',      'date',     NULL::jsonb, NULL::uuid, NULL::text, 6),
    ('reviewed_by',             'Reviewed By',              'text',     NULL::jsonb, NULL::uuid, NULL::text, 7),
    ('reviewed_at',             'Review Date',              'date',     NULL::jsonb, NULL::uuid, NULL::text, 8)
  ) AS v(field_key, label, field_type, select_options, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_recon_table_id AND field_key = v.field_key
  );

  -- Trust Transactions -> which reconciliation cleared this row (nullable;
  -- set once, by the Bank Reconciliation checklist). Declared after Bank
  -- Reconciliations exists so the relation can target it.
  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, linked_template_table_id, linked_display_field, display_order)
  SELECT v_trust_table_id, 'reconciled_in', 'Reconciled In', 'table_relation', v_recon_table_id, 'period_start', 16
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = 'reconciled_in');

  -- ── Client Credits (operating-side ledger -- NOT trust; client credit
  -- balances / overpayments against invoices, entirely separate account) ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger)
  SELECT v_template_id, 'client-credits', 'Client Credits', 'BadgePercent', '#0891b2', 'credit_number', 10, true
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'client-credits');

  SELECT id INTO v_credits_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'client-credits';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  SELECT v_credits_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order, v.auto_number_prefix, v.help_text
  FROM (VALUES
    ('credit_number',   'Credit No.',     'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 0, 'CR-'::text, 'Assigned automatically in consecutive sequence -- leave blank'::text),
    ('date',            'Date',           'date',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 1, NULL, NULL),
    ('matter',          'Matter',         'project',  NULL::jsonb, 'projects'::text, NULL::uuid,          'name'::text, 2, NULL, NULL),
    ('client',          'Contact',        'entity',   NULL::jsonb, 'entities'::text, NULL::uuid,          'name'::text, 3, NULL, NULL),
    ('description',     'Description',    'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 4, NULL, NULL),
    ('amount_in',       'Credit Issued',  'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 5, NULL, NULL),
    ('amount_out',      'Credit Applied', 'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 6, NULL, NULL),
    ('invoice',         'Invoice',        'table_relation', NULL::jsonb, NULL::text, v_invoices_table_id, 'invoice_number'::text, 7, NULL, NULL),
    ('running_balance', 'Balance',        'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 8, NULL, 'Running balance -- computed automatically')
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_credits_table_id AND field_key = v.field_key
  );

  -- ── Retire the old generic "Trust Account" dashboard ──────────────────
  -- Superseded by the bespoke /dashboard/trust-account page. Removing it
  -- from the catalog stops fresh installs from getting it; each already-
  -- installed company's own copy is soft-deleted below (same mechanism
  -- Sidebar.tsx's own delete-dashboard button uses), which drops it from
  -- the sidebar immediately -- that list is a live, unfiltered read of
  -- company_dashboards WHERE deleted_at IS NULL.
  DELETE FROM template_definition_dashboards WHERE template_id = v_template_id AND slug = 'trust-account';

  -- ── Roll out to every company that installed this template ───────────
  -- Same impersonation trick as supabase/migrations/20260730120000_receipts_ledger.sql:
  -- upgrade_company_template() checks auth.uid() is a member of the target
  -- company, which a migration has none of by default.
  FOR v_install IN SELECT company_id FROM company_template_installs WHERE template_id = v_template_id LOOP
    SELECT user_id INTO v_member_id FROM company_memberships WHERE company_id = v_install.company_id LIMIT 1;
    CONTINUE WHEN v_member_id IS NULL;

    -- This adds 4 new custom tables; check_custom_table_limit() (a
    -- per-company subscription-tier trigger on company_tables) would
    -- otherwise block companies already near companies.max_custom_tables
    -- (confirmed live: Huynh Lawyers had 9/10). Raised specifically for
    -- companies on this template, not globally.
    UPDATE companies SET max_custom_tables = 20
      WHERE id = v_install.company_id AND max_custom_tables < 20;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_member_id)::text, true);
    PERFORM upgrade_company_template(v_install.company_id, v_template_id);
    UPDATE company_dashboards SET deleted_at = now()
      WHERE company_id = v_install.company_id AND slug = 'trust-account' AND deleted_at IS NULL;
  END LOOP;
END $$;

-- ── insert_ledger_record(): scope the per-matter running balance/overdraw
-- check by trust_account too, when the ledger table has that field ──
-- Without this, two trust accounts both posting entries against the same
-- matter would have their balances summed into one pool -- a real
-- correctness bug once multi-account support exists. Purely additive: a
-- ledger table with no trust_account field (Receipts, and any row from
-- before this migration) is completely unaffected, since the extra
-- condition below only engages when v_account_field_id is found.
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

  PERFORM pg_advisory_xact_lock(hashtext(p_table_id::text));
  PERFORM set_config('app.ledger_write', 'on', true);

  SELECT id INTO v_in_field_id      FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'amount_in'       AND deleted_at IS NULL;
  SELECT id INTO v_out_field_id     FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'amount_out'      AND deleted_at IS NULL;
  SELECT id INTO v_matter_field_id  FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'matter'          AND deleted_at IS NULL;
  SELECT id INTO v_balance_field_id FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'running_balance' AND deleted_at IS NULL;
  SELECT id INTO v_account_field_id FROM company_table_fields WHERE table_id = p_table_id AND field_key = 'trust_account'   AND deleted_at IS NULL;
  SELECT * INTO v_num_field FROM company_table_fields
    WHERE table_id = p_table_id AND auto_number_prefix IS NOT NULL AND deleted_at IS NULL LIMIT 1;

  v_amount_in  := COALESCE(NULLIF(p_values->>'amount_in',  '')::numeric, 0);
  v_amount_out := COALESCE(NULLIF(p_values->>'amount_out', '')::numeric, 0);
  IF v_amount_in < 0 OR v_amount_out < 0 THEN
    RAISE EXCEPTION 'LEDGER_NEGATIVE_AMOUNT: amounts must be entered as positive values';
  END IF;
  v_matter_id := NULLIF(p_values->>'matter', '')::uuid;
  v_account_id := NULLIF(p_values->>'trust_account', '')::uuid;

  IF v_balance_field_id IS NOT NULL AND v_matter_field_id IS NOT NULL AND v_matter_id IS NOT NULL THEN
    SELECT COALESCE(SUM(COALESCE(vin.value_number, 0) - COALESCE(vout.value_number, 0)), 0) INTO v_prior
    FROM company_table_records r
    JOIN company_table_values vm ON vm.record_id = r.id AND vm.field_id = v_matter_field_id AND vm.value_record_id = v_matter_id
    LEFT JOIN company_table_values va   ON va.record_id   = r.id AND va.field_id   = v_account_field_id
    LEFT JOIN company_table_values vin  ON vin.record_id  = r.id AND vin.field_id  = v_in_field_id
    LEFT JOIN company_table_values vout ON vout.record_id = r.id AND vout.field_id = v_out_field_id
    WHERE r.table_id = p_table_id AND r.deleted_at IS NULL
      AND (v_account_field_id IS NULL OR va.value_record_id IS NOT DISTINCT FROM v_account_id);

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
