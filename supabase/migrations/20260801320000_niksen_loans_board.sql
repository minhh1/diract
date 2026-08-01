SET request.jwt.claim.role = 'service_role';

-- A portfolio-wide "all loans, every project" detailed table, on the same
-- client_update_pages/MatterBoard system as the Entity Admin and
-- Irregularities boards -- the per-project Loans subtab (LoansSubtab.tsx)
-- only ever shows one project's loans at a time; this is the missing
-- cross-project view. base_table/record_table use the current generic
-- convention (company_tables.id as text -- see
-- 20260729210000_client_update_pages_visibility_teams_generic_record.sql),
-- not the older literal 'custom_table' string the original Irregularities
-- migration wrote before that refactor landed.
--
-- client_update_page_fields.field_type has no 'entity'/'project'/
-- 'table_relation' option (CHECK constraint only allows
-- text/select/date/number/currency/boolean/abn/acn -- confirmed via
-- 20260729310000) -- Project/Borrower are marked 'text' and resolved to
-- their plain display name by lib/clientUpdatePageDetail.ts, same as the
-- Irregularities board's own 'Name' (entity) column.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_source_table_id uuid;
  v_page_id uuid;
  v_f_project uuid; v_f_name uuid; v_f_lender_type uuid; v_f_borrower uuid;
  v_f_principal uuid; v_f_start uuid; v_f_repayment uuid; v_f_security uuid;
  v_f_discharged uuid; v_f_notes uuid;
BEGIN
  SELECT id INTO v_source_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-loans' AND deleted_at IS NULL;
  IF v_source_table_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-loans table not found for company %', v_company_id;
  END IF;

  SELECT id INTO v_page_id FROM client_update_pages WHERE company_id = v_company_id AND slug = 'niksen-loans';
  IF v_page_id IS NULL THEN
    INSERT INTO client_update_pages (company_id, title, client_label, slug, access_code, is_active, date_format, freeze_first_column, base_table, source_table_id)
    VALUES (v_company_id, 'Niksen Loans', 'Niksen Admin', 'niksen-loans', lpad(floor(random() * 1000000)::text, 6, '0'), true, 'D_MMM_YYYY', true, v_source_table_id::text, v_source_table_id)
    RETURNING id INTO v_page_id;
  END IF;

  SELECT id INTO v_f_project     FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'project' AND deleted_at IS NULL;
  SELECT id INTO v_f_name        FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'name' AND deleted_at IS NULL;
  SELECT id INTO v_f_lender_type FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'lender_type' AND deleted_at IS NULL;
  SELECT id INTO v_f_borrower    FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'borrower' AND deleted_at IS NULL;
  SELECT id INTO v_f_principal   FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'principal_amount' AND deleted_at IS NULL;
  SELECT id INTO v_f_start       FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'start_date' AND deleted_at IS NULL;
  SELECT id INTO v_f_repayment   FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'repayment_date' AND deleted_at IS NULL;
  SELECT id INTO v_f_security    FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'security' AND deleted_at IS NULL;
  SELECT id INTO v_f_discharged  FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'is_discharged' AND deleted_at IS NULL;
  SELECT id INTO v_f_notes       FROM company_table_fields WHERE table_id = v_source_table_id AND field_key = 'notes' AND deleted_at IS NULL;

  INSERT INTO client_update_page_fields (page_id, field_source, field_key, label, display_order, client_visible, field_type, select_options)
  SELECT v_page_id, 'base', v.field_id, v.label, v.ord, true, v.field_type, v.select_options
  FROM (VALUES
    (v_f_project,     'Project',         0, 'text',     NULL::jsonb),
    (v_f_name,        'Name',            1, 'text',     NULL::jsonb),
    (v_f_lender_type, 'Lender Type',     2, 'select',   '["Senior","Mezzanine","Money Partner","Other"]'::jsonb),
    (v_f_borrower,    'Borrower',        3, 'text',     NULL::jsonb),
    (v_f_principal,   'Principal',       4, 'currency', NULL::jsonb),
    (v_f_start,       'Start Date',      5, 'date',     NULL::jsonb),
    (v_f_repayment,   'Repayment Date',  6, 'date',     NULL::jsonb),
    (v_f_security,    'Security',        7, 'text',     NULL::jsonb),
    (v_f_discharged,  'Discharged',      8, 'boolean',  NULL::jsonb),
    (v_f_notes,       'Notes',           9, 'text',     NULL::jsonb)
  ) AS v(field_id, label, ord, field_type, select_options)
  WHERE v.field_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM client_update_page_fields x WHERE x.page_id = v_page_id AND x.field_source = 'base' AND x.field_key = v.field_id::text);

  -- Seed items for every loan that already exists.
  INSERT INTO client_update_page_items (page_id, record_table, record_id, display_order)
  SELECT v_page_id, v_source_table_id::text, r.id, row_number() OVER (ORDER BY r.created_at)
  FROM company_table_records r
  WHERE r.table_id = v_source_table_id AND r.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM client_update_page_items x WHERE x.page_id = v_page_id AND x.record_table = v_source_table_id::text AND x.record_id = r.id);

  -- Dashboard nav entry, restricted to Niksen's Administration Team +
  -- admins, matching the Irregularities/Entity Admin boards' own pattern.
  IF NOT EXISTS (SELECT 1 FROM company_dashboards WHERE company_id = v_company_id AND slug = 'niksen-loans' AND deleted_at IS NULL) THEN
    INSERT INTO company_dashboards (company_id, name, slug, icon, color, source_table_type, widgets, restricted_to_team_id, builder_mode)
    SELECT v_company_id, 'Loans', 'niksen-loans', 'Landmark', '#f59e0b', 'none',
      jsonb_build_array(jsonb_build_object(
        'id', 'loans-board', 'type', 'public_client_update_page',
        'layout', jsonb_build_object('x', 0, 'y', 0, 'w', 12, 'h', 20),
        'config', jsonb_build_object('slug', 'niksen-loans')
      )),
      (SELECT id FROM teams WHERE company_id = v_company_id AND team_name = 'Administration Team'),
      'canvas';
  END IF;
END $$;
