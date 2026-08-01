SET request.jwt.claim.role = 'service_role';

-- "Interest to" date on a Finance Model loan: the date the loan's
-- interest should be COSTED to when it's linked into the project budget
-- (lib/loanCalculator.ts's `until` parameter). A development facility is
-- written over a long contractual term -- 30 years is normal -- but is
-- repaid out of settlement proceeds when the project completes, so
-- budgeting the full-term interest overstates finance costs by an order
-- of magnitude (a real case: $874k over the contractual term vs the
-- ~2-year build the project actually runs for).
--
-- NULL means "fall back to the project's Timeline completion date" (the
-- latest task due date, computed at read time -- deliberately not copied
-- in here, so the baseline keeps tracking the Timeline as it moves).
-- A value means the user has overridden it, e.g. to extend past
-- completion for a settlement/sell-down tail.
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables
   WHERE company_id = v_company_id AND slug = 'finance-model-loans' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-loans table not found for company %', v_company_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, show_in_table, display_order)
  SELECT v_company_id, v_table_id, 'interest_to_date', 'Interest Costed To', 'date', false, true, 15
  WHERE NOT EXISTS (
    SELECT 1 FROM company_table_fields x
     WHERE x.table_id = v_table_id AND x.field_key = 'interest_to_date' AND x.deleted_at IS NULL
  );
END $$;
