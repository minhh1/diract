-- Adds 'divide' alongside the existing two-field-on-the-same-table formula
-- types (multiply/add/subtract). Requested so the AI table-builder
-- assistant can express a genuine per-unit rate derived from a batch
-- total (e.g. Cost Per Meal = Batch Total Cost / Meals Produced) as a real
-- computed field instead of asking the user to do that division
-- themselves and type in the result -- see app/api/ai/chat/route.ts's
-- SYSTEM_PROMPT for the guidance that leans on this.
ALTER TABLE company_table_fields DROP CONSTRAINT IF EXISTS company_table_fields_formula_type_check;
ALTER TABLE company_table_fields ADD CONSTRAINT company_table_fields_formula_type_check
  CHECK (formula_type IN ('multiply', 'percentage_of', 'add', 'subtract', 'divide', 'sum_related', 'max_related'));

ALTER TABLE template_definition_table_fields DROP CONSTRAINT IF EXISTS template_definition_table_fields_formula_type_check;
ALTER TABLE template_definition_table_fields ADD CONSTRAINT template_definition_table_fields_formula_type_check
  CHECK (formula_type IN ('multiply', 'percentage_of', 'add', 'subtract', 'divide', 'sum_related', 'max_related'));
