-- Seeds the "Law Firm" marketplace template (see template_marketplace.sql),
-- owned by Huynh Lawyers so Minh can keep extending it as its admin via the
-- template schema editor. Modeled on a real practice-management export
-- (Matters/Invoices/Billed & Unbilled Time & Fees/Disbursements), consolidated
-- down to: Matter fields on the existing `projects` system table (a Matter
-- *is* a project, not a separate custom table) + six custom tables
-- (Invoices, Time & Fee Entries, Disbursements, Trust Transactions, plus a
-- Leads intake pipeline: Leads and a Lead Activities follow-up log).
-- "Billed" vs "unbilled" from the source export collapses into a nullable
-- Invoice link + Billable flag.
-- Idempotent -- safe to re-run; every insert is guarded by a natural-key
-- existence check. select_options are jsonb (see
-- template_marketplace_select_options_jsonb.sql).
--
-- Time entries carry UTBMS task/activity codes (the e-billing standard the
-- LEDES 1998B export widget needs -- see app/api/ledes/[recordId]/route.ts
-- and components/dashboard/LedesExportWidget.tsx), and disbursements carry
-- the matching E-series expense codes.
--
-- Trust Transactions is a LEDGER table (is_ledger -- see
-- company_table_ledger.sql): append-only with consecutive receipt numbers,
-- per-matter running balances and an overdraw guard, per Legal Profession
-- Uniform General Rules 2015 rr 36/40/47.
--
-- Also bundles four dashboards (see template_marketplace_dashboards.sql) --
-- Time Entry, Trust Account (includes a trust_reconciliation widget),
-- Billing (includes a ledes_export widget) and Leads -- so installing the
-- template creates ready-to-use dashboards, not just bare tables.
--
-- Deliberately excludes Medicare/Centrelink/Corrections/passport/PO-Box/
-- forwarding/registered-agent-address fields from the raw export -- too
-- niche for a general template; can be added later via the schema editor.

DO $$
DECLARE
  v_owner_company_id uuid;
  v_template_id uuid;
  v_invoices_table_id uuid;
  v_timefees_table_id uuid;
  v_disb_table_id uuid;
  v_trust_table_id uuid;
  v_receipts_table_id uuid;
  v_accounts_table_id uuid;
  v_protected_table_id uuid;
  v_recon_table_id uuid;
  v_credits_table_id uuid;
  v_leads_table_id uuid;
  v_leadact_table_id uuid;
BEGIN
  SELECT active_company_id INTO v_owner_company_id FROM profiles WHERE email = 'minh@huynhco.com';
  IF v_owner_company_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve an active company for minh@huynhco.com -- run this after that profile has an active_company_id set';
  END IF;

  -- ── Template shell ───────────────────────────────────────────────────
  -- Name is "Australia Law Firm Seed Template" -- every date-typed field
  -- this template seeds (and every trust/report screen built against it)
  -- assumes en-AU (DD/MM/YYYY) display, and the trust ledger's whole design
  -- (receipt numbering, running balances, overdraw guard) follows the
  -- Legal Profession Uniform General Rules 2015 (NSW/Vic) specifically --
  -- not a jurisdiction-neutral template. Slug stays 'law-firm' (stable
  -- identifier referenced throughout the codebase/SQL); only the display
  -- name changed. Existing installs are renamed by a migration (the
  -- ON CONFLICT below only fires for a genuinely fresh row).
  INSERT INTO template_definitions (slug, name, description, industry, icon, color, owner_company_id, is_published, suggested_label_overrides)
  VALUES (
    'law-firm', 'Australia Law Firm Seed Template',
    'Matter fields on Projects, plus Invoices, Time & Fee Entries, Disbursements and an append-only Trust Transactions ledger for an Australian legal practice.',
    'Legal', 'Scale', '#4338ca', v_owner_company_id, true,
    jsonb_build_object('projects', jsonb_build_object('singular', 'Matter', 'plural', 'Matters'))
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_template_id FROM template_definitions WHERE slug = 'law-firm';

  -- ── Matter fields on projects ────────────────────────────────────────
  INSERT INTO template_definition_system_fields
    (template_id, table_name, field_key, label, field_type, select_options, linked_table, linked_display_column, section_name, display_order)
  SELECT v_template_id, 'projects', v.field_key, v.label, v.field_type, v.select_options, v.linked_table, v.linked_display_column, 'Matter details', v.display_order
  FROM (VALUES
    ('matter_number',          'Matter Number',              'text',   NULL::jsonb, NULL::text, NULL::text, 0),
    ('matter_type',            'Matter Type',                'select', to_jsonb(ARRAY['Conveyancing','Family Law','Wills & Estates','Commercial','Litigation','Migration','Criminal','Other']), NULL::text, NULL::text, 1),
    ('billing_type',           'Billing Type',               'select', to_jsonb(ARRAY['Time Based','Fixed Fee']), NULL::text, NULL::text, 2),
    ('client',                 'Client',                     'entity', NULL::jsonb, 'entities', 'name', 3),
    ('other_side',             'Other Side',                 'entity', NULL::jsonb, 'entities', 'name', 4),
    ('other_side_solicitor',   'Other Side''s Solicitor',    'entity', NULL::jsonb, 'entities', 'name', 5),
    ('debtor',                 'Debtor',                     'entity', NULL::jsonb, 'entities', 'name', 6),
    ('person_responsible',     'Person Responsible',         'entity', NULL::jsonb, 'entities', 'name', 7),
    ('person_assisting',       'Person Assisting',           'entity', NULL::jsonb, 'entities', 'name', 8),
    -- selling_agent/deposit_holder: conveyancing matters need to record who
    -- holds the deposit at settlement -- usually the selling agent, but
    -- sometimes the other side's solicitor or a third party. deposit_holder
    -- itself is a plain select (no conditional-visibility mechanism exists
    -- for a custom field), so deposit_holder_other is just always present,
    -- only meaningful when deposit_holder = 'Other'.
    ('selling_agent',          'Selling Agent',              'entity', NULL::jsonb, 'entities', 'name', 9),
    ('deposit_holder',         'Deposit Holder',              'select', to_jsonb(ARRAY['Selling Agent','Other Side''s Solicitor','Other']), NULL::text, NULL::text, 10),
    ('deposit_holder_other',   'Deposit Holder (if Other)',  'entity', NULL::jsonb, 'entities', 'name', 11)
  ) AS v(field_key, label, field_type, select_options, linked_table, linked_display_column, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_system_fields
    WHERE template_id = v_template_id AND table_name = 'projects' AND field_key = v.field_key
  );

  -- ── Law-specific fields on entities ──────────────────────────────────
  INSERT INTO template_definition_system_fields
    (template_id, table_name, field_key, label, field_type, select_options, section_name, display_order)
  SELECT v_template_id, 'entities', v.field_key, v.label, v.field_type, v.select_options, 'Legal details', v.display_order
  FROM (VALUES
    ('practising_certificate_number', 'Practising Certificate Number', 'text',   NULL::jsonb, 0),
    ('country_of_citizenship',        'Country of Citizenship',        'text',   NULL::jsonb, 1),
    ('drivers_licence_number',        'Driver''s Licence Number',      'text',   NULL::jsonb, 2),
    ('drivers_licence_state',         'Driver''s Licence State',       'select', to_jsonb(ARRAY['NSW','VIC','QLD','WA','SA','TAS','ACT','NT']), 3),
    ('default_hourly_rate',           'Default Hourly Rate',           'currency', NULL::jsonb, 4),
    ('timekeeper_level',              'Timekeeper Level',              'select', to_jsonb(ARRAY['Partner','Senior Associate','Associate','Lawyer','Paralegal','Clerk']), 5)
  ) AS v(field_key, label, field_type, select_options, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_system_fields
    WHERE template_id = v_template_id AND table_name = 'entities' AND field_key = v.field_key
  );

  -- ── Invoices ─────────────────────────────────────────────────────────
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'invoices', 'Invoices', 'Receipt', '#0891b2', 'invoice_number', 0
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'invoices');

  SELECT id INTO v_invoices_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'invoices';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_display_field, display_order)
  SELECT v_invoices_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_display_field, v.display_order
  FROM (VALUES
    ('invoice_number', 'Invoice Number',    'text',     NULL::jsonb, NULL::text, NULL::text, 0),
    ('matter',         'Matter',            'project',  NULL::jsonb, 'projects', 'name', 1),
    ('debtor',         'Debtor',            'entity',   NULL::jsonb, 'entities', 'name', 2),
    ('issue_date',     'Issue Date',        'date',     NULL::jsonb, NULL::text, NULL::text, 3),
    ('due_date',       'Due Date',          'date',     NULL::jsonb, NULL::text, NULL::text, 4),
    ('status',         'Status',            'select',   to_jsonb(ARRAY['Draft','Under Review','Sent','Paid','Overdue']), NULL::text, NULL::text, 5),
    ('period_start',   'Period Start',      'date',     NULL::jsonb, NULL::text, NULL::text, 6),
    ('period_end',     'Period End',        'date',     NULL::jsonb, NULL::text, NULL::text, 7),
    ('fees_total',     'Fees',              'currency', NULL::jsonb, NULL::text, NULL::text, 8),
    ('disbursements_total', 'Disbursements', 'currency', NULL::jsonb, NULL::text, NULL::text, 9),
    ('subtotal',       'Subtotal (Ex. GST)', 'currency', NULL::jsonb, NULL::text, NULL::text, 10),
    ('gst',            'GST',               'currency', NULL::jsonb, NULL::text, NULL::text, 11),
    ('total_inc_gst',  'Total Inc. GST',    'currency', NULL::jsonb, NULL::text, NULL::text, 12),
    ('trust_applied',  'Trust Applied',     'currency', NULL::jsonb, NULL::text, NULL::text, 13),
    ('payments',       'Payments',          'currency', NULL::jsonb, NULL::text, NULL::text, 14),
    ('amount_due',     'Amount Due',        'currency', NULL::jsonb, NULL::text, NULL::text, 15)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_invoices_table_id AND field_key = v.field_key
  );

  -- Invoice computed fields + numbering. Formula/auto-number config is set
  -- via guarded UPDATEs so re-running upgrades a previously-seeded catalog.
  -- Display order matters: computeFormulaFields() evaluates in field order,
  -- so each formula's inputs sit earlier than the formula itself
  -- (fees/disb -> subtotal -> gst -> total).
  UPDATE template_definition_table_fields SET auto_number_prefix = 'INV-'
    WHERE template_table_id = v_invoices_table_id AND field_key = 'invoice_number' AND auto_number_prefix IS NULL;
  UPDATE template_definition_table_fields SET
      formula_type = 'sum_related', formula_related_table_slug = 'time-fee-entries',
      formula_field_a_key = 'amount', formula_relation_field_key = 'invoice'
    WHERE template_table_id = v_invoices_table_id AND field_key = 'fees_total' AND formula_type IS NULL;
  UPDATE template_definition_table_fields SET
      formula_type = 'sum_related', formula_related_table_slug = 'disbursements',
      formula_field_a_key = 'amount', formula_relation_field_key = 'invoice'
    WHERE template_table_id = v_invoices_table_id AND field_key = 'disbursements_total' AND formula_type IS NULL;
  UPDATE template_definition_table_fields SET
      formula_type = 'add', formula_field_a_key = 'fees_total', formula_field_b_key = 'disbursements_total'
    WHERE template_table_id = v_invoices_table_id AND field_key = 'subtotal' AND formula_type IS NULL;
  UPDATE template_definition_table_fields SET
      formula_type = 'percentage_of', formula_field_a_key = 'subtotal', formula_percent = 10
    WHERE template_table_id = v_invoices_table_id AND field_key = 'gst' AND formula_type IS NULL;
  UPDATE template_definition_table_fields SET
      formula_type = 'add', formula_field_a_key = 'subtotal', formula_field_b_key = 'gst',
      display_order = 12
    WHERE template_table_id = v_invoices_table_id AND field_key = 'total_inc_gst' AND formula_type IS NULL;
  UPDATE template_definition_table_fields SET display_order = 14
    WHERE template_table_id = v_invoices_table_id AND field_key = 'payments' AND display_order = 7;
  UPDATE template_definition_table_fields SET display_order = 15
    WHERE template_table_id = v_invoices_table_id AND field_key = 'amount_due' AND display_order = 6;

  -- waived_amount: a balance an admin has written off via the Receipts
  -- ledger's "waive balance" action (see below) -- reduces amount_due
  -- alongside trust_applied/payments so the invoice PDF and EditInvoiceModal
  -- reconcile correctly. Added after payments/amount_due already existed, so
  -- both inserted fresh (guarded) and slotted in via a reorder, matching the
  -- pattern above.
  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_display_field, display_order)
  SELECT v_invoices_table_id, 'waived_amount', 'Waived', 'currency', NULL::jsonb, NULL::text, NULL::text, 15
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_invoices_table_id AND field_key = 'waived_amount'
  );
  UPDATE template_definition_table_fields SET display_order = 16
    WHERE template_table_id = v_invoices_table_id AND field_key = 'amount_due' AND display_order = 15;

  -- ── Time & Fee Entries ───────────────────────────────────────────────
  -- Billed vs unbilled from the source export = Invoice link present/absent.
  -- disable_record_dashboard=true: this is pure line-item data, meaningfully
  -- edited only from the "Time Entry" dashboard's inline grid (te8 below),
  -- never as its own full record-dashboard drill-down -- see
  -- supabase/company_tables_disable_record_dashboard.sql.
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, disable_record_dashboard)
  SELECT v_template_id, 'time-fee-entries', 'Time & Fee Entries', 'Clock', '#7c3aed', 'description', 1, true
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'time-fee-entries');

  SELECT id INTO v_timefees_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'time-fee-entries';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_timefees_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('matter',          'Matter',           'project',        NULL::jsonb, 'projects'::text, NULL::uuid,          'name'::text,  0),
    ('invoice',         'Invoice',          'table_relation', NULL::jsonb, NULL::text,        v_invoices_table_id, 'invoice_number', 1),
    ('staff',           'Staff',            'entity',         NULL::jsonb, 'entities'::text,  NULL::uuid,          'name',        2),
    ('date',            'Date',             'date',           NULL::jsonb, NULL::text,        NULL::uuid,          NULL::text,    3),
    ('type',            'Type',             'select',         to_jsonb(ARRAY['Time Based','Fixed Fee']), NULL::text, NULL::uuid, NULL::text,  4),
    ('task_code',       'Task Code (UTBMS)', 'select',        to_jsonb(ARRAY[
        'L100 Case Assessment, Development and Administration','L110 Fact Investigation/Development','L120 Analysis/Strategy','L130 Experts/Consultants','L140 Document/File Management','L150 Budgeting','L160 Settlement/Non-Binding ADR','L190 Other Case Assessment',
        'L200 Pre-Trial Pleadings and Motions','L210 Pleadings','L220 Preliminary Injunctions/Provisional Remedies','L230 Court Mandated Conferences','L240 Dispositive Motions','L250 Other Written Motions and Submissions','L260 Class Action Certification and Notice',
        'L300 Discovery','L310 Written Discovery','L320 Document Production','L330 Depositions','L340 Expert Discovery','L350 Discovery Motions','L390 Other Discovery',
        'L400 Trial Preparation and Trial','L410 Fact Witnesses','L420 Expert Witnesses','L430 Written Motions and Submissions','L440 Other Trial Preparation and Support','L450 Trial and Hearing Attendance','L460 Post-Trial Motions and Submissions','L470 Enforcement',
        'L500 Appeal','L510 Appellate Motions and Submissions','L520 Appellate Briefs','L530 Oral Argument']), NULL::text, NULL::uuid, NULL::text, 5),
    ('activity_code',   'Activity Code (UTBMS)', 'select',    to_jsonb(ARRAY[
        'A101 Plan and Prepare For','A102 Research','A103 Draft/Revise','A104 Review/Analyze','A105 Communicate (In Firm)','A106 Communicate (With Client)','A107 Communicate (Other Outside Counsel)','A108 Communicate (Other External)','A109 Appear For/Attend','A110 Manage Data/Files','A111 Other','A112 Travel']), NULL::text, NULL::uuid, NULL::text, 6),
    ('description',     'Description',      'text',           NULL::jsonb, NULL::text,        NULL::uuid,          NULL::text,    7),
    ('rate',            'Rate',             'currency',       NULL::jsonb, NULL::text,        NULL::uuid,          NULL::text,    8),
    ('duration_hours',  'Duration Hours',   'number',         NULL::jsonb, NULL::text,        NULL::uuid,          NULL::text,    9),
    ('amount',          'Amount',           'currency',       NULL::jsonb, NULL::text,        NULL::uuid,          NULL::text,    10),
    ('billable',        'Billable',         'boolean',        NULL::jsonb, NULL::text,        NULL::uuid,          NULL::text,    11),
    ('status',          'Status',           'select',         to_jsonb(ARRAY['Draft','Released','Billed','Written Off']), NULL::text, NULL::uuid, NULL::text, 12)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_timefees_table_id AND field_key = v.field_key
  );

  UPDATE template_definition_table_fields SET
      formula_type = 'multiply', formula_field_a_key = 'rate', formula_field_b_key = 'duration_hours'
    WHERE template_table_id = v_timefees_table_id AND field_key = 'amount' AND formula_type IS NULL;

  -- ── Disbursements ────────────────────────────────────────────────────
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'disbursements', 'Disbursements', 'Receipt', '#b45309', 'description', 2
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'disbursements');

  SELECT id INTO v_disb_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'disbursements';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_disb_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('matter',          'Matter',          'project',        NULL::jsonb, 'projects'::text, NULL::uuid,          'name'::text, 0),
    ('invoice',         'Invoice',         'table_relation', NULL::jsonb, NULL::text,       v_invoices_table_id, 'invoice_number', 1),
    ('staff',           'Staff',           'entity',         NULL::jsonb, 'entities'::text, NULL::uuid,          'name', 2),
    ('date',            'Date',            'date',           NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 3),
    ('expense_code',    'Expense Code (UTBMS)', 'select',    to_jsonb(ARRAY[
        'E101 Copying','E102 Outside Printing','E103 Word Processing','E104 Facsimile','E105 Telephone','E106 Online Research','E107 Delivery Services/Messengers','E108 Postage','E109 Local Travel','E110 Out-of-Town Travel','E111 Meals','E112 Court Fees','E113 Subpoena Fees','E114 Witness Fees','E115 Deposition Transcripts','E116 Trial Transcripts','E117 Trial Exhibits','E118 Litigation Support Vendors','E119 Experts','E120 Private Investigators','E121 Arbitrators/Mediators','E122 Local Counsel','E123 Other Professionals','E124 Other']), NULL::text, NULL::uuid, NULL::text, 4),
    ('supplier_name',   'Supplier Name',   'text',           NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 5),
    ('description',     'Description',     'text',           NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 6),
    ('rate',            'Rate',            'currency',       NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 7),
    ('quantity',        'Quantity',        'number',         NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 8),
    ('amount',          'Amount',          'currency',       NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 9),
    ('gst_inclusive',   'GST Inclusive',   'boolean',        NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 10),
    ('billable',        'Billable',        'boolean',        NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 11)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_disb_table_id AND field_key = v.field_key
  );

  UPDATE template_definition_table_fields SET
      formula_type = 'multiply', formula_field_a_key = 'rate', formula_field_b_key = 'quantity'
    WHERE template_table_id = v_disb_table_id AND field_key = 'amount' AND formula_type IS NULL;

  -- ── Trust Transactions (statutory ledger) ────────────────────────────
  -- Field particulars follow Uniform General Rules 2015 r 47 (payor/payee,
  -- purpose, cheque/EFT reference, running balance per matter) and r 36
  -- (consecutive receipt numbers, assigned server-side). amount_in/
  -- amount_out/matter/running_balance field_keys are the conventions
  -- insert_ledger_record() in company_table_ledger.sql keys on.
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger)
  SELECT v_template_id, 'trust-transactions', 'Trust Transactions', 'Landmark', '#0f766e', 'receipt_number', 3, true
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-transactions');

  SELECT id INTO v_trust_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'trust-transactions';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  SELECT v_trust_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order, v.auto_number_prefix, v.help_text
  FROM (VALUES
    ('receipt_number',  'Receipt No.',        'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 0, 'TR-'::text, 'Assigned automatically in consecutive sequence for deposits (r 36) -- leave blank'::text),
    ('date',            'Date',               'date',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 1, NULL, NULL),
    ('matter',          'Matter',             'project',  NULL::jsonb, 'projects'::text, NULL::uuid, 'name'::text, 2, NULL, NULL),
    ('client',          'Client',             'entity',   NULL::jsonb, 'entities'::text, NULL::uuid, 'name', 3, NULL, NULL),
    ('type',            'Type',               'select',   to_jsonb(ARRAY['Deposit','Withdrawal - Cheque','Withdrawal - EFT','Journal Transfer']), NULL::text, NULL::uuid, NULL::text, 4, NULL, NULL),
    ('payor_payee',     'Received From / Paid To', 'text', NULL::jsonb, NULL::text,      NULL::uuid, NULL::text, 5, NULL, NULL),
    ('purpose',         'Purpose',            'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 6, NULL, NULL),
    ('bank_reference',  'Cheque / EFT Reference', 'text', NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 7, NULL, 'Cheque number, or BSB/account and EFT reference (r 47)'),
    ('amount_in',       'Amount In',          'currency', NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 8, NULL, NULL),
    ('amount_out',      'Amount Out',         'currency', NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 9, NULL, NULL),
    ('running_balance', 'Matter Balance',     'currency', NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 10, NULL, 'Running balance of this matter''s trust ledger after this entry (r 47) -- computed automatically'),
    ('invoice',         'Invoice',            'table_relation', NULL::jsonb, NULL::text, v_invoices_table_id, 'invoice_number', 11, NULL, 'For withdrawals of legal costs: the bill this payment relates to (r 42)'),
    ('authority_reference', 'Withdrawal Authority', 'text', NULL::jsonb, NULL::text,     NULL::uuid, NULL::text, 12, NULL, 'Bill date + 7 business days elapsed, or the client''s written authority (r 42)'),
    ('payment_number',  'Payment No.',        'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 17, 'PY-'::text, 'Assigned automatically in consecutive sequence for withdrawals (r 36) -- leave blank'::text),
    ('journal_number',  'Journal No.',        'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text, 18, 'JT-'::text, 'Assigned automatically in consecutive sequence for journal transfers (r 36) -- leave blank'::text)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = v.field_key
  );

  -- ── Trust Accounts (multiple bank accounts per firm) ──────────────────
  -- Backs the bespoke /dashboard/trust-account page (not the generic
  -- dashboard-widget system) -- see supabase/migrations/20260731100000_trust_account_page.sql
  -- for the full rationale, the trust_account/payment_method/cheque_number
  -- fields added to Trust Transactions above, and the insert_ledger_record()
  -- change that scopes per-matter running balances by trust_account too.
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
    ('period_start',           'Period Start',            'date',     NULL::jsonb, NULL::uuid, NULL::text, 1),
    ('period_end',             'Period End',              'date',     NULL::jsonb, NULL::uuid, NULL::text, 2),
    ('status',                 'Status',                  'select',   to_jsonb(ARRAY['Draft','Reconciled']), NULL::uuid, NULL::text, 3),
    ('bank_statement_balance', 'Bank Statement Balance',  'currency', NULL::jsonb, NULL::uuid, NULL::text, 4),
    ('prepared_by',            'Prepared By',             'text',     NULL::jsonb, NULL::uuid, NULL::text, 5),
    ('prepared_at',            'Date Of Preparation',     'date',     NULL::jsonb, NULL::uuid, NULL::text, 6),
    ('reviewed_by',            'Reviewed By',             'text',     NULL::jsonb, NULL::uuid, NULL::text, 7),
    ('reviewed_at',            'Review Date',             'date',     NULL::jsonb, NULL::uuid, NULL::text, 8)
  ) AS v(field_key, label, field_type, select_options, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_recon_table_id AND field_key = v.field_key
  );

  -- trust_account/payment_method/cheque_number on Trust Transactions --
  -- these were added straight to the live catalog by
  -- supabase/migrations/20260731100000_trust_account_page.sql and never
  -- mirrored here, so a genuinely fresh install was missing them (caught
  -- while adding the "Funds remained in Bank Account" payment_method
  -- option below -- see supabase/migrations/20260802170000_trust_opening_balance_backfill.sql).
  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_template_table_id, linked_display_field, display_order)
  SELECT v_trust_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('trust_account',  'Trust Account',  'table_relation', NULL::jsonb, v_accounts_table_id, 'account_name'::text, 13),
    -- "Funds remained in Bank Account" covers an opening balance carried
    -- forward from a previous trust accounting system -- money that never
    -- moved as a fresh deposit, so none of the other methods describe it.
    ('payment_method', 'Payment Method', 'select', to_jsonb(ARRAY['Bank Transfer','Cash','Cheque','Credit Card','Funds remained in Bank Account','Bank Cheque','Direct Debit','Trust Cheque']), NULL::uuid, NULL::text, 14)
  ) AS v(field_key, label, field_type, select_options, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = v.field_key
  );

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, display_order, auto_number_prefix, help_text)
  SELECT v_trust_table_id, 'cheque_number', 'Cheque No.', 'text', 15, 'CHQ-', 'Assigned automatically when printing a trust cheque -- leave blank'
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = 'cheque_number');

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, linked_template_table_id, linked_display_field, display_order)
  SELECT v_trust_table_id, 'reconciled_in', 'Reconciled In', 'table_relation', v_recon_table_id, 'period_start', 16
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_trust_table_id AND field_key = 'reconciled_in');

  -- Trust Payment modal fields (Transfer Type / Account Name / Account
  -- Number / Internal Note) -- see
  -- supabase/migrations/20260802180000_trust_payment_modal_fields.sql for
  -- the full rationale and the live-catalog/installed-company rollout.
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

  -- Void-a-transaction fields -- see
  -- supabase/migrations/20260804030000_void_trust_transaction.sql for the
  -- full rationale (append-only, so "void" means a reversing entry, not an
  -- edit) and void_trust_transaction()'s definition.
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

  -- ── Receipts (operating account ledger) ──────────────────────────────
  -- Like Trust Transactions, but for payments/waivers against the firm's own
  -- operating/office account rather than client trust money -- one immutable
  -- row per part-payment or balance waiver against an Invoice, with its own
  -- consecutive "OA-" receipt number (distinct from Trust's "TR-" numbers).
  -- Deliberately doesn't use the amount_in/amount_out/running_balance
  -- field-key convention insert_ledger_record() keys on: this ledger has no
  -- per-matter overdraw concept, so those columns are simply absent and its
  -- balance logic no-ops.
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order, is_ledger)
  SELECT v_template_id, 'receipts', 'Receipts', 'HandCoins', '#b45309', 'receipt_number', 6, true
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'receipts');

  SELECT id INTO v_receipts_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'receipts';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  SELECT v_receipts_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order, v.auto_number_prefix, v.help_text
  FROM (VALUES
    ('receipt_number',   'Receipt No.',       'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 0, 'OA-'::text, 'Assigned automatically in consecutive sequence -- operating account receipt number -- leave blank'::text),
    ('date',             'Date',              'date',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 1, NULL, NULL),
    ('invoice',          'Invoice',           'table_relation', NULL::jsonb, NULL::text, v_invoices_table_id, 'invoice_number', 2, NULL, NULL),
    ('matter',           'Matter',            'project',  NULL::jsonb, 'projects'::text, NULL::uuid,          'name'::text, 3, NULL, NULL),
    ('payor',            'Received From',     'entity',   NULL::jsonb, 'entities'::text, NULL::uuid,          'name'::text, 4, NULL, NULL),
    ('amount_received',  'Amount Received',   'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 5, NULL, NULL),
    ('payment_method',   'Payment Method',    'select',   to_jsonb(ARRAY['Cash','EFT','Cheque','Card','Other']), NULL::text, NULL::uuid, NULL::text, 6, NULL, NULL),
    ('bank_reference',   'Reference',         'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 7, NULL, 'Cheque number, EFT reference, or transaction ID'),
    ('waived_amount',    'Amount Waived',     'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 8, NULL, NULL),
    ('waived_reason',    'Waiver Reason',     'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 9, NULL, 'Required if an amount is waived'),
    ('received_by',      'Received By',       'text',     NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 10, NULL, NULL),
    ('balance_after',    'Balance Remaining', 'currency', NULL::jsonb, NULL::text,       NULL::uuid,          NULL::text, 11, NULL, 'Invoice balance remaining after this receipt -- computed automatically')
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_receipts_table_id AND field_key = v.field_key
  );

  -- ── Leads ────────────────────────────────────────────────────────────
  -- Intake pipeline for prospective clients. Matter Type mirrors the
  -- projects matter_type options so a converted lead maps cleanly onto the
  -- Matter it becomes (linked via converted_matter).
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'leads', 'Leads', 'UserPlus', '#16a34a', 'lead_name', 4
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'leads');

  SELECT id INTO v_leads_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'leads';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  SELECT v_leads_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order, v.auto_number_prefix, v.help_text
  FROM (VALUES
    ('lead_number',        'Lead Number',        'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   0,  NULL::text, 'Assigned automatically if left blank -- you can change it; numbers must stay unique'::text),
    ('lead_name',          'Client''s name',     'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   1,  NULL, NULL),
    ('email',              'Email',              'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   2,  NULL, NULL),
    ('phone',              'Phone',              'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   3,  NULL, NULL),
    ('matter_type',        'Matter Type',        'select',   to_jsonb(ARRAY['Conveyancing','Family Law','Wills & Estates','Commercial','Litigation','Migration','Criminal','Other']), NULL::text, NULL::uuid, NULL::text, 4, NULL, NULL),
    ('source',             'Source',             'select',   to_jsonb(ARRAY['Referral','Existing Client','Website','Phone Enquiry','Walk-in','Social Media','Advertising','Other']), NULL::text, NULL::uuid, NULL::text, 5, NULL, NULL),
    ('referred_by',        'Referred By',        'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   6,  NULL, 'Who referred them (when Source = Referral)'),
    ('status',             'Status',             'select',   to_jsonb(ARRAY['New','Contacted','Consultation Booked','Consultation Held','Quote Sent','Converted','Declined','Lost']), NULL::text, NULL::uuid, NULL::text, 7, NULL, NULL),
    ('person_responsible', 'Person Responsible', 'entity',   NULL::jsonb, 'entities'::text, NULL::uuid, 'name'::text, 8,  NULL, NULL),
    ('date_received',      'Date Received',      'date',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   9,  NULL, NULL),
    ('next_follow_up',     'Next Follow-up',     'date',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   10, NULL, NULL),
    ('converted_matter',   'Converted Matter',   'project',  NULL::jsonb, 'projects'::text, NULL::uuid, 'name',       11, NULL, 'The Matter opened for this lead once it converts'),
    ('notes',              'Notes',              'text',     NULL::jsonb, NULL::text,       NULL::uuid, NULL::text,   12, NULL, NULL)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order, auto_number_prefix, help_text)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_leads_table_id AND field_key = v.field_key
  );

  -- Bare lead numbers 260001, 260002, ... -- the '' prefix (non-NULL) still
  -- marks the field auto-numbered, and auto_number_start seeds the counter
  -- when next_field_sequence first creates it (see
  -- company_table_field_sequences.sql). Guarded on auto_number_start so a
  -- catalog seeded before this change (old 'LD-' prefix) is corrected too.
  UPDATE template_definition_table_fields SET auto_number_prefix = '', auto_number_start = 260001
    WHERE template_table_id = v_leads_table_id AND field_key = 'lead_number' AND auto_number_start IS NULL;

  -- Lead numbers stay user-editable (auto-assignment only fills a BLANK
  -- lead_number -- see createRecord in lib/services/customTableService.ts),
  -- so flag the field unique to keep hand-entered numbers collision-safe.
  -- Guarded so a catalog seeded before this change is corrected too.
  UPDATE template_definition_table_fields
    SET is_unique = true, help_text = 'Assigned automatically if left blank -- you can change it; numbers must stay unique'
    WHERE template_table_id = v_leads_table_id AND field_key = 'lead_number' AND is_unique IS DISTINCT FROM true;

  -- ── Lead Activities ──────────────────────────────────────────────────
  -- Follow-up log: one row per touchpoint, linked back to its lead.
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'lead-activities', 'Lead Activities', 'PhoneCall', '#db2777', 'activity', 5
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'lead-activities');

  SELECT id INTO v_leadact_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'lead-activities';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_leadact_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('activity', 'Activity',        'text',           NULL::jsonb, NULL::text,       NULL::uuid,        NULL::text,        0),
    ('lead',     'Lead',            'table_relation', NULL::jsonb, NULL::text,       v_leads_table_id,  'lead_name'::text, 1),
    ('type',     'Type',            'select',         to_jsonb(ARRAY['Call','Email','Meeting','SMS','Letter','Other']), NULL::text, NULL::uuid, NULL::text, 2),
    ('date',     'Date',            'date',           NULL::jsonb, NULL::text,       NULL::uuid,        NULL::text,        3),
    ('done_by',  'Done By',         'entity',         NULL::jsonb, 'entities'::text, NULL::uuid,        'name',            4),
    ('outcome',  'Outcome / Notes', 'text',           NULL::jsonb, NULL::text,       NULL::uuid,        NULL::text,        5)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_leadact_table_id AND field_key = v.field_key
  );

  -- ── Dashboards ───────────────────────────────────────────────────────
  -- widgets_template uses field_key text (not ids) for every field
  -- reference -- see template_marketplace_dashboards.sql for how
  -- install_template_dashboards resolves these against the installed
  -- table's real fields. Layout (x/y/w/h) follows the same 12-col
  -- convention as lib/dashboardWidgets/defaults.ts.
  INSERT INTO template_definition_dashboards (template_id, source_template_table_id, name, slug, icon, color, display_order, widgets_template)
  SELECT v_template_id, v_timefees_table_id, 'Time Entry', 'time-entry', 'Clock', '#7c3aed', 0, '[
    {"id":"te1","type":"filter_bar","layout":{"x":0,"y":0,"w":12,"h":2},"config":{"fieldIds":["matter","staff"]}},
    {"id":"te2","type":"quick_add_form","layout":{"x":0,"y":2,"w":12,"h":2},"config":{"fieldIds":["date","matter","staff","task_code","activity_code","description","rate","duration_hours","amount","billable"]}},
    {"id":"te3","type":"summary_tile","layout":{"x":0,"y":4,"w":3,"h":2},"config":{"label":"Total hours","fieldId":"duration_hours","aggregate":"sum"}},
    {"id":"te4","type":"summary_tile","layout":{"x":3,"y":4,"w":3,"h":2},"config":{"label":"Billable amount","fieldId":"amount","aggregate":"sum","filterFieldId":"billable","filterValue":true}},
    {"id":"te5","type":"summary_tile","layout":{"x":6,"y":4,"w":3,"h":2},"config":{"label":"Unbilled (released)","fieldId":"amount","aggregate":"sum","filterFieldId":"status","filterValue":"Released"}},
    {"id":"te6","type":"summary_tile","layout":{"x":9,"y":4,"w":3,"h":2},"config":{"label":"Entries","fieldId":null,"aggregate":"count"}},
    {"id":"te7","type":"chart","layout":{"x":0,"y":6,"w":12,"h":4},"config":{"dateFieldId":"date","series":[{"label":"Billable Hours","valueFieldId":"duration_hours","aggregate":"sum","conditions":[{"fieldId":"billable","operator":"eq","value":true}],"axis":[{"name":"Type","choice":"Billable"},{"name":"Metric","choice":"Hours"}]},{"label":"Non-billable Hours","valueFieldId":"duration_hours","aggregate":"sum","conditions":[{"fieldId":"billable","operator":"eq","value":false}],"axis":[{"name":"Type","choice":"Non-billable"},{"name":"Metric","choice":"Hours"}]},{"label":"Billable Amount","valueFieldId":"amount","aggregate":"sum","conditions":[{"fieldId":"billable","operator":"eq","value":true}],"axis":[{"name":"Type","choice":"Billable"},{"name":"Metric","choice":"Amount"}]},{"label":"Non-billable Amount","valueFieldId":"amount","aggregate":"sum","conditions":[{"fieldId":"billable","operator":"eq","value":false}],"axis":[{"name":"Type","choice":"Non-billable"},{"name":"Metric","choice":"Amount"}]}]}},
    {"id":"te8","type":"grid","layout":{"x":0,"y":10,"w":12,"h":14},"config":{"fieldIds":["matter","staff","task_code","activity_code","description","rate","duration_hours","amount","billable","status","invoice"],"showTotalsRow":true,"emptyRowCount":5}},
    {"id":"te9","type":"my_tasks_button","layout":{"x":0,"y":24,"w":3,"h":2},"config":{"label":"","matterFieldId":"matter","descriptionFieldId":"description"}},
    {"id":"te10","type":"auto_time_recording_button","layout":{"x":3,"y":24,"w":3,"h":2},"config":{"label":""}},
    {"id":"te11","type":"time_fees_report","layout":{"x":0,"y":26,"w":12,"h":8},"config":{}},
    {"id":"te12","type":"time_aging_report","layout":{"x":0,"y":34,"w":12,"h":8},"config":{"agingDays":30}}
  ]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_dashboards WHERE template_id = v_template_id AND slug = 'time-entry');

  -- The generic "Trust Account" dashboard (admin-configurable widgets) is
  -- retired -- superseded by the bespoke /dashboard/trust-account page (see
  -- supabase/migrations/20260731100000_trust_account_page.sql), which reuses
  -- Trust Transactions and the three Trust*Widget.tsx report components
  -- directly rather than through the generic dashboard-widget system. This
  -- guards a fresh install from ever creating the old dashboard; the
  -- migration handles removing it for already-installed companies.
  DELETE FROM template_definition_dashboards WHERE template_id = v_template_id AND slug = 'trust-account';

  INSERT INTO template_definition_dashboards (template_id, source_template_table_id, name, slug, icon, color, display_order, widgets_template)
  SELECT v_template_id, v_invoices_table_id, 'Client Billing', 'client-billing', 'Receipt', '#0891b2', 2, '[
    {"id":"bi1","type":"filter_bar","layout":{"x":0,"y":0,"w":12,"h":2},"config":{"fieldIds":["matter","debtor"]}},
    {"id":"bi2","type":"quick_add_form","layout":{"x":0,"y":2,"w":12,"h":2},"config":{"fieldIds":["matter","debtor","issue_date","due_date","period_start","period_end","status"]}},
    {"id":"bi3","type":"summary_tile","layout":{"x":0,"y":4,"w":3,"h":2},"config":{"label":"Outstanding (sent)","fieldId":"amount_due","aggregate":"sum","filterFieldId":"status","filterValue":"Sent"}},
    {"id":"bi4","type":"summary_tile","layout":{"x":3,"y":4,"w":3,"h":2},"config":{"label":"Paid","fieldId":"total_inc_gst","aggregate":"sum","filterFieldId":"status","filterValue":"Paid"}},
    {"id":"bi5","type":"summary_tile","layout":{"x":6,"y":4,"w":3,"h":2},"config":{"label":"Total billed","fieldId":"total_inc_gst","aggregate":"sum"}},
    {"id":"bi6","type":"summary_tile","layout":{"x":9,"y":4,"w":3,"h":2},"config":{"label":"Invoices","fieldId":null,"aggregate":"count"}},
    {"id":"bi7","type":"chart","layout":{"x":0,"y":6,"w":12,"h":4},"config":{"dateFieldId":"issue_date","valueFieldId":"total_inc_gst","aggregate":"sum"}},
    {"id":"bi8","type":"grid","layout":{"x":0,"y":10,"w":12,"h":6},"config":{"fieldIds":["invoice_number","matter","debtor","issue_date","status","fees_total","disbursements_total","subtotal","gst","total_inc_gst","trust_applied","payments","amount_due"]}},
    {"id":"bi9","type":"ledes_export","layout":{"x":0,"y":16,"w":12,"h":6},"config":{}}
  ]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_dashboards WHERE template_id = v_template_id AND slug = 'client-billing');

  INSERT INTO template_definition_dashboards (template_id, source_template_table_id, name, slug, icon, color, display_order, widgets_template)
  SELECT v_template_id, v_leads_table_id, 'Leads', 'leads', 'UserPlus', '#16a34a', 3, '[
    {"id":"ld1","type":"filter_bar","layout":{"x":0,"y":0,"w":12,"h":2},"config":{"fieldIds":["person_responsible","date_received"]}},
    {"id":"ld2","type":"quick_add_form","layout":{"x":0,"y":2,"w":12,"h":2},"config":{"fieldIds":["lead_name","email","phone","matter_type","source","referred_by","status","person_responsible","date_received","next_follow_up"]}},
    {"id":"ld3","type":"summary_tile","layout":{"x":0,"y":4,"w":3,"h":2},"config":{"label":"New","fieldId":null,"aggregate":"count","filterFieldId":"status","filterValue":"New"}},
    {"id":"ld4","type":"summary_tile","layout":{"x":3,"y":4,"w":3,"h":2},"config":{"label":"Consultations booked","fieldId":null,"aggregate":"count","filterFieldId":"status","filterValue":"Consultation Booked"}},
    {"id":"ld5","type":"summary_tile","layout":{"x":6,"y":4,"w":3,"h":2},"config":{"label":"Converted","fieldId":null,"aggregate":"count","filterFieldId":"status","filterValue":"Converted"}},
    {"id":"ld6","type":"summary_tile","layout":{"x":9,"y":4,"w":3,"h":2},"config":{"label":"Leads","fieldId":null,"aggregate":"count"}},
    {"id":"ld7","type":"chart","layout":{"x":0,"y":6,"w":12,"h":4},"config":{"dateFieldId":"date_received","valueFieldId":null,"aggregate":"count"}},
    {"id":"ld8","type":"grid","layout":{"x":0,"y":10,"w":12,"h":6},"config":{"fieldIds":["lead_number","lead_name","email","phone","matter_type","source","status","person_responsible","date_received","next_follow_up","converted_matter"]}}
  ]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_dashboards WHERE template_id = v_template_id AND slug = 'leads');
END $$;
