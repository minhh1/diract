SET request.jwt.claim.role = 'service_role';

-- Two independent additions to Budget Lines:
--
-- linked_source: marks a line as auto-synced FROM a calculator (Duty &
-- Fees' stamp duty/title fees, or a Loan's calculated total interest)
-- instead of a plain manually-entered number. Values: "stamp_duty",
-- "title_transfer_fee", "title_mortgage_fee", or "loan:<loanId>". The
-- line's budgeted_amount is still the real stored number every other
-- reader (BudgetVsActualTable, cashFlowEngine, feasibilityCalculator's
-- P&L) already assumes -- linked_source just means DutyFeesSubtab.tsx /
-- LoansSubtab.tsx re-PATCH it to the freshly-computed value on load,
-- instead of the old one-shot "Add to budget" push that then drifted out
-- of sync silently. NOT a live-computed field -- avoids rippling
-- computed-vs-stored semantics through the ~10 other places that read
-- budgeted_amount as a plain number.
--
-- linked_task_ids: a JSON array of tasks.id strings, for "which tasks
-- deliver this cost line" -- distinct from the existing linked_task_id
-- (singular), which drives cash-flow TIMING. Same plain-text-field
-- pattern as linked_task_id (see 20260801180000_niksen_budget_lines_timing.sql's
-- comment for why this isn't the generic relation-field system: tasks
-- isn't a custom table).
DO $$
DECLARE
  v_company_id uuid := '32d4fb0e-007d-41e7-bc5e-638163c28e3d';
  v_table_id uuid;
BEGIN
  SELECT id INTO v_table_id FROM company_tables WHERE company_id = v_company_id AND slug = 'finance-model-budget-lines' AND deleted_at IS NULL;
  IF v_table_id IS NULL THEN
    RAISE EXCEPTION 'finance-model-budget-lines table not found for company %', v_company_id;
  END IF;

  INSERT INTO company_table_fields (company_id, table_id, field_key, label, field_type, is_required, show_in_table, display_order)
  SELECT v_company_id, v_table_id, v.field_key, v.label, v.field_type, false, true, v.ord
  FROM (VALUES
    ('linked_source', 'Linked Source', 'text', 10),
    ('linked_task_ids', 'Related Tasks', 'text', 11)
  ) AS v(field_key, label, field_type, ord)
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = v.field_key AND x.deleted_at IS NULL);
END $$;
