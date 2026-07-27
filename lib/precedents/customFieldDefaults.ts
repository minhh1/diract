// lib/precedents/customFieldDefaults.ts
// Resolves a body_template field's autoFillFieldId (a company_custom_fields
// row) to a real display value for one specific record -- so a field like
// "Selling Agent" can default from the project's own custom field data
// instead of always being asked (see PrecedentsSettingsTab.tsx's "Default
// from field" picker, PrecedentsTab.tsx's Issue modal, and
// lib/ai/precedentAction.ts). Unlike
// app/api/document-templates/public/[pageId]/route.ts's simpler auto-fill
// (which only reads scalar columns), this also resolves an entity-type
// field to the linked entity's own display name -- the whole point of
// binding to an entity field like Selling Agent is to get its name, not a
// raw uuid.
export async function resolveCustomFieldDefaults(
  admin: any,
  recordId: string,
  fieldIds: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(fieldIds.filter((id): id is string => !!id))];
  if (!uniqueIds.length) return {};

  const [{ data: fields }, { data: values }] = await Promise.all([
    admin.from("company_custom_fields").select("id, field_type").in("id", uniqueIds),
    admin.from("company_custom_field_values")
      .select("field_id, value_text, value_number, value_date, value_boolean, value_record_id")
      .eq("record_id", recordId).in("field_id", uniqueIds),
  ]);
  const fieldById = new Map<string, any>((fields || []).map((f: any) => [f.id, f]));
  const valueByFieldId = new Map<string, any>((values || []).map((v: any) => [v.field_id, v]));

  const entityIdsToResolve = new Set<string>();
  for (const v of values || []) {
    const field = fieldById.get(v.field_id);
    if (field?.field_type === "entity" && v.value_record_id) entityIdsToResolve.add(v.value_record_id);
  }
  let entityNameById = new Map<string, string>();
  if (entityIdsToResolve.size) {
    const { data: entities } = await admin.from("entities").select("id, name").in("id", [...entityIdsToResolve]);
    entityNameById = new Map((entities || []).map((e: any) => [e.id, e.name]));
  }

  const result: Record<string, string> = {};
  for (const fieldId of uniqueIds) {
    const field = fieldById.get(fieldId);
    const value = valueByFieldId.get(fieldId);
    if (!field || !value) continue;
    let resolved: string | null = null;
    if (field.field_type === "entity" && value.value_record_id) {
      resolved = entityNameById.get(value.value_record_id) || null;
    } else {
      resolved = value.value_text
        ?? (value.value_number != null ? String(value.value_number) : null)
        ?? value.value_date
        ?? (value.value_boolean != null ? String(value.value_boolean) : null);
    }
    if (resolved) result[fieldId] = resolved;
  }
  return result;
}
