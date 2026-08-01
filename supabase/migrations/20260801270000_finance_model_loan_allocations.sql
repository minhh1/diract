SET request.jwt.claim.role = 'service_role';

-- Lets a single Finance Model loan (a "finance-model-loans" custom-table
-- row) be shared across more than one project -- e.g. one construction
-- facility funding two adjoining sites, split by an agreed proportion.
-- loan_id references company_table_records(id) directly (the generic
-- custom-table row store every custom-table row lives in, regardless of
-- which table's schema it belongs to -- see lib/customTableAdmin.ts)
-- rather than a typed "loans" table, since Finance Model Loans is itself a
-- custom table (supabase/migrations/20260731310000_niksen_finance_model_
-- v2_tables.sql).
--
-- A loan with ZERO rows here is unsplit -- 100% attributed to its home
-- project (the loan row's own `project` relation field), exactly as
-- before this table existed, so every loan already in the app keeps
-- working unchanged. Only once a second project is added does a real
-- split exist. split_percent is always stored explicitly per row (not
-- inferred from a "mode") so downstream readers never need mode-aware
-- logic -- an "Equal split" action in the UI just writes 100/N to every
-- row's split_percent, the same shape as any manual custom entry.
CREATE TABLE IF NOT EXISTS finance_model_loan_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id uuid NOT NULL REFERENCES company_table_records(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  split_percent numeric NOT NULL CHECK (split_percent > 0 AND split_percent <= 100),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loan_id, project_id)
);

CREATE INDEX IF NOT EXISTS finance_model_loan_allocations_loan_id_idx ON finance_model_loan_allocations(loan_id);
CREATE INDEX IF NOT EXISTS finance_model_loan_allocations_project_id_idx ON finance_model_loan_allocations(project_id);

ALTER TABLE finance_model_loan_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_model_loan_allocations_company_members ON finance_model_loan_allocations;
CREATE POLICY finance_model_loan_allocations_company_members ON finance_model_loan_allocations
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));
