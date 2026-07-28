SET request.jwt.claim.role = 'service_role';

-- Niksen Time's "Entity Admin" board -- an entities-based Client Update
-- Page (see supabase/migrations/20260729080000_client_update_pages_entities_base_table.sql),
-- staff-only (no public link is ever generated/shared, though the PIN
-- infrastructure still technically exists per the base feature). Company,
-- Corporate Trustee, and the 3 trust entity_types are seeded as items --
-- Individual (director) and Local Council entities are excluded, they
-- aren't primary register entries for this board.

DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_page_id uuid;
  v_gst_freq_id uuid;
  v_bank_name_cf_id uuid;
  v_xero_id uuid;
  v_service_agreement_id uuid;
BEGIN
  SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = v_company_id AND slug = 'niksen-entity-admin';
  IF v_page_id IS NULL THEN
    INSERT INTO client_update_pages (company_id, title, client_label, slug, access_code, is_active, date_format, freeze_first_column, base_table)
    VALUES (v_company_id, 'Niksen Entity Admin', 'Niksen Admin', 'niksen-entity-admin', lpad(floor(random() * 1000000)::text, 6, '0'), true, 'D_MMM_YYYY', true, 'entities')
    RETURNING id INTO v_page_id;
  END IF;

  SELECT id INTO v_gst_freq_id FROM company_custom_fields WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'gst_report_frequency' AND deleted_at IS NULL;
  SELECT id INTO v_bank_name_cf_id FROM company_custom_fields WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'bank_account_name' AND deleted_at IS NULL;
  SELECT id INTO v_xero_id FROM company_custom_fields WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'xero_bank_feed' AND deleted_at IS NULL;
  SELECT id INTO v_service_agreement_id FROM company_custom_fields WHERE company_id = v_company_id AND table_name = 'entities' AND field_key = 'service_agreement_with_niksen' AND deleted_at IS NULL;

  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type)
  SELECT v_page_id, v.field_source, v.field_key, v.label, v.ord, true, v.field_type
  FROM (VALUES
    ('base', 'name', 'Name', 0, 'text'),
    ('base', 'entity_type', 'Entity Type', 1, 'text'),
    ('base', 'established_date', 'Established Date', 2, 'text'),
    ('base', 'acn', 'ACN', 3, 'text'),
    ('base', 'abn', 'ABN', 4, 'text'),
    ('base', 'tfn', 'TFN', 5, 'text'),
    ('base', 'gst_registered', 'GST Registered', 6, 'boolean'),
    ('base', 'trust_deed_date', 'Trust Deed Date', 7, 'date'),
    ('base', 'bank_name', 'Bank (Institution)', 8, 'text'),
    ('base', 'bsb', 'Bank BSB', 9, 'text'),
    ('base', 'account_number', 'Bank Account Number', 10, 'text'),
    ('base', 'nab_connect_id', 'NAB Connect Linked', 11, 'text')
  ) AS v(field_source, field_key, label, ord, field_type)
  WHERE NOT EXISTS (SELECT 1 FROM client_update_page_fields x WHERE x.page_id = v_page_id AND x.field_source = v.field_source AND x.field_key = v.field_key);

  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
  SELECT v_page_id, 'custom', v.field_id, v.label, v.ord, true, v.field_type, v.select_options
  FROM (VALUES
    (v_gst_freq_id, 'GST Report Frequency', 12, 'select', '["Monthly","Quarterly","Annually"]'::jsonb),
    (v_bank_name_cf_id, 'Bank Account Name', 13, 'text', NULL::jsonb),
    (v_xero_id, 'Xero Bank Feed', 14, 'text', NULL::jsonb),
    (v_service_agreement_id, 'Service Agreement', 15, 'text', NULL::jsonb)
  ) AS v(field_id, label, ord, field_type, select_options)
  WHERE v.field_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM client_update_page_fields x WHERE x.page_id = v_page_id AND x.field_source = 'custom' AND x.field_key = v.field_id::text);

  INSERT INTO client_update_page_items (page_id, entity_id, display_order)
  SELECT v_page_id, e.id, row_number() OVER (ORDER BY e.name)
  FROM entities e
  WHERE e.company_id = v_company_id AND e.deleted_at IS NULL
    AND e.entity_type IN ('Company', 'Corporate Trustee', 'Fixed Unit Trust', 'Unit Trust', 'Discretionary Family Trust')
    AND NOT EXISTS (SELECT 1 FROM client_update_page_items x WHERE x.page_id = v_page_id AND x.entity_id = e.id);

  -- Dashboard widget, restricted to Niksen's Administration Team + admins --
  -- same pattern as the Irregularities dashboard.
  IF NOT EXISTS (SELECT 1 FROM company_dashboards WHERE company_id = v_company_id AND slug = 'niksen-entity-admin' AND deleted_at IS NULL) THEN
    INSERT INTO company_dashboards (company_id, name, slug, icon, color, source_table_type, widgets, restricted_to_team_id, builder_mode)
    SELECT v_company_id, 'Entity Admin', 'niksen-entity-admin', 'Building2', '#6366f1', 'none',
      jsonb_build_array(jsonb_build_object(
        'id', 'entity-admin-board', 'type', 'public_client_update_page',
        'layout', jsonb_build_object('x', 0, 'y', 0, 'w', 12, 'h', 20),
        'config', jsonb_build_object('slug', 'niksen-entity-admin')
      )),
      (SELECT id FROM teams WHERE company_id = v_company_id AND team_name = 'Administration Team'),
      'canvas';
  END IF;
END $$;
