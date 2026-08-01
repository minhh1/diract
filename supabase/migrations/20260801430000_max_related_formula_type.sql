SET request.jwt.claim.role = 'service_role';

-- Adds 'max_related' as a sibling to the existing 'sum_related' formula
-- type -- same shape (formula_relation_field_id points at the relation
-- field on the CHILD table, formula_field_a_id is the child field being
-- aggregated, formula_condition_field_id/value optionally restrict which
-- child rows count), but takes the MAX of the matching rows' value instead
-- of summing them, and (unlike sum_related, which is numeric-only) works on
-- date fields too -- e.g. "the latest end date among a loan's Interest Only
-- phases". See lib/services/customTableService.ts's aggregateChildValues
-- for the actual computation (generalized from the old sumChildValues to
-- support both aggregate kinds and value_number/value_date/value_text
-- columns via getValueColumn).
ALTER TABLE company_table_fields DROP CONSTRAINT IF EXISTS company_table_fields_formula_type_check;
ALTER TABLE company_table_fields ADD CONSTRAINT company_table_fields_formula_type_check
  CHECK (formula_type IN ('multiply', 'percentage_of', 'add', 'sum_related', 'max_related'));

ALTER TABLE company_custom_fields DROP CONSTRAINT IF EXISTS company_custom_fields_formula_type_check;
ALTER TABLE company_custom_fields ADD CONSTRAINT company_custom_fields_formula_type_check
  CHECK (formula_type IN ('sum_related', 'max_related'));

ALTER TABLE template_definition_table_fields DROP CONSTRAINT IF EXISTS template_definition_table_fields_formula_type_check;
ALTER TABLE template_definition_table_fields ADD CONSTRAINT template_definition_table_fields_formula_type_check
  CHECK (formula_type IN ('multiply', 'percentage_of', 'add', 'sum_related', 'max_related'));
