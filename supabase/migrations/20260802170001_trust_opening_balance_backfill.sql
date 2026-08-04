-- One-time data correction for Huynh Lawyers' 8 trust ledger opening-balance
-- rows (TR-000002 through TR-000009, "Opening balance brought forward from
-- previous trust accounting system") -- they were imported with no
-- Received From / Form of Funds recorded. Deliberately a hardcoded,
-- reviewable, one-time backfill of specific known record ids -- NOT a
-- general-purpose "edit any ledger field" RPC. Trust Transactions is
-- append-only for exactly this reason (Legal Profession Uniform General
-- Rules 2015 r 40): exposing an open-ended backfill capability to the app
-- would undermine that guarantee for ongoing use. A migration file is the
-- right shape for a genuine one-off correction -- it's version-controlled,
-- reviewed, and it's the only place this bypass is used.
DO $$
DECLARE
  v_company_id uuid := 'a49b484d-100d-4c3e-b3b6-69c1a18cc783'; -- Huynh Lawyers
  v_table_id uuid;
  v_payor_field_id uuid;
  v_method_field_id uuid;
  v_entity_id uuid;
  v_record_id uuid;
  v_record_ids uuid[] := ARRAY[
    '4a0e293e-8de6-433c-a877-b05131d3c2c0', -- TR-000002
    'b1394876-7472-4bef-ab52-86f6778268b7', -- TR-000003
    '9aba1cb8-58e8-44de-bb16-a415efc4a5fe', -- TR-000004
    '0af01fae-8e08-432a-83dc-7a0a797610a4', -- TR-000005
    '748e0a10-733b-4ae9-a76c-5a053bd87dc3', -- TR-000006
    'a58a8194-a42e-4ce4-b8b6-efe0940a2d83', -- TR-000007
    '6e195c30-48cc-4be6-b478-93f6a9c3128c', -- TR-000008
    'ec2b3458-5f5b-412c-a3c8-7196a47c1c94'  -- TR-000009
  ]::uuid[];
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE slug = 'trust-transactions' AND company_id = v_company_id AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN RAISE EXCEPTION 'trust-transactions table not found for Huynh Lawyers'; END IF;

  SELECT id INTO v_payor_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'payor_payee' AND deleted_at IS NULL;
  SELECT id INTO v_method_field_id FROM company_table_fields WHERE table_id = v_table_id AND field_key = 'payment_method' AND deleted_at IS NULL;

  -- "Funds remained in Bank Account" -- an opening balance carried forward
  -- isn't a Bank Transfer/Cash/Cheque/Credit Card deposit, so none of the
  -- existing options describe it. Additive to both the live field and the
  -- template catalog (template_law_firm_seed.sql mirrors this for fresh
  -- installs).
  UPDATE company_table_fields
  SET select_options = select_options || '["Funds remained in Bank Account"]'::jsonb
  WHERE id = v_method_field_id AND NOT (select_options ? 'Funds remained in Bank Account');

  UPDATE template_definition_table_fields tdtf
  SET select_options = select_options || '["Funds remained in Bank Account"]'::jsonb
  FROM template_definition_tables tdt, template_definitions td
  WHERE tdtf.template_table_id = tdt.id AND tdt.template_id = td.id
    AND td.slug = 'law-firm' AND tdt.name = 'Trust Transactions' AND tdtf.field_key = 'payment_method'
    AND NOT (tdtf.select_options ? 'Funds remained in Bank Account');

  -- "Huynh and Company Pty Ltd" -- the entity these opening balances were
  -- received from (the firm's own incorporated practice entity, holding
  -- client funds under the previous trust accounting system).
  SELECT id INTO v_entity_id FROM entities WHERE company_id = v_company_id AND name = 'Huynh and Company Pty Ltd' AND deleted_at IS NULL;
  IF v_entity_id IS NULL THEN
    INSERT INTO entities (company_id, name, entity_type, registered_address_text)
    VALUES (v_company_id, 'Huynh and Company Pty Ltd', 'Company', '6 Middlemiss Street, Lavender Bay NSW 2060')
    RETURNING id INTO v_entity_id;
  ELSIF (SELECT registered_address_text FROM entities WHERE id = v_entity_id) IS NULL THEN
    UPDATE entities SET registered_address_text = '6 Middlemiss Street, Lavender Bay NSW 2060' WHERE id = v_entity_id;
  END IF;

  -- Backfill payor_payee/payment_method on the 8 known rows -- append-only
  -- guard (guard_ledger_records(), see company_table_ledger.sql) only
  -- respects app.ledger_write on INSERT, and unconditionally blocks UPDATE
  -- -- both fields are currently unset for these rows (no existing value
  -- row), so this is an INSERT of a new field value, never a rewrite of one
  -- that already exists.
  PERFORM set_config('app.ledger_write', 'on', true);

  FOREACH v_record_id IN ARRAY v_record_ids LOOP
    IF NOT EXISTS (SELECT 1 FROM company_table_values WHERE record_id = v_record_id AND field_id = v_payor_field_id) THEN
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
        VALUES (v_company_id, v_table_id, v_record_id, v_payor_field_id, 'Huynh and Company Pty Ltd');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM company_table_values WHERE record_id = v_record_id AND field_id = v_method_field_id) THEN
      INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
        VALUES (v_company_id, v_table_id, v_record_id, v_method_field_id, 'Funds remained in Bank Account');
    END IF;

    INSERT INTO company_table_record_log (company_id, table_id, record_id, actor_id, action, after)
      VALUES (v_company_id, v_table_id, v_record_id, NULL, 'backfill_opening_balance', jsonb_build_object(
        'payor_payee', 'Huynh and Company Pty Ltd', 'payment_method', 'Funds remained in Bank Account'
      ));
  END LOOP;
END $$;
