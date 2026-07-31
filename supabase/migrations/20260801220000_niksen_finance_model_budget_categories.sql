SET request.jwt.claim.role = 'service_role';

-- Per-company budget-line categories -- replaces the hardcoded 7-value
-- list previously baked into app/api/finance-model/budget-lines/route.ts
-- and every UI component's own copy of it (OverviewSubtab.tsx,
-- FeasibilitySubtab.tsx). Lives as a plain top-level table (not a custom
-- table) since it needs a "kind" attribute the generic custom-table
-- select-field system doesn't carry, and it's shared config across every
-- project in the company, not project-scoped data.
--
-- "Revenue" (kind = 'Revenue') is a protected, singular category --
-- lib/cashFlowEngine.ts, lib/sensitivityEngine.ts, and
-- BudgetVsActualTable.tsx's sign convention all key off the literal
-- string "Revenue" to decide cash-in vs cash-out; refactoring every one
-- of those call sites to look up a category's kind dynamically is a
-- materially bigger change than what "user-extensible categories" asked
-- for. So: the Revenue row can't be renamed or deleted, but every Cost
-- category is fully user-managed (add/rename/reorder/delete/toggle GST
-- creditability).
CREATE TABLE IF NOT EXISTS finance_model_budget_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('Revenue', 'Cost')),
  is_creditable boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (company_id, name)
);

ALTER TABLE finance_model_budget_categories ENABLE ROW LEVEL SECURITY;

-- SELECT scoped to the user's currently active company -- same pattern as
-- teams_select (see 20260801190000_teams_select_scope_to_active_company.sql)
-- to avoid the same cross-tenant leak class for any user in >1 company.
DROP POLICY IF EXISTS finance_model_budget_categories_select ON finance_model_budget_categories;
CREATE POLICY finance_model_budget_categories_select ON finance_model_budget_categories
  FOR SELECT USING (company_id = active_company_id());

-- WRITE requires real membership in the target company (per-row check,
-- not "active company" -- same shape as teams_write).
DROP POLICY IF EXISTS finance_model_budget_categories_write ON finance_model_budget_categories;
CREATE POLICY finance_model_budget_categories_write ON finance_model_budget_categories
  FOR ALL
  USING (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_memberships WHERE user_id = auth.uid()));

-- Seed the 7 categories every existing Finance Model project already
-- assumes, for every company that has the Budget Lines custom table
-- provisioned (currently just Niksen) -- preserves exact current
-- creditability semantics from FeasibilitySubtab.tsx's CREDITABLE_CATEGORIES
-- (Construction/Professional Fees/Contingency/Other = creditable;
-- Acquisition/Finance Costs = not; Revenue = not applicable).
INSERT INTO finance_model_budget_categories (company_id, name, kind, is_creditable, display_order)
SELECT DISTINCT ct.company_id, v.name, v.kind, v.is_creditable, v.ord
FROM company_tables ct
CROSS JOIN (VALUES
  ('Acquisition', 'Cost', false, 0),
  ('Construction', 'Cost', true, 1),
  ('Professional Fees', 'Cost', true, 2),
  ('Finance Costs', 'Cost', false, 3),
  ('Contingency', 'Cost', true, 4),
  ('Revenue', 'Revenue', false, 5),
  ('Other', 'Cost', true, 6)
) AS v(name, kind, is_creditable, ord)
WHERE ct.slug = 'finance-model-budget-lines' AND ct.deleted_at IS NULL
ON CONFLICT (company_id, name) DO NOTHING;
