SET request.jwt.claim.role = 'service_role';

-- Links a transaction to a Loan (finance-model-loans row id, plain text
-- field storing an id string -- same lightweight pattern as Budget
-- Lines' linked_task_id/linked_task_ids, not the generic table_relation
-- field system) so LoansSubtab.tsx can show actual repayments (summed
-- from matched transactions) alongside the calculated schedule
-- (lib/loanCalculator.ts).
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
  SELECT v_company_id, v_table_id, 'loan_id', 'Loan', 'text', false, true, 11
  WHERE NOT EXISTS (SELECT 1 FROM company_table_fields x WHERE x.table_id = v_table_id AND x.field_key = 'loan_id' AND x.deleted_at IS NULL);
END $$;
