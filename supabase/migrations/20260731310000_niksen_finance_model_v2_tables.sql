SET request.jwt.claim.role = 'service_role';

-- Finance Model v2: replaces the entity-scoped finance_model_budget_lines
-- system table (dropped in the next migration, confirmed empty in
-- production) with project-scoped custom tables, plus new tables for a
-- persisted transactions ledger, auto-classify rules, and a loan
-- repayments calculator. All Niksen-only (32d4fb0e-007d-41e7-bc5e-
-- 638163c28e3d) -- per explicit instruction this whole feature lives in
-- the custom-table system (company_tables/company_table_fields), not new
-- bespoke SQL tables. Niksen has 2 custom tables today (Irregularities,
-- Contacts); this adds 6 more (8/10, under max_custom_tables=10, no bump
-- needed).
--
-- Table creation order matters: Budget Lines and Loans must exist before
-- the tables that relation-link back to them (Transactions/Classification
-- Rules -> Budget Lines; Loan Interest Rates/Loan Phases -> Loans).

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_budget_lines_id uuid;
  v_transactions_id uuid;
  v_rules_id uuid;
  v_loans_id uuid;
  v_loan_rates_id uuid;
  v_loan_phases_id uuid;
BEGIN
  -- ── 1. Finance Model Budget Lines ──────────────────────────────────────
  SELECT id INTO v_budget_lines_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-budget-lines' AND deleted_at IS NULL;
  IF v_budget_lines_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Budget Lines', 'finance-model-budget-lines', 'Wallet', '#6366f1', 'label')
    RETURNING id INTO v_budget_lines_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_display_field, select_options, is_required, show_in_table, display_order)
  SELECT v_company_id, v_budget_lines_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_display_field, v.select_options, v.is_required, true, v.ord
  FROM (VALUES
    ('project', 'Project', 'project', 'projects', 'name', NULL::jsonb, true, 0),
    ('category', 'Category', 'select', NULL, NULL, '["Acquisition","Construction","Professional Fees","Finance Costs","Contingency","Revenue","Other"]'::jsonb, false, 1),
    ('label', 'Label', 'text', NULL, NULL, NULL::jsonb, false, 2),
    ('budgeted_amount', 'Budgeted Amount', 'currency', NULL, NULL, NULL::jsonb, false, 3),
    ('xero_account_code', 'Xero Account Code', 'text', NULL, NULL, NULL::jsonb, false, 4),
    ('display_order', 'Display Order', 'number', NULL, NULL, NULL::jsonb, false, 5)
  ) AS v(field_key, label, field_type, linked_system_table, linked_display_field, select_options, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_budget_lines_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── 2. Finance Model Transactions ──────────────────────────────────────
  SELECT id INTO v_transactions_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-transactions' AND deleted_at IS NULL;
  IF v_transactions_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Transactions', 'finance-model-transactions', 'Receipt', '#0ea5e9', 'reference')
    RETURNING id INTO v_transactions_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_table_id, linked_display_field, select_options, is_required, show_in_table, display_order)
  SELECT v_company_id, v_transactions_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_table_id, v.linked_display_field, v.select_options, v.is_required, true, v.ord
  FROM (VALUES
    ('project', 'Project', 'project', 'projects', NULL::uuid, 'name', NULL::jsonb, true, 0),
    ('date', 'Date', 'date', NULL, NULL::uuid, NULL, NULL::jsonb, false, 1),
    ('type', 'Type', 'select', NULL, NULL::uuid, NULL, '["Income","Expense"]'::jsonb, false, 2),
    ('contact', 'Contact', 'text', NULL, NULL::uuid, NULL, NULL::jsonb, false, 3),
    ('reference', 'Reference', 'text', NULL, NULL::uuid, NULL, NULL::jsonb, false, 4),
    ('amount', 'Amount', 'currency', NULL, NULL::uuid, NULL, NULL::jsonb, false, 5),
    ('budget_line', 'Budget Line', 'table_relation', NULL, v_budget_lines_id, 'label', NULL::jsonb, false, 6),
    ('source', 'Source', 'select', NULL, NULL::uuid, NULL, '["Manual","Xero"]'::jsonb, false, 7),
    ('xero_transaction_id', 'Xero Transaction ID', 'text', NULL, NULL::uuid, NULL, NULL::jsonb, false, 8)
  ) AS v(field_key, label, field_type, linked_system_table, linked_table_id, linked_display_field, select_options, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_transactions_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── 3. Finance Model Classification Rules ──────────────────────────────
  SELECT id INTO v_rules_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-classification-rules' AND deleted_at IS NULL;
  IF v_rules_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Classification Rules', 'finance-model-classification-rules', 'Filter', '#8b5cf6', 'match_value')
    RETURNING id INTO v_rules_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_table_id, linked_display_field, select_options, is_required, show_in_table, display_order)
  SELECT v_company_id, v_rules_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_table_id, v.linked_display_field, v.select_options, v.is_required, true, v.ord
  FROM (VALUES
    ('project', 'Project', 'project', 'projects', NULL::uuid, 'name', NULL::jsonb, false, 0),
    ('match_field', 'Match Field', 'select', NULL, NULL::uuid, NULL, '["Contact","Reference"]'::jsonb, false, 1),
    ('match_type', 'Match Type', 'select', NULL, NULL::uuid, NULL, '["Equals","Contains","Starts With"]'::jsonb, false, 2),
    ('match_value', 'Match Value', 'text', NULL, NULL::uuid, NULL, NULL::jsonb, false, 3),
    ('budget_line', 'Budget Line', 'table_relation', NULL, v_budget_lines_id, 'label', NULL::jsonb, false, 4),
    ('display_order', 'Display Order', 'number', NULL, NULL::uuid, NULL, NULL::jsonb, false, 5),
    ('is_active', 'Is Active', 'boolean', NULL, NULL::uuid, NULL, NULL::jsonb, false, 6)
  ) AS v(field_key, label, field_type, linked_system_table, linked_table_id, linked_display_field, select_options, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_rules_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── 4. Loans ────────────────────────────────────────────────────────────
  SELECT id INTO v_loans_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-loans' AND deleted_at IS NULL;
  IF v_loans_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Loans', 'finance-model-loans', 'Landmark', '#f59e0b', 'name')
    RETURNING id INTO v_loans_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_system_table, linked_display_field, select_options, is_required, allow_multiple, show_in_table, display_order)
  SELECT v_company_id, v_loans_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_display_field, v.select_options, v.is_required, v.allow_multiple, true, v.ord
  FROM (VALUES
    ('project', 'Project', 'project', 'projects', 'name', NULL::jsonb, true, false, 0),
    ('name', 'Name', 'text', NULL, NULL, NULL::jsonb, false, false, 1),
    ('lender_type', 'Lender Type', 'select', NULL, NULL, '["Senior","Mezzanine","Money Partner","Other"]'::jsonb, false, false, 2),
    ('borrower', 'Borrower', 'entity', 'entities', 'name', NULL::jsonb, true, false, 3),
    ('guarantors', 'Guarantors', 'entity', 'entities', 'name', NULL::jsonb, false, true, 4),
    ('principal_amount', 'Principal Amount', 'currency', NULL, NULL, NULL::jsonb, false, false, 5),
    ('start_date', 'Start Date', 'date', NULL, NULL, NULL::jsonb, false, false, 6),
    ('repayment_date', 'Repayment Date', 'date', NULL, NULL, NULL::jsonb, false, false, 7),
    ('repayment_period', 'Repayment Period', 'select', NULL, NULL, '["Monthly","Six-Monthly","At End of Term"]'::jsonb, false, false, 8),
    ('extension_right', 'Extension Right', 'boolean', NULL, NULL, NULL::jsonb, false, false, 9),
    ('extension_terms', 'Extension Terms', 'text', NULL, NULL, NULL::jsonb, false, false, 10),
    ('early_repayment_allowed', 'Early Repayment Allowed', 'boolean', NULL, NULL, NULL::jsonb, false, false, 11),
    ('early_repayment_terms', 'Early Repayment Terms', 'text', NULL, NULL, NULL::jsonb, false, false, 12),
    ('security', 'Security', 'text', NULL, NULL, NULL::jsonb, false, false, 13),
    ('notes', 'Notes', 'text', NULL, NULL, NULL::jsonb, false, false, 14)
  ) AS v(field_key, label, field_type, linked_system_table, linked_display_field, select_options, is_required, allow_multiple, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_loans_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── 5. Loan Interest Rates ──────────────────────────────────────────────
  SELECT id INTO v_loan_rates_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-loan-interest-rates' AND deleted_at IS NULL;
  IF v_loan_rates_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Loan Interest Rates', 'finance-model-loan-interest-rates', 'Percent', '#f59e0b', 'loan')
    RETURNING id INTO v_loan_rates_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_table_id, linked_display_field, is_required, show_in_table, display_order)
  SELECT v_company_id, v_loan_rates_id, v.field_key, v.label, v.field_type, v.linked_table_id, v.linked_display_field, v.is_required, true, v.ord
  FROM (VALUES
    ('loan', 'Loan', 'table_relation', v_loans_id, 'name', true, 0),
    ('effective_date', 'Effective Date', 'date', NULL::uuid, NULL, false, 1),
    ('interest_rate_pa', 'Interest Rate (% p.a.)', 'number', NULL::uuid, NULL, false, 2)
  ) AS v(field_key, label, field_type, linked_table_id, linked_display_field, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_loan_rates_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- ── 6. Loan Phases ──────────────────────────────────────────────────────
  SELECT id INTO v_loan_phases_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-loan-phases' AND deleted_at IS NULL;
  IF v_loan_phases_id IS NULL THEN
    INSERT INTO company_tables (company_id, name, slug, icon, color, primary_field_key)
    VALUES (v_company_id, 'Finance Model Loan Phases', 'finance-model-loan-phases', 'CalendarRange', '#f59e0b', 'loan')
    RETURNING id INTO v_loan_phases_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, linked_table_id, linked_display_field, select_options, is_required, show_in_table, display_order)
  SELECT v_company_id, v_loan_phases_id, v.field_key, v.label, v.field_type, v.linked_table_id, v.linked_display_field, v.select_options, v.is_required, true, v.ord
  FROM (VALUES
    ('loan', 'Loan', 'table_relation', v_loans_id, 'name', NULL::jsonb, true, 0),
    ('phase_order', 'Phase Order', 'number', NULL::uuid, NULL, NULL::jsonb, false, 1),
    ('repayment_type', 'Repayment Type', 'select', NULL::uuid, NULL, '["Interest Only","Amortizing"]'::jsonb, false, 2),
    ('start_date', 'Start Date', 'date', NULL::uuid, NULL, NULL::jsonb, false, 3),
    ('end_date', 'End Date', 'date', NULL::uuid, NULL, NULL::jsonb, false, 4),
    ('payment_frequency', 'Payment Frequency', 'select', NULL::uuid, NULL, '["Monthly","Quarterly","Six-Monthly","Annually","At Maturity"]'::jsonb, false, 5)
  ) AS v(field_key, label, field_type, linked_table_id, linked_display_field, select_options, is_required, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_loan_phases_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
