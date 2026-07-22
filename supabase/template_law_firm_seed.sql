-- Seeds the "Law Firm" marketplace template (see template_marketplace.sql),
-- owned by Huynh Lawyers so Minh can keep extending it as its admin via the
-- template schema editor. Modeled on a real practice-management export
-- (Matters/Invoices/Billed & Unbilled Time & Fees/Disbursements), consolidated
-- down to: Matter fields on the existing `projects` system table (a Matter
-- *is* a project, not a separate custom table) + three new custom tables
-- (Invoices, Time & Fee Entries, Disbursements). "Billed" vs "unbilled" from
-- the source export collapses into a nullable Invoice link + Billable flag.
-- Idempotent -- safe to re-run; every insert is guarded by a natural-key
-- existence check.
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
BEGIN
  SELECT active_company_id INTO v_owner_company_id FROM profiles WHERE email = 'minh@huynhco.com';
  IF v_owner_company_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve an active company for minh@huynhco.com -- run this after that profile has an active_company_id set';
  END IF;

  -- ── Template shell ───────────────────────────────────────────────────
  INSERT INTO template_definitions (slug, name, description, industry, icon, color, owner_company_id, is_published, suggested_label_overrides)
  VALUES (
    'law-firm', 'Law Firm',
    'Matter fields on Projects, plus Invoices, Time & Fee Entries and Disbursements tables for a legal practice.',
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
    ('matter_number',          'Matter Number',              'text',   NULL::text[], NULL::text, NULL::text, 0),
    ('matter_type',            'Matter Type',                'select', ARRAY['Conveyancing','Family Law','Wills & Estates','Commercial','Litigation','Migration','Criminal','Other'], NULL::text, NULL::text, 1),
    ('billing_type',           'Billing Type',               'select', ARRAY['Time Based','Fixed Fee'], NULL::text, NULL::text, 2),
    ('client',                 'Client',                     'entity', NULL::text[], 'entities', 'name', 3),
    ('other_side',             'Other Side',                 'entity', NULL::text[], 'entities', 'name', 4),
    ('other_side_solicitor',   'Other Side''s Solicitor',    'entity', NULL::text[], 'entities', 'name', 5),
    ('debtor',                 'Debtor',                     'entity', NULL::text[], 'entities', 'name', 6),
    ('person_responsible',     'Person Responsible',         'entity', NULL::text[], 'entities', 'name', 7),
    ('person_assisting',       'Person Assisting',           'entity', NULL::text[], 'entities', 'name', 8)
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
    ('practising_certificate_number', 'Practising Certificate Number', 'text',   NULL::text[], 0),
    ('country_of_citizenship',        'Country of Citizenship',        'text',   NULL::text[], 1),
    ('drivers_licence_number',        'Driver''s Licence Number',      'text',   NULL::text[], 2),
    ('drivers_licence_state',         'Driver''s Licence State',       'select', ARRAY['NSW','VIC','QLD','WA','SA','TAS','ACT','NT'], 3)
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
    (template_table_id, field_key, label, field_type, linked_system_table, linked_display_field, display_order)
  SELECT v_invoices_table_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_display_field, v.display_order
  FROM (VALUES
    ('invoice_number', 'Invoice Number',    'text',     NULL::text, NULL::text, 0),
    ('matter',         'Matter',            'project',  'projects', 'name', 1),
    ('debtor',         'Debtor',            'entity',   'entities', 'name', 2),
    ('issue_date',     'Issue Date',        'date',     NULL::text, NULL::text, 3),
    ('due_date',       'Due Date',          'date',     NULL::text, NULL::text, 4),
    ('total_inc_gst',  'Total Inc. GST',    'currency', NULL::text, NULL::text, 5),
    ('amount_due',     'Amount Due',        'currency', NULL::text, NULL::text, 6),
    ('payments',       'Payments',          'currency', NULL::text, NULL::text, 7)
  ) AS v(field_key, label, field_type, linked_system_table, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_invoices_table_id AND field_key = v.field_key
  );

  -- ── Time & Fee Entries ───────────────────────────────────────────────
  -- Billed vs unbilled from the source export = Invoice link present/absent.
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'time-fee-entries', 'Time & Fee Entries', 'Clock', '#7c3aed', 'description', 1
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'time-fee-entries');

  SELECT id INTO v_timefees_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'time-fee-entries';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_timefees_table_id, v.field_key, v.label, v.field_type, v.select_options, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('matter',          'Matter',           'project',        NULL::text[], 'projects'::text, NULL::uuid,          'name'::text,  0),
    ('invoice',         'Invoice',          'table_relation',  NULL::text[], NULL::text,        v_invoices_table_id, 'invoice_number', 1),
    ('staff',           'Staff',            'entity',          NULL::text[], 'entities'::text,  NULL::uuid,          'name',        2),
    ('date',            'Date',             'date',            NULL::text[], NULL::text,        NULL::uuid,          NULL::text,    3),
    ('type',            'Type',             'select',          ARRAY['Time Based','Fixed Fee'], NULL::text, NULL::uuid, NULL::text,  4),
    ('description',     'Description',      'text',            NULL::text[], NULL::text,        NULL::uuid,          NULL::text,    5),
    ('rate',            'Rate',             'currency',        NULL::text[], NULL::text,        NULL::uuid,          NULL::text,    6),
    ('duration_hours',  'Duration Hours',   'number',          NULL::text[], NULL::text,        NULL::uuid,          NULL::text,    7),
    ('billable',        'Billable',         'boolean',         NULL::text[], NULL::text,        NULL::uuid,          NULL::text,    8)
  ) AS v(field_key, label, field_type, select_options, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_timefees_table_id AND field_key = v.field_key
  );

  -- ── Disbursements ────────────────────────────────────────────────────
  INSERT INTO template_definition_tables (template_id, slug, name, icon, color, primary_field_key, display_order)
  SELECT v_template_id, 'disbursements', 'Disbursements', 'Receipt', '#b45309', 'description', 2
  WHERE NOT EXISTS (SELECT 1 FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'disbursements');

  SELECT id INTO v_disb_table_id FROM template_definition_tables WHERE template_id = v_template_id AND slug = 'disbursements';

  INSERT INTO template_definition_table_fields
    (template_table_id, field_key, label, field_type, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  SELECT v_disb_table_id, v.field_key, v.label, v.field_type, v.linked_system_table, v.linked_template_table_id, v.linked_display_field, v.display_order
  FROM (VALUES
    ('matter',          'Matter',          'project',       'projects'::text, NULL::uuid,          'name'::text, 0),
    ('invoice',         'Invoice',         'table_relation', NULL::text,       v_invoices_table_id, 'invoice_number', 1),
    ('staff',           'Staff',           'entity',        'entities'::text, NULL::uuid,          'name', 2),
    ('date',            'Date',            'date',          NULL::text,       NULL::uuid,          NULL::text, 3),
    ('supplier_name',   'Supplier Name',   'text',          NULL::text,       NULL::uuid,          NULL::text, 4),
    ('description',     'Description',     'text',          NULL::text,       NULL::uuid,          NULL::text, 5),
    ('rate',            'Rate',            'currency',      NULL::text,       NULL::uuid,          NULL::text, 6),
    ('quantity',        'Quantity',        'number',        NULL::text,       NULL::uuid,          NULL::text, 7),
    ('gst_inclusive',   'GST Inclusive',   'boolean',       NULL::text,       NULL::uuid,          NULL::text, 8),
    ('billable',        'Billable',        'boolean',       NULL::text,       NULL::uuid,          NULL::text, 9)
  ) AS v(field_key, label, field_type, linked_system_table, linked_template_table_id, linked_display_field, display_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM template_definition_table_fields WHERE template_table_id = v_disb_table_id AND field_key = v.field_key
  );
END $$;
