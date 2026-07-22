-- Basic computed/formula fields for the custom-tables engine, so a
-- number/currency field on a custom table (e.g. "Amount" on Time & Fee
-- Entries) can auto-derive its value from other fields on the same table
-- instead of being typed in by hand -- see the dashboard builder's quick-add
-- form (components/dashboard/DashboardQuickAddForm.tsx) and
-- lib/services/customTableService.ts's computeFormulaFields().
--
-- Deliberately only two formula kinds, not a general expression language:
--   multiply       -- formula_field_a_id * formula_field_b_id  (e.g. Rate x Duration Hours = Amount)
--   percentage_of  -- formula_field_a_id * (formula_percent / 100)  (e.g. Amount x 10% = GST)
-- A computed field stays a normal number/currency field_type (so it sums
-- like any other field in aggregations) -- formula_type IS NOT NULL is what
-- marks it computed instead of user-entered.

ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS formula_type text
  CHECK (formula_type IN ('multiply', 'percentage_of'));
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS formula_field_a_id uuid REFERENCES company_table_fields(id) ON DELETE SET NULL;
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS formula_field_b_id uuid REFERENCES company_table_fields(id) ON DELETE SET NULL;
ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS formula_percent numeric;
