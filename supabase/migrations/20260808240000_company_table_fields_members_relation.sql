-- Lets a custom table's 'table_relation' field target 'profiles' (real
-- company members, i.e. users with a login) as a fourth system-table
-- relation target alongside the existing properties/entities/projects.
-- field_type stays 'table_relation' -- linked_system_table is what already
-- discriminates the target, generically, in the read path
-- (lib/hooks/useCustomTable.ts's resolveRelationLabels), so no other schema
-- change is needed.
ALTER TABLE company_table_fields DROP CONSTRAINT IF EXISTS company_table_fields_linked_system_table_check;
ALTER TABLE company_table_fields ADD CONSTRAINT company_table_fields_linked_system_table_check
  CHECK (linked_system_table = ANY (ARRAY['properties'::text, 'entities'::text, 'projects'::text, 'profiles'::text]));
