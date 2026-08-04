SET request.jwt.claim.role = 'service_role';

-- run_employee_payslip(): the one-employee unit of work behind "Run Pay"
-- (app/api/pay-runs/run/route.ts calls this once per employee in a loop,
-- same resilience shape as submit_auto_time_entry/time-entries/submit --
-- one employee missing bank details or hitting a duplicate-run error
-- doesn't block the rest of the batch).
--
-- Two guarantees, both enforced by real constraints inside one transaction,
-- not app-level check-then-write:
--   1. The payslip itself goes through insert_ledger_record() (see
--      supabase/company_table_ledger.sql), so it's append-only and gets its
--      PS-{YYYY}-000001 number for free -- same mechanism Trust Transactions
--      already relies on.
--   2. Re-running a pay run can never double-pay the same employee: this
--      claims (pay_run, employee) in payroll_payslip_claims BEFORE
--      returning, and that table's UNIQUE constraint makes a duplicate call
--      raise and roll back the whole transaction -- including the payslip
--      insert that already happened above it. Exact same "insert first,
--      claim second, let the constraint undo both on conflict" shape as
--      submit_auto_time_entry's source-claim.
CREATE TABLE IF NOT EXISTS payroll_payslip_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pay_run_record_id uuid NOT NULL,
  employee_record_id uuid NOT NULL,
  payslip_record_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pay_run_record_id, employee_record_id)
);

ALTER TABLE payroll_payslip_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payroll_payslip_claims_read ON payroll_payslip_claims;
CREATE POLICY payroll_payslip_claims_read ON payroll_payslip_claims
  FOR SELECT
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION run_employee_payslip(
  p_company_id uuid,
  p_payslips_table_id uuid,
  p_pay_run_id uuid,
  p_employee_id uuid,
  p_period_start date,
  p_period_end date,
  p_hours numeric,
  p_gross_pay numeric,
  p_tax_withheld numeric,
  p_super_amount numeric,
  p_net_pay numeric,
  p_ytd_gross numeric,
  p_ytd_tax_withheld numeric,
  p_ytd_super numeric,
  p_issued_date date,
  p_timesheet_ids uuid[],
  p_timesheet_status_field_id uuid,
  p_timesheet_payrun_field_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  p_actor uuid := auth.uid();
  v_payslip_values jsonb;
  v_ledger_result jsonb;
  v_payslip_id uuid;
  v_ts_id uuid;
  v_company_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT EXISTS (
    SELECT 1 FROM company_memberships WHERE company_id = p_company_id AND user_id = p_actor
  ) THEN
    RAISE EXCEPTION 'not a member of this company';
  END IF;

  SELECT company_id INTO v_company_id FROM company_tables WHERE id = p_payslips_table_id;
  IF v_company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'payslips table does not belong to this company';
  END IF;

  v_payslip_values := jsonb_build_object(
    'employee', p_employee_id::text,
    'pay_run', p_pay_run_id::text,
    'period_start', p_period_start::text,
    'period_end', p_period_end::text,
    'hours', p_hours::text,
    'gross_pay', p_gross_pay::text,
    'tax_withheld', p_tax_withheld::text,
    'super_amount', p_super_amount::text,
    'net_pay', p_net_pay::text,
    'ytd_gross', p_ytd_gross::text,
    'ytd_tax_withheld', p_ytd_tax_withheld::text,
    'ytd_super', p_ytd_super::text,
    'issued_date', p_issued_date::text
  );

  v_ledger_result := insert_ledger_record(p_payslips_table_id, v_payslip_values);
  v_payslip_id := (v_ledger_result->>'id')::uuid;

  -- Claim (pay_run, employee) -- a concurrent or repeated run for the same
  -- pair violates the UNIQUE constraint and rolls back everything above,
  -- including the payslip just inserted.
  INSERT INTO payroll_payslip_claims (company_id, pay_run_record_id, employee_record_id, payslip_record_id)
    VALUES (p_company_id, p_pay_run_id, p_employee_id, v_payslip_id);

  -- Mark the consumed timesheet rows Paid and tag them with this pay run,
  -- so they stop showing up as "unconsumed hours" for the next run.
  FOREACH v_ts_id IN ARRAY COALESCE(p_timesheet_ids, ARRAY[]::uuid[]) LOOP
    INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_text)
      SELECT p_company_id, table_id, v_ts_id, p_timesheet_status_field_id, 'Paid'
      FROM company_table_records WHERE id = v_ts_id
      ON CONFLICT (record_id, field_id) DO UPDATE SET value_text = EXCLUDED.value_text;

    INSERT INTO company_table_values (company_id, table_id, record_id, field_id, value_record_id)
      SELECT p_company_id, table_id, v_ts_id, p_timesheet_payrun_field_id, p_pay_run_id
      FROM company_table_records WHERE id = v_ts_id
      ON CONFLICT (record_id, field_id) DO UPDATE SET value_record_id = EXCLUDED.value_record_id;
  END LOOP;

  RETURN v_ledger_result;
END;
$$;
