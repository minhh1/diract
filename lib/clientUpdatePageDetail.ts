// lib/clientUpdatePageDetail.ts
// Shared "full board" loader for a Client Update Page -- groups, items
// (each with its matter name + every configured field's live resolved
// value + its note log), and field defs. Used by both the authenticated
// admin detail route (app/api/client-update-pages/[id]/route.ts) and the
// authenticated staff by-slug route (app/api/client-update-pages/by-slug/[slug]/route.ts)
// -- both need every field's real, unfiltered value (including
// client_visible: false ones, since that flag only hides a field from the
// external client, not from staff).

// A related_entity field's field_key packs "<linkFieldId>:<column>" --
// linkFieldId is the id of one of the matter's own 'entity'-type custom
// fields (e.g. "Client Name" on projects, which links to an entities row
// via company_custom_field_values.value_record_id -- see
// lib/precedents/customFieldDefaults.ts for the same join pattern), column
// is one of these. Deliberately excludes tfn/bank_name/bsb/account_number/
// date_of_birth -- this can end up on a client-facing page, so no
// financial or personally-sensitive entity columns are offerable here.
export const RELATED_ENTITY_COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "entity_type", label: "Entity Type" },
  { key: "abn", label: "ABN" },
  { key: "acn", label: "ACN" },
  { key: "gst_registered", label: "GST Registered" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "mobile_phone", label: "Mobile" },
  { key: "job_title", label: "Job Title" },
  { key: "registered_address_text", label: "Registered Address" },
];
const RELATED_ENTITY_COLUMN_KEYS = RELATED_ENTITY_COLUMNS.map(c => c.key);

export async function loadPageDetail(admin: any, pageId: string, opts: { clientVisibleOnly?: boolean } = {}) {
  const [{ data: groups }, { data: items }, { data: allFields }, { data: formatRules }] = await Promise.all([
    admin.from("client_update_groups").select("id, name, display_order, parent_group_id, condition_field_id, condition_value, default_status_names").eq("page_id", pageId).order("display_order"),
    admin.from("client_update_page_items").select("id, project_id, group_id, display_order, display_name, ai_summary, ai_summary_generated_at").eq("page_id", pageId).order("display_order"),
    admin.from("client_update_page_fields").select("id, field_source, field_key, label, display_order, client_visible, field_type, select_options, group_id").eq("page_id", pageId).order("display_order"),
    admin.from("client_update_page_format_rules").select("id, field_id, value, color, display_order").eq("page_id", pageId).order("display_order"),
  ]);
  const fields = opts.clientVisibleOnly ? (allFields || []).filter((f: any) => f.client_visible) : (allFields || []);

  const projectIds = (items || []).map((i: any) => i.project_id);
  const itemIds = (items || []).map((i: any) => i.id);
  const { data: projects } = projectIds.length
    ? await admin.from("projects").select("id, name, property_id, estimated_completion_date, purchase_price").in("id", projectIds)
    : { data: [] as any[] };
  const projectById = new Map<string, any>((projects || []).map((p: any) => [p.id, p]));

  // Purchase Price lives on projects, not properties (see the migration's
  // header comment) -- property_address is still the linked property's own
  // field, so that join stays.
  const propertyIds = [...new Set((projects || []).map((p: any) => p.property_id).filter(Boolean))];
  const { data: properties } = propertyIds.length
    ? await admin.from("properties").select("id, street_address").in("id", propertyIds)
    : { data: [] as any[] };
  const propertyById = new Map<string, any>((properties || []).map((p: any) => [p.id, p]));

  const customFieldIds = (fields || []).filter((f: any) => f.field_source === "custom").map((f: any) => f.field_key);
  const { data: customValues } = customFieldIds.length && projectIds.length
    ? await admin.from("company_custom_field_values")
        .select("field_id, record_id, value_text, value_number, value_date, value_boolean")
        .in("field_id", customFieldIds).in("record_id", projectIds)
    : { data: [] as any[] };
  const customValueByKey = new Map<string, any>((customValues || []).map((v: any) => [`${v.field_id}:${v.record_id}`, v]));

  const relatedEntityFields = (fields || []).filter((f: any) => f.field_source === "related_entity");
  const linkFieldIds = [...new Set(relatedEntityFields.map((f: any) => f.field_key.split(":")[0]))];
  const { data: linkValues } = linkFieldIds.length && projectIds.length
    ? await admin.from("company_custom_field_values").select("field_id, record_id, value_record_id").in("field_id", linkFieldIds).in("record_id", projectIds)
    : { data: [] as any[] };
  const linkedEntityIdByKey = new Map<string, string>((linkValues || []).filter((v: any) => v.value_record_id).map((v: any) => [`${v.field_id}:${v.record_id}`, v.value_record_id]));
  const entityIds = [...new Set([...linkedEntityIdByKey.values()])];
  const { data: relatedEntities } = entityIds.length
    ? await admin.from("entities").select(`id, ${RELATED_ENTITY_COLUMN_KEYS.join(", ")}`).in("id", entityIds)
    : { data: [] as any[] };
  const entityById = new Map<string, any>((relatedEntities || []).map((e: any) => [e.id, e]));

  const adhocFieldIds = (fields || []).filter((f: any) => f.field_source === "adhoc").map((f: any) => f.id);
  const { data: adhocValues } = adhocFieldIds.length && itemIds.length
    ? await admin.from("client_update_page_values").select("item_id, field_id, value_text").in("field_id", adhocFieldIds).in("item_id", itemIds)
    : { data: [] as any[] };
  const adhocValueByKey = new Map<string, any>((adhocValues || []).map((v: any) => [`${v.field_id}:${v.item_id}`, v.value_text]));

  const { data: notes } = itemIds.length
    ? await admin.from("client_update_page_notes").select("id, item_id, note_date, body, author_name, source, created_at")
        .in("item_id", itemIds).order("created_at", { ascending: false })
    : { data: [] as any[] };
  const notesByItem = new Map<string, any[]>();
  for (const n of notes || []) {
    if (!notesByItem.has(n.item_id)) notesByItem.set(n.item_id, []);
    notesByItem.get(n.item_id)!.push(n);
  }

  const { data: appendedEmails } = itemIds.length
    ? await admin.from("client_update_page_emails").select("id, item_id, subject, from_name, from_address, snippet, email_date, added_by_name, created_at")
        .in("item_id", itemIds).order("email_date", { ascending: false })
    : { data: [] as any[] };
  const emailsByItem = new Map<string, any[]>();
  for (const e of appendedEmails || []) {
    if (!emailsByItem.has(e.item_id)) emailsByItem.set(e.item_id, []);
    emailsByItem.get(e.item_id)!.push(e);
  }

  function resolveValue(field: any, item: any): any {
    const project = projectById.get(item.project_id);
    if (field.field_source === "adhoc") return adhocValueByKey.get(`${field.id}:${item.id}`) ?? null;
    if (field.field_source === "related_entity") {
      const [linkFieldId, column] = field.field_key.split(":");
      const entityId = linkedEntityIdByKey.get(`${linkFieldId}:${item.project_id}`);
      const entity = entityId ? entityById.get(entityId) : null;
      return entity ? entity[column] ?? null : null;
    }
    if (field.field_source === "custom") {
      const v = customValueByKey.get(`${field.field_key}:${item.project_id}`);
      return v ? (v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null) : null;
    }
    const property = project?.property_id ? propertyById.get(project.property_id) : null;
    if (field.field_key === "property_address") return property?.street_address ?? null;
    return project?.[field.field_key] ?? null;
  }

  return {
    groups: groups || [],
    items: (items || []).map((i: any) => ({
      ...i,
      matterName: i.display_name || projectById.get(i.project_id)?.name || "",
      values: Object.fromEntries((fields || []).map((f: any) => [f.id, resolveValue(f, i)])),
      notes: notesByItem.get(i.id) || [],
      emails: emailsByItem.get(i.id) || [],
    })),
    fields: fields || [],
    formatRules: formatRules || [],
  };
}
