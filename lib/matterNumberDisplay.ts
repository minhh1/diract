// A third variant of the same matter-number-prepending logic as
// RelationPicker.tsx's own prependMatterNumbers (browser client, no
// explicit company_id -- relies on RLS, same as this file) and
// lib/prependMatterNumbers.ts (server/admin client, explicit company_id
// since RLS doesn't apply there). This one is for callers that already
// have a Map<id, label> to enrich rather than a RelationOption[]/plain-row
// array to prepend onto -- lib/hooks/useCustomTable.ts's resolveRelationLabels
// (a custom table's grid/relation columns) and mobile's own port of this
// same logic (mobile/src/lib/dashboardWidgets/relationResolution.ts).
// Detected purely by data (does this company have a projects custom field
// literally keyed 'matter_number'?), not gated by company_type -- a
// company_type of 'Law Firm' doesn't guarantee that field exists with that
// exact key, and a company with a matter-number-shaped field shouldn't
// need to also carry the 'Law Firm' label to get this.
const MATTER_NUMBER_FIELD_KEY = "matter_number";

export async function fetchMatterNumbersByProjectId(
  client: { from: (table: string) => any },
  projectIds: string[]
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (projectIds.length === 0) return result;

  const { data: field } = await client
    .from("company_custom_fields")
    .select("id")
    .eq("table_name", "projects")
    .eq("field_key", MATTER_NUMBER_FIELD_KEY)
    .is("deleted_at", null)
    .maybeSingle();
  if (!field) return result;

  const { data: values } = await client
    .from("company_custom_field_values")
    .select("record_id, value_text")
    .eq("field_id", field.id)
    .in("record_id", projectIds);
  (values ?? []).forEach((v: { record_id: string; value_text: string | null }) => {
    if (v.value_text) result.set(v.record_id, v.value_text);
  });
  return result;
}

// Comma-separated, not a dash, matching RelationPicker.tsx's/
// lib/prependMatterNumbers.ts's own established format -- per AGENTS.md's
// "no em dash" rule, which also covers ASCII dash-style separators in
// user-facing text.
export function withMatterNumber(name: string, matterNumber: string | null | undefined): string {
  return matterNumber ? `${matterNumber}, ${name}` : name;
}
