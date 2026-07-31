SET request.jwt.claim.role = 'service_role';

-- Budgeted figures for a property development project's Finance Model
-- (components/dashboard/tabs/FinanceModelTab.tsx) -- one row per line item
-- (e.g. "Stamp duty", "Slab & frame"), manually entered since most predate
-- any Xero transaction (land cost, stamp duty) or Xero simply isn't the
-- source of truth for a pre-settlement budget. xero_account_code is
-- optional -- when set, actuals for this line are summed from bank
-- transactions whose LineItems[].AccountCode matches it (see
-- app/api/xero/finance-model/route.ts); when unset, the line is budget-only
-- (no automatic actual).
CREATE TABLE finance_model_budget_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('Acquisition', 'Construction', 'Professional Fees', 'Finance Costs', 'Contingency', 'Revenue', 'Other')),
  label text NOT NULL,
  budgeted_amount numeric NOT NULL DEFAULT 0,
  xero_account_code text,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX finance_model_budget_lines_entity_idx ON finance_model_budget_lines (entity_id);

ALTER TABLE finance_model_budget_lines ENABLE ROW LEVEL SECURITY;

-- Same single-policy, active_company_id()-scoped shape as record_tabs --
-- Finance Model data isn't more sensitive than the rest of a company's
-- entity records, and app/api routes already gate writes to admins where
-- that matters (see authorizeCompanyMember()'s isAdmin flag used elsewhere).
CREATE POLICY finance_model_budget_lines_company ON finance_model_budget_lines
  FOR ALL USING (company_id = active_company_id());
