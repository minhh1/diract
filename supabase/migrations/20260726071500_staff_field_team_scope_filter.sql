-- Staff picker on Time & Fee Entries / Disbursements was inconsistently
-- filtered: only one company's Time & Fee Entries field had a
-- $current_user filter, and every Disbursements copy had none at all --
-- root cause of the picker showing every entity in the company (including
-- non-staff, e.g. property-owning companies). Replace with the role/team
-- aware $team_scope sentinel (see lib/teamScope.ts, RelationPicker.tsx):
-- admins see all Staff entities, team leaders see their team(s)' members,
-- everyone else sees only themselves. This subsumes the old
-- $current_user-only config (a non-leader resolves to exactly themselves
-- under the new sentinel too), so it's a straight replacement, not a
-- second parallel mechanism.
UPDATE company_table_fields ctf
SET linked_filter_column = 'linked_profile_id', linked_filter_value = '$team_scope'
FROM company_tables ct
WHERE ctf.table_id = ct.id
  AND ct.slug IN ('time-fee-entries', 'disbursements')
  AND ctf.field_key = 'staff'
  AND ctf.deleted_at IS NULL;

UPDATE template_definition_table_fields tdf
SET linked_filter_column = 'linked_profile_id', linked_filter_value = '$team_scope'
FROM template_definition_tables tt
WHERE tdf.template_table_id = tt.id
  AND tt.slug IN ('time-fee-entries', 'disbursements')
  AND tdf.field_key = 'staff';
