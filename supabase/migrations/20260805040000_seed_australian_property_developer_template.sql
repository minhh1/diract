-- Seeds the "Australian Property Developer Seed Template" marketplace
-- template (see template_marketplace.sql), owned by Niksen Time Pty Ltd --
-- the app's one real property-developer company. Ported wholesale from
-- Niksen's live company_tables/company_table_fields/company_custom_fields
-- (dumped via a one-off read-only script against the linked project, not
-- hand-copied from the ~30 individual Niksen-specific migrations that built
-- this up incrementally) so the template reflects what Niksen actually
-- runs today, not a curated subset.
--
-- Covers: Contacts, Finance Model Budget Lines/Loans/Transactions/
-- Classification Rules/Loan Interest Rates/Loan Phases/Settings/
-- Feasibility Inputs/Feasibility Scenarios, Irregularities (11 tables) --
-- plus system-field extensions on properties/projects/entities (Sold,
-- Folio Identifier, Matter Number (Legal), Loans Outstanding, and Niksen's
-- entity-level trust/bank/accounting fields).
--
-- A few fields were genericized on the way in -- a template installed by a
-- DIFFERENT company shouldn't carry Niksen's own name or vendor choices:
--   * entities.service_agreement_with_niksen -> service_agreement /
--     "Service Agreement" (was "...with Niksen Time Pty Ltd")
--   * entities.nab_connect_id -> bank_feed_linked / "Bank Feed Linked"
--     (was "NAB Connect Linked" -- NAB is Niksen's own bank, not universal)
--   * entities.accountant: was a `select` hardcoded to Niksen's own
--     accounting firms (MyTaxMate/AP/Investax) -- changed to free `text`
--   * properties.matter_number_legal_ -> matter_number_legal (trailing
--     underscore was a leftover label-to-key slugging artifact)
--
-- Deliberately NOT ported: Niksen's 6 company_dashboards. Two (Finance
-- Model search, Residual Land Solver) are generic/config-less and would be
-- portable, but template_definition_dashboards.source_template_table_id is
-- NOT NULL with no "no bound table" option (unlike company_dashboards,
-- which added source_table_type='none' for exactly this case) -- there's no
-- clean row to seed for a genuinely tableless dashboard. The other four
-- (Tasks, Entity Admin, Loans, Irregularities boards) are public_task_page/
-- public_client_update_page widgets pointing at Niksen-owned pageIds/slugs
-- (e.g. slug 'niksen-entity-admin') that don't exist for another company --
-- porting them as-is would point a fresh install at Niksen's own private
-- pages. Same judgment call template_law_firm_seed.sql already made when it
-- deliberately DELETEd its own Trust Account dashboard as not
-- template-appropriate.
--
-- Idempotent -- safe to re-run; every insert is guarded by a natural-key
-- existence check, matching template_law_firm_seed.sql's own convention.

DO $$
DECLARE
  v_owner_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d'; -- Niksen Time Pty Ltd
  v_template_id uuid;
  v_contacts_table_id uuid;
  v_finance_model_budget_lines_table_id uuid;
  v_finance_model_loans_table_id uuid;
  v_irregularities_table_id uuid;
  v_finance_model_transactions_table_id uuid;
  v_finance_model_classification_rules_table_id uuid;
  v_finance_model_loan_interest_rates_table_id uuid;
  v_finance_model_loan_phases_table_id uuid;
  v_finance_model_settings_table_id uuid;
  v_finance_model_feasibility_inputs_table_id uuid;
  v_finance_model_feasibility_scenarios_table_id uuid;
BEGIN
  -- ── Template shell ───────────────────────────────────────────────────
  -- slug stays 'property-developer' (stable identifier, same convention
  -- template_law_firm_seed.sql documents for its own 'law-firm' slug) --
  -- only the display name/description changed.
  INSERT INTO template_definitions (slug, name, description, industry, icon, color, owner_company_id, is_published)
  VALUES (
    'property-developer', 'Australian Property Developer Seed Template',
    'A full property-development back office: Contacts, Finance Model (Budget Lines, Loans, Transactions, Classification Rules, Loan Interest Rates/Phases, Settings, Feasibility Inputs/Scenarios) and Irregularities tracking, plus Sold/Folio Identifier fields on Properties and trust/banking fields on Entities.',
    'Real Estate Development', 'Building2', '#f59e0b', v_owner_company_id, true
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description;

  SELECT id INTO v_template_id FROM template_definitions WHERE slug = 'property-developer';

  -- ── System fields on properties ──────────────────────────────────────
  INSERT INTO template_definition_system_fields
    (template_id, table_name, field_key, label, field_type, select_options, section_name, display_order)
  SELECT v_template_id, 'properties', v.field_key, v.label, v.field_type, v.select_options, v.section_name, v.display_order
  FROM (VALUES
    ('matter_number_legal', 'Matter Number (Legal)', 'text',    NULL::jsonb, 'Sale details'::text, 0),
    ('folio_identifier',    'Folio Identifier',      'text',    NULL::jsonb, 'Sale details'::text, 1),
    ('sold',                'Sold',                  'boolean', NULL::jsonb, 'Sale details'::text, 2)
  ) AS v(field_key, label, field_type, select_options, section_name, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_system_fields
    WHERE template_id = v_template_id AND table_name = 'properties' AND field_key = v.field_key
  );

  -- ── System fields on projects ────────────────────────────────────────
  INSERT INTO template_definition_system_fields
    (template_id, table_name, field_key, label, field_type, select_options, section_name, display_order)
  SELECT v_template_id, 'projects', v.field_key, v.label, v.field_type, v.select_options, 'Finance'::text, v.display_order
  FROM (VALUES
    ('loans_outstanding', 'Loans Outstanding', 'currency', NULL::jsonb, 0)
  ) AS v(field_key, label, field_type, select_options, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_system_fields
    WHERE template_id = v_template_id AND table_name = 'projects' AND field_key = v.field_key
  );

  -- ── System fields on entities ────────────────────────────────────────
  -- Trust/banking/accounting details a property developer tracks per
  -- lender/borrower/service-provider entity. accountant was a Niksen-
  -- specific vendor select (MyTaxMate/AP/Investax) -- see header comment.
  INSERT INTO template_definition_system_fields
    (template_id, table_name, field_key, label, field_type, select_options, section_name, display_order)
  SELECT v_template_id, 'entities', v.field_key, v.label, v.field_type, v.select_options, 'Trust & Banking'::text, v.display_order
  FROM (VALUES
    ('xero_bank_feed',     'Xero Bank Feed',      'text',   NULL::jsonb, 0),
    ('bank_account_name',  'Bank Account Name',   'text',   NULL::jsonb, 1),
    ('gst_report_frequency','GST Report Frequency','select', to_jsonb(ARRAY['Monthly','Quarterly','Annually']), 2),
    ('service_agreement',  'Service Agreement',   'text',   NULL::jsonb, 3),
    ('abn',                'ABN',                 'abn',    NULL::jsonb, 4),
    ('acn',                'ACN',                 'acn',    NULL::jsonb, 5),
    ('tfn',                'TFN',                 'text',   NULL::jsonb, 6),
    ('trust_deed_date',    'Trust Deed Date',     'date',   NULL::jsonb, 7),
    ('bank_name',          'Bank (Institution)',  'text',   NULL::jsonb, 8),
    ('bsb',                'Bank BSB',            'text',   NULL::jsonb, 9),
    ('account_number',     'Bank Account Number', 'text',   NULL::jsonb, 10),
    ('bank_feed_linked',   'Bank Feed Linked',    'text',   NULL::jsonb, 11),
    ('accountant',         'Accountant',          'text',   NULL::jsonb, 12)
  ) AS v(field_key, label, field_type, select_options, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_system_fields
    WHERE template_id = v_template_id AND table_name = 'entities' AND field_key = v.field_key
  );

  -- ── Contacts ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'contacts', 'Contacts', 'Contact', '#0ea5e9', 'name', 0, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'contacts');

  SELECT id INTO v_contacts_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'contacts';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_contacts_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('name', 'Name', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 0),
    ('email', 'Email', 'email', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 1),
    ('phone', 'Phone', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 2)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_contacts_table_id AND field_key = v.field_key);

  -- ── Finance Model Budget Lines ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-budget-lines', 'Finance Model Budget Lines', 'Wallet', '#f59e0b', 'label', 1, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-budget-lines');

  SELECT id INTO v_finance_model_budget_lines_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-budget-lines';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_budget_lines_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('project', 'Project', 'project', NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 0),
    ('category', 'Category', 'select', to_jsonb(ARRAY['Acquisition', 'Construction', 'Professional Fees', 'Finance Costs', 'Contingency', 'Revenue', 'Other']), NULL::text, NULL::uuid, NULL::text, 1),
    ('label', 'Label', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 2),
    ('budgeted_amount', 'Budgeted Amount', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 3),
    ('xero_account_code', 'Xero Account Code', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 4),
    ('display_order', 'Display Order', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 5),
    ('linked_task_id', 'Linked Task', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 6),
    ('timing_profile', 'Timing Profile', 'select', to_jsonb(ARRAY['Lump Sum at Start', 'Lump Sum at End', 'Even Spread', 'S-Curve']), NULL::text, NULL::uuid, NULL::text, 7),
    ('timing_start_date', 'Timing Start', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 8),
    ('timing_end_date', 'Timing End', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 9),
    ('linked_source', 'Linked Source', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 10),
    ('linked_task_ids', 'Related Tasks', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 11)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_budget_lines_table_id AND field_key = v.field_key);

  -- ── Finance Model Loans ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-loans', 'Finance Model Loans', 'Landmark', '#f59e0b', 'name', 2, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-loans');

  SELECT id INTO v_finance_model_loans_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-loans';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_loans_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('project', 'Project', 'project', NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 0),
    ('name', 'Name', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 1),
    ('lender_type', 'Lender Type', 'select', to_jsonb(ARRAY['Senior', 'Mezzanine', 'Private Lender', 'Money Partner', 'Other']), NULL::text, NULL::uuid, NULL::text, 2),
    ('borrower', 'Borrower', 'entity', NULL::jsonb, 'entities'::text, NULL::uuid, 'name'::text, 3),
    ('guarantors', 'Guarantors', 'entity', NULL::jsonb, 'entities'::text, NULL::uuid, 'name'::text, 4),
    ('principal_amount', 'Principal Amount', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 5),
    ('start_date', 'Start Date', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 6),
    ('repayment_date', 'Repayment Date', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 7),
    ('repayment_period', 'Repayment Period', 'select', to_jsonb(ARRAY['Monthly', 'Six-Monthly', 'At End of Term']), NULL::text, NULL::uuid, NULL::text, 8),
    ('extension_right', 'Extension Right', 'boolean', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 9),
    ('extension_terms', 'Extension Terms', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 10),
    ('early_repayment_allowed', 'Early Repayment Allowed', 'boolean', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 11),
    ('early_repayment_terms', 'Early Repayment Terms', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 12),
    ('security', 'Security', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 13),
    ('notes', 'Notes', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 14),
    ('is_discharged', 'Discharged', 'boolean', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 15),
    ('interest_to_date', 'Interest Costed To', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 16),
    ('lender', 'Lender', 'entity', NULL::jsonb, 'entities'::text, NULL::uuid, 'name'::text, 17),
    ('broker', 'Broker', 'entity', NULL::jsonb, 'entities'::text, NULL::uuid, 'name'::text, 18)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_loans_table_id AND field_key = v.field_key);

  -- ── Irregularities ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'irregularities', 'Irregularities', 'AlertTriangle', '#ef4444', 'detail', 3, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'irregularities');

  SELECT id INTO v_irregularities_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'irregularities';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_irregularities_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('source_table', 'Table', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 0),
    ('entity', 'Entity', 'entity', NULL::jsonb, 'entities'::text, NULL::uuid, NULL::text, 1),
    ('issue_type', 'Issue Type', 'select', to_jsonb(ARRAY['Missing Trust Link', 'Incomplete Established Date', 'Missing GST Report Frequency', 'Invalid TFN']), NULL::text, NULL::uuid, NULL::text, 2),
    ('classification', 'Classification', 'select', to_jsonb(ARRAY['Important', 'Moderate', 'Minor']), NULL::text, NULL::uuid, NULL::text, 3),
    ('detail', 'Detail', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 4),
    ('status', 'Status', 'select', to_jsonb(ARRAY['Open', 'Resolved']), NULL::text, NULL::uuid, NULL::text, 5),
    ('detected_at', 'Detected At', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 6),
    ('property', 'Property', 'property', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 7),
    ('target_field_key', 'Target Field', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 8),
    ('contact', 'Contact', 'table_relation', NULL::jsonb, NULL::text, v_contacts_table_id, 'name'::text, 9)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_irregularities_table_id AND field_key = v.field_key);

  -- ── Finance Model Transactions ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-transactions', 'Finance Model Transactions', 'ArrowLeftRight', '#f59e0b', 'reference', 4, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-transactions');

  SELECT id INTO v_finance_model_transactions_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-transactions';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_transactions_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('project', 'Project', 'project', NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 0),
    ('date', 'Date', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 1),
    ('type', 'Type', 'select', to_jsonb(ARRAY['Income', 'Expense']), NULL::text, NULL::uuid, NULL::text, 2),
    ('contact', 'Contact', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 3),
    ('reference', 'Reference', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 4),
    ('amount', 'Amount', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 5),
    ('budget_line', 'Budget Line', 'table_relation', NULL::jsonb, NULL::text, v_finance_model_budget_lines_table_id, 'label'::text, 6),
    ('source', 'Source', 'select', to_jsonb(ARRAY['Manual', 'Xero']), NULL::text, NULL::uuid, NULL::text, 7),
    ('xero_transaction_id', 'Xero Transaction ID', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 8),
    ('description', 'Description', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 9),
    ('contact_id', 'Contact ID (Xero)', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 10),
    ('loan_id', 'Loan', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 11)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_transactions_table_id AND field_key = v.field_key);

  -- ── Finance Model Classification Rules ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-classification-rules', 'Finance Model Classification Rules', 'ListFilter', '#f59e0b', 'match_value', 5, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-classification-rules');

  SELECT id INTO v_finance_model_classification_rules_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-classification-rules';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_classification_rules_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('project', 'Project', 'project', NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 0),
    ('match_field', 'Match Field', 'select', to_jsonb(ARRAY['Contact', 'Reference', 'Description']), NULL::text, NULL::uuid, NULL::text, 1),
    ('match_type', 'Match Type', 'select', to_jsonb(ARRAY['Equals', 'Contains', 'Starts With']), NULL::text, NULL::uuid, NULL::text, 2),
    ('match_value', 'Match Value', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 3),
    ('budget_line', 'Budget Line', 'table_relation', NULL::jsonb, NULL::text, v_finance_model_budget_lines_table_id, 'label'::text, 4),
    ('display_order', 'Display Order', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 5),
    ('is_active', 'Is Active', 'boolean', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 6)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_classification_rules_table_id AND field_key = v.field_key);

  -- ── Finance Model Loan Interest Rates ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-loan-interest-rates', 'Finance Model Loan Interest Rates', 'Percent', '#f59e0b', 'loan', 6, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-loan-interest-rates');

  SELECT id INTO v_finance_model_loan_interest_rates_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-loan-interest-rates';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_loan_interest_rates_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('loan', 'Loan', 'table_relation', NULL::jsonb, NULL::text, v_finance_model_loans_table_id, 'name'::text, 0),
    ('effective_date', 'Effective Date', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 1),
    ('interest_rate_pa', 'Interest Rate (% p.a.)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 2)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_loan_interest_rates_table_id AND field_key = v.field_key);

  -- ── Finance Model Loan Phases ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-loan-phases', 'Finance Model Loan Phases', 'CalendarRange', '#f59e0b', 'loan', 7, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-loan-phases');

  SELECT id INTO v_finance_model_loan_phases_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-loan-phases';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_loan_phases_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('loan', 'Loan', 'table_relation', NULL::jsonb, NULL::text, v_finance_model_loans_table_id, 'name'::text, 0),
    ('phase_order', 'Phase Order', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 1),
    ('repayment_type', 'Repayment Type', 'select', to_jsonb(ARRAY['Interest Only', 'Amortizing']), NULL::text, NULL::uuid, NULL::text, 2),
    ('start_date', 'Start Date', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 3),
    ('end_date', 'End Date', 'date', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 4),
    ('payment_frequency', 'Payment Frequency', 'select', to_jsonb(ARRAY['Monthly', 'Quarterly', 'Six-Monthly', 'Annually', 'At Maturity']), NULL::text, NULL::uuid, NULL::text, 5),
    ('notes', 'Notes', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 6)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_loan_phases_table_id AND field_key = v.field_key);

  -- ── Finance Model Settings ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-settings', 'Finance Model Settings', 'Settings', '#f59e0b', 'project', 8, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-settings');

  SELECT id INTO v_finance_model_settings_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-settings';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_settings_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('project', 'Project', 'project', NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 0),
    ('gst_method', 'GST Method', 'select', to_jsonb(ARRAY['Margin Scheme', 'Standard (1/11th)', 'GST-free']), NULL::text, NULL::uuid, NULL::text, 1)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_settings_table_id AND field_key = v.field_key);

  -- ── Finance Model Feasibility Inputs ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-feasibility-inputs', 'Finance Model Feasibility Inputs', 'Calculator', '#f59e0b', 'project', 9, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-feasibility-inputs');

  SELECT id INTO v_finance_model_feasibility_inputs_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-feasibility-inputs';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_feasibility_inputs_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('project', 'Project', 'project', NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 0),
    ('dwellings_count', 'Number of Dwellings', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 1),
    ('avg_dwelling_size_sqm', 'Average Dwelling Size (sqm)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 2),
    ('site_area_sqm', 'Site Area (sqm)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 3),
    ('expected_sale_price_per_dwelling', 'Expected Sale Price per Dwelling', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 4),
    ('construction_rate_per_sqm', 'Construction Rate ($/sqm)', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 5),
    ('professional_fees_pct', 'Professional Fees (% of Construction)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 6),
    ('contingency_pct', 'Contingency (% of Construction)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 7),
    ('marketing_selling_pct', 'Marketing & Selling (% of Revenue)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 8),
    ('other_acquisition_costs', 'Other Acquisition Costs (legal, DD, etc.)', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 9),
    ('holding_costs_annual', 'Holding Costs (per annum)', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 10),
    ('project_duration_months', 'Project Duration (months)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 11),
    ('interest_rate_pct', 'Interest Rate (% p.a.)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 12),
    ('loan_to_cost_pct', 'Loan to Cost (%)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 13),
    ('target_margin_pct', 'Target Margin on Cost (%)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 14),
    ('facility_limit', 'Facility Limit ($)', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 15),
    ('facility_interest_rate_pct', 'Facility Interest Rate (% p.a.)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 16),
    ('max_lvr_pct', 'Max LVR Covenant (%)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 17),
    ('preferred_return_pct', 'Preferred Return (% p.a., compounding)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 18),
    ('promote_pct', 'GP Promote on Residual Profit (%)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 19)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_feasibility_inputs_table_id AND field_key = v.field_key);

  -- ── Finance Model Feasibility Scenarios ──
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger, disable_record_dashboard)
  SELECT v_template_id, 'finance-model-feasibility-scenarios', 'Finance Model Feasibility Scenarios', 'GitBranch', '#f59e0b', 'name', 10, false, false
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-feasibility-scenarios');

  SELECT id INTO v_finance_model_feasibility_scenarios_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'finance-model-feasibility-scenarios';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_finance_model_feasibility_scenarios_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('project', 'Project', 'project', NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 0),
    ('name', 'Name', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 1),
    ('sale_price_delta_pct', 'Sale Price Change (%)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 2),
    ('sale_price_override', 'Sale Price Override ($)', 'currency', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 3),
    ('construction_cost_delta_pct', 'Construction Cost Change (%)', 'number', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 4),
    ('notes', 'Notes', 'text', NULL::jsonb, NULL::text, NULL::uuid, NULL::text, 5)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_finance_model_feasibility_scenarios_table_id AND field_key = v.field_key);
END $$;
