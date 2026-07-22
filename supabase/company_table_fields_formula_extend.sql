-- Extends the computed-field kinds from company_table_fields_formula.sql
-- with two more, still deliberately short of a general expression language:
--   add          -- formula_field_a_id + formula_field_b_id  (e.g. Subtotal = Fees + Disbursements)
--   sum_related  -- SUM of formula_field_a_id (a field on a RELATED table)
--                   across that table's rows whose formula_relation_field_id
--                   (a table_relation field on the related table) points at
--                   this record -- e.g. Invoice "Fees" = sum of its linked
--                   Time & Fee Entries' Amount. Recomputed by
--                   lib/services/customTableService.ts whenever a related row
--                   is created or edited, not stored live by the DB.
-- For sum_related, formula_field_a_id/formula_relation_field_id both live on
-- the related table (formula_field_a_id's table_id identifies it).

ALTER TABLE company_table_fields DROP CONSTRAINT IF EXISTS company_table_fields_formula_type_check;
ALTER TABLE company_table_fields ADD CONSTRAINT company_table_fields_formula_type_check
  CHECK (formula_type IN ('multiply', 'percentage_of', 'add', 'sum_related'));

ALTER TABLE company_table_fields ADD COLUMN IF NOT EXISTS formula_relation_field_id uuid REFERENCES company_table_fields(id) ON DELETE SET NULL;
