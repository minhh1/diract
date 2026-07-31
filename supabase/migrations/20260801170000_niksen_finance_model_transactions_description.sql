SET request.jwt.claim.role = 'service_role';

-- lib/xero/syncFinanceModelTransactions.ts previously conflated the
-- top-level Xero `Reference` and the line-item `Description` into one
-- `reference` field (discarding Description whenever Reference was set),
-- and never captured the Contact's stable ContactID (only its display
-- name, which breaks the link silently if a contact is renamed in Xero).
-- This adds the two missing fields to the existing Finance Model
-- Transactions table; the sync function is updated separately to
-- populate them going forward (existing rows keep NULL until re-synced).
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-transactions' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-transactions table not found for company %', v_company_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, false, true, v.ord
  FROM (VALUES
    ('description', 'Description', 'text', 9),
    ('contact_id', 'Contact ID (Xero)', 'text', 10)
  ) AS v(field_key, label, field_type, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);

  -- Widen the Finance Model Classification Rules table's match_field
  -- options -- Description is often more informative for matching than
  -- Reference (e.g. "STRIPE PAYOUT" vs a bare invoice number).
  UPDATE company_table_fields
  SET select_options = '["Contact","Reference","Description"]'::jsonb
  WHERE company_id = v_company_id
    AND field_key = 'match_field'
    AND deleted_at IS NULL
    AND table_id = (SELECT id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-classification-rules' AND deleted_at IS NULL);
END $$;
