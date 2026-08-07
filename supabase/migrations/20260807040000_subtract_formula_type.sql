-- Adds 'subtract' alongside the existing two-field-on-the-same-table
-- formula types (multiply/add). Requested for cases like Profit Margin =
-- Price minus Total Cost, which the AI table-builder assistant couldn't
-- express before this -- it only had multiply/percentage_of/add/
-- sum_related/max_related, none of which subtract two fields.
ALTER TABLE company_table_fields DROP CONSTRAINT IF EXISTS company_table_fields_formula_type_check;
ALTER TABLE company_table_fields ADD CONSTRAINT company_table_fields_formula_type_check
  CHECK (formula_type IN ('multiply', 'percentage_of', 'add', 'subtract', 'sum_related', 'max_related'));

ALTER TABLE template_definition_table_fields DROP CONSTRAINT IF EXISTS template_definition_table_fields_formula_type_check;
ALTER TABLE template_definition_table_fields ADD CONSTRAINT template_definition_table_fields_formula_type_check
  CHECK (formula_type IN ('multiply', 'percentage_of', 'add', 'subtract', 'sum_related', 'max_related'));
