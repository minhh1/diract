SET request.jwt.claim.role = 'service_role';

-- Payroll data model for Niksen (the one real company this is being built
-- against for testing -- see the "Run Pay" page/API for where the actual
-- PAYG/super calculation lives, none of it in this file): Pay Runs and
-- Payslips as new custom tables, Timesheets feeding into them, and payroll
-- fields added onto the existing `entities` "Staff" concept rather than a
-- new Employees table (entities already has linked_profile_id/
-- default_hourly_rate/entity_type='Staff', the same identity Time & Fee
-- Entries already uses for "who did the work").
--
-- Payslips is a ledger table (is_ledger=true) purely for its append-only +
-- auto-numbering guarantees -- the running-balance/overdraw machinery in
-- insert_ledger_record() only activates for the exact field_keys matter/
-- amount_in/amount_out/trust_account, none of which exist here, so it's a
-- clean no-op; a payslip just can never be edited or deleted once issued,
-- and gets a real "PS-2026-000001" style number for free.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d'; -- Niksen Time Pty Ltd
  v_payruns_id uuid;
  v_timesheets_id uuid;
  v_payslips_id uuid;
BEGIN
  -- ── Pay Runs ──────────────────────────────────────────────────────────
  SELECT id INTO v_payruns_id FROM company_tables WHERE company_id = v_company_id AND slug = 'pay-runs' AND deleted_at IS NULL;
  IF v_payruns_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Pay Runs', 'pay-runs', 'Wallet', '#0891b2', 'period_start')
    RETURNING id INTO v_payruns_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, select_options, default_value, is_required, show_in_table, display_order)
  SELECT v_company_id, v_payruns_id, v.field_key, v.label, v.field_type, v.select_options, v.default_value, v.is_required, true, v.ord
  FROM (VALUES
    ('period_start',       'Period Start',        'date',     NULL::jsonb, NULL::text, true,  0),
    ('period_end',         'Period End',          'date',     NULL::jsonb, NULL::text, true,  1),
    ('status',             'Status',              'select',   to_jsonb(ARRAY['Draft','Processed','Finalized']), 'Draft', false, 2),
    ('processed_at',       'Processed At',        'date',     NULL::jsonb, NULL::text, false, 3),
    ('total_gross',        'Total Gross',         'currency', NULL::jsonb, NULL::text, false, 4),
    ('total_tax_withheld', 'Total Tax Withheld',  'currency', NULL::jsonb, NULL::text, false, 5),
    ('total_super',        'Total Super',         'currency', NULL::jsonb, NULL::text, false, 6),
    ('employee_count',     'Employee Count',      'number',   NULL::jsonb, NULL::text, false, 7)
  ) AS v(field_key, label, field_type, select_options, default_value, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_payruns_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── Timesheets ───────────────────────────────────────────────────────
  SELECT id INTO v_timesheets_id FROM company_tables WHERE company_id = v_company_id AND slug = 'timesheets' AND deleted_at IS NULL;
  IF v_timesheets_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Timesheets', 'timesheets', 'Clock', '#7c3aed', 'date')
    RETURNING id INTO v_timesheets_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, select_options, default_value, linked_system_table, linked_table_id, linked_display_field, is_required, show_in_table, display_order)
  SELECT v_company_id, v_timesheets_id, v.field_key, v.label, v.field_type, v.select_options, v.default_value, v.linked_system_table, v.linked_table_id, v.linked_display_field, v.is_required, true, v.ord
  FROM (VALUES
    ('employee',     'Employee',      'entity',         NULL::jsonb, NULL::text, 'entities'::text, NULL::uuid,   'name'::text, true,  0),
    ('date',         'Date',          'date',           NULL::jsonb, NULL::text, NULL::text,       NULL::uuid,   NULL::text,   true,  1),
    ('hours_worked', 'Hours Worked',  'number',         NULL::jsonb, NULL::text, NULL::text,        NULL::uuid,   NULL::text,   true,  2),
    ('notes',        'Notes',         'text',           NULL::jsonb, NULL::text, NULL::text,        NULL::uuid,   NULL::text,   false, 3),
    ('status',       'Status',        'select',         to_jsonb(ARRAY['Draft','Submitted','Paid']), 'Draft', NULL::text, NULL::uuid, NULL::text, false, 4),
    ('pay_run',      'Pay Run',       'table_relation', NULL::jsonb, NULL::text, NULL::text,        v_payruns_id, 'period_start'::text, false, 5)
  ) AS v(field_key, label, field_type, select_options, default_value, linked_system_table, linked_table_id, linked_display_field, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_timesheets_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── Payslips (ledger -- append-only + auto-numbered) ────────────────
  SELECT id INTO v_payslips_id FROM company_tables WHERE company_id = v_company_id AND slug = 'payslips' AND deleted_at IS NULL;
  IF v_payslips_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key, is_ledger, disable_record_dashboard)
    VALUES (v_company_id, 'Payslips', 'payslips', 'Receipt', '#0891b2', 'payslip_number', true, true)
    RETURNING id INTO v_payslips_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, select_options, linked_system_table, linked_table_id, linked_display_field, is_required, show_in_table, display_order, auto_number_prefix, auto_number_pad)
  SELECT v_company_id, v_payslips_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_table_id, v.linked_display_field, v.is_required, true, v.ord, v.auto_number_prefix, v.auto_number_pad
  FROM (VALUES
    ('payslip_number',    'Payslip Number',    'text',           NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   false, 0, 'PS-{YYYY}-'::text, 6),
    ('employee',          'Employee',          'entity',         NULL::jsonb, 'entities'::text, NULL::uuid,   'name'::text, true,  1, NULL::text, NULL::int),
    ('pay_run',           'Pay Run',           'table_relation', NULL::jsonb, NULL::text,       v_payruns_id, 'period_start'::text, true, 2, NULL::text, NULL::int),
    ('period_start',      'Period Start',      'date',           NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   true,  3, NULL::text, NULL::int),
    ('period_end',        'Period End',        'date',           NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   true,  4, NULL::text, NULL::int),
    ('hours',             'Hours',             'number',         NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   false, 5, NULL::text, NULL::int),
    ('gross_pay',         'Gross Pay',         'currency',       NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   true,  6, NULL::text, NULL::int),
    ('tax_withheld',      'Tax Withheld',      'currency',       NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   true,  7, NULL::text, NULL::int),
    ('super_amount',      'Super Amount',      'currency',       NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   true,  8, NULL::text, NULL::int),
    ('net_pay',           'Net Pay',           'currency',       NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   true,  9, NULL::text, NULL::int),
    ('ytd_gross',         'YTD Gross',         'currency',       NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   false, 10, NULL::text, NULL::int),
    ('ytd_tax_withheld',  'YTD Tax Withheld',  'currency',       NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   false, 11, NULL::text, NULL::int),
    ('ytd_super',         'YTD Super',         'currency',       NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   false, 12, NULL::text, NULL::int),
    ('issued_date',       'Issued Date',       'date',           NULL::jsonb, NULL::text,       NULL::uuid,   NULL::text,   false, 13, NULL::text, NULL::int)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_table_id, linked_display_field, is_required, ord, auto_number_prefix, auto_number_pad)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_payslips_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── Payroll fields on entities (the existing "Staff" concept) ───────
  INSERT INTO company_custom_fields (company_id, table_name, field_key, label, field_type, select_options, section_name, display_order)
  SELECT v_company_id, 'entities', v.field_key, v.label, v.field_type, v.select_options, 'Payroll'::text, v.ord
  FROM (VALUES
    ('tax_file_number',           'Tax File Number',            'text',    NULL::jsonb, 0),
    ('employment_type',           'Employment Type',            'select',  to_jsonb(ARRAY['Full-time','Part-time','Casual']), 1),
    ('tax_free_threshold_claimed','Tax-Free Threshold Claimed', 'boolean', NULL::jsonb, 2),
    ('has_help_debt',             'Has HELP/HECS Debt',         'boolean', NULL::jsonb, 3),
    ('super_fund_name',           'Super Fund Name',            'text',    NULL::jsonb, 4),
    ('super_fund_usi',            'Super Fund USI',             'text',    NULL::jsonb, 5),
    ('super_member_number',       'Super Member Number',        'text',    NULL::jsonb, 6),
    ('bank_bsb',                  'Bank BSB',                   'text',    NULL::jsonb, 7),
    ('bank_account_number',       'Bank Account Number',        'text',    NULL::jsonb, 8),
    ('bank_account_name',         'Bank Account Name',          'text',    NULL::jsonb, 9)
  ) AS v(field_key, label, field_type, select_options, ord)
  WHERE NOT EXISTS (
    SELECT 1 FROM company_custom_fields x
    WHERE x.company_id = v_company_id AND x.table_name = 'entities' AND x.field_key = v.field_key AND x.deleted_at IS NULL
  );
END $$;
