-- Nine conveyancing-specific Matter fields (deposits, key conveyancing
-- dates) requested for Huynh Lawyers' client-update reporting. Purchase
-- Price and Settlement Date are deliberately NOT new fields here --
-- Purchase Price reuses properties.purchase_price (already exists, see
-- lib/columnDefinitions.ts PROPERTY_COLUMNS), and Settlement Date reuses
-- projects.estimated_completion_date with a per-record display-label
-- override for Conveyancing matters (see lib/fieldLabels.ts) rather than a
-- new column.
--
-- Two idempotent inserts:
--  1. template_definition_system_fields, so future "Law Firm" template
--     installs get these fields too (mirrors supabase/template_law_firm_seed.sql).
--  2. company_custom_fields, direct for Huynh Lawyers (the only company using
--     this right now) since installing the template again would not
--     retroactively add fields to an already-installed company.

DO $$
DECLARE
  v_template_id uuid;
  v_huynh_company_id uuid;
BEGIN
  SELECT id INTO v_template_id FROM template_definitions WHERE slug = 'law-firm';
  SELECT id INTO v_huynh_company_id FROM companies WHERE name = 'Huynh Lawyers';

  IF v_template_id IS NOT NULL THEN
    INSERT INTO template_definition_system_fields
      (template_id, table_name, field_key, label, field_type, select_options, linked_table, linked_display_column, section_name, display_order)
    SELECT v_template_id, 'projects', v.field_key, v.label, v.field_type, NULL::jsonb, NULL::text, NULL::text, 'Conveyancing', v.display_order
    FROM (VALUES
      ('initial_deposit',              'Initial Deposit',                'currency', 0),
      ('initial_deposit_payment_date', 'Initial Deposit Payment Date',   'date',     1),
      ('balance_deposit',              'Balance of Deposit',             'currency', 2),
      ('balance_deposit_payment_date', 'Balance of Deposit Payment Date','date',     3),
      ('total_deposit_paid',           'Total Deposit Paid',             'currency', 4),
      ('due_diligence_date',           'Due Diligence Date',             'date',     5),
      ('finance_date',                 'Finance Date',                   'date',     6),
      ('building_inspection_date',     'Building Inspection Date',       'date',     7),
      ('cooling_off_expiry_date',      'Cooling Off Expiry Date',        'date',     8)
    ) AS v(field_key, label, field_type, display_order)
    WHERE NOT EXISTS (
      SELECT 1 FROM template_definition_system_fields
      WHERE template_id = v_template_id AND table_name = 'projects' AND field_key = v.field_key
    );
  END IF;

  IF v_huynh_company_id IS NOT NULL THEN
    INSERT INTO company_custom_fields
      (company_id, table_name, field_key, label, field_type, section_name, display_order, is_required)
    SELECT v_huynh_company_id, 'projects', v.field_key, v.label, v.field_type, 'Conveyancing', v.display_order, false
    FROM (VALUES
      ('initial_deposit',              'Initial Deposit',                'currency', 0),
      ('initial_deposit_payment_date', 'Initial Deposit Payment Date',   'date',     1),
      ('balance_deposit',              'Balance of Deposit',             'currency', 2),
      ('balance_deposit_payment_date', 'Balance of Deposit Payment Date','date',     3),
      ('total_deposit_paid',           'Total Deposit Paid',             'currency', 4),
      ('due_diligence_date',           'Due Diligence Date',             'date',     5),
      ('finance_date',                 'Finance Date',                   'date',     6),
      ('building_inspection_date',     'Building Inspection Date',       'date',     7),
      ('cooling_off_expiry_date',      'Cooling Off Expiry Date',        'date',     8)
    ) AS v(field_key, label, field_type, display_order)
    WHERE NOT EXISTS (
      SELECT 1 FROM company_custom_fields
      WHERE company_id = v_huynh_company_id AND table_name = 'projects' AND field_key = v.field_key AND deleted_at IS NULL
    );
  END IF;
END $$;
