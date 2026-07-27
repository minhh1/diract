// lib/fieldLabels.ts
// Targeted per-record label override -- NOT a generic per-matter-type
// schema-labeling engine. projects.estimated_completion_date has no fixed
// label (get_schema_metadata returns label: null for it, so callers fall
// back to a humanized column name -- see RecordDashboard.tsx's loadFields
// and FieldLayoutEditor.tsx's schemaCols mapping). Conveyancing matters call
// this same date "Settlement Date"; every other matter type keeps the
// default humanized label. Schema metadata is fetched once per table (not
// per record), so this can't live there -- it has to apply at render time,
// once a specific record's Matter Type value is known.
export function getFieldLabel(
  field: { field_key: string; label: string },
  matterType: string | null | undefined
): string {
  if (field.field_key === 'estimated_completion_date' && matterType === 'Conveyancing') {
    return 'Settlement Date';
  }
  return field.label;
}
