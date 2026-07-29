// lib/clientUpdatePageDetail.ts
// Shared "full board" loader for a Client Update Page ("Detailed table
// page" in the UI) -- groups, items (each with its record's display name +
// every configured field's live resolved value + its note log), and field
// defs. Used by both the authenticated admin detail route
// (app/api/client-update-pages/[id]/route.ts) and the authenticated staff
// by-slug route (app/api/client-update-pages/by-slug/[slug]/route.ts) --
// both need every field's real, unfiltered value (including
// client_visible: false ones, since that flag only hides a field from the
// external client, not from staff).
//
// baseTable is either a system table name or a company_tables.id (see
// lib/clientUpdatePageTableResolver.ts) -- it picks which table an item's
// 'base'/'custom' fields resolve against, via record_table/record_id on
// client_update_page_items (see
// supabase/migrations/20260729210000_client_update_pages_visibility_teams_generic_record.sql,
// which generalized the old dedicated project_id/entity_id/custom_record_id
// columns into this one generic pointer). 'property' and 'related_entity'
// field sources stay projects-only (a matter's linked property, a matter's
// entity-linked custom field) -- any other base table simply never offers
// them in the column picker (see .../fields/route.ts), so those branches
// are unreached rather than specially guarded here.
import { isSystemTable, resolveRecordsBatch, resolveFieldValuesBatch, resolveDisplayNamesBatch } from "@/lib/clientUpdatePageTableResolver";

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

// Native entities columns offerable as 'base' fields on an entities-based
// page -- mirrors the entities-side of NewEntityModal.tsx's fields (plus
// established_date/gst_report_frequency additions). Staff-only board, so
// (unlike RELATED_ENTITY_COLUMNS) no need to exclude bank/TFN columns here.
export const ENTITY_BASE_COLUMNS = [
  "name", "entity_type", "acn", "abn", "tfn", "gst_registered", "established_date",
  "trust_deed_date", "bank_name", "bsb", "account_number", "nab_connect_id",
];

export async function loadPageDetail(admin: any, pageId: string, opts: { clientVisibleOnly?: boolean; baseTable?: string } = {}) {
  const baseTable = opts.baseTable || "projects";
  const isCustomTable = !isSystemTable(baseTable);
  const [{ data: groups }, { data: items }, { data: allFields }, { data: formatRules }, { data: relationFieldDefs }] = await Promise.all([
    admin.from("client_update_groups").select("id, name, display_order, parent_group_id, condition_field_id, condition_value, default_status_names").eq("page_id", pageId).order("display_order"),
    admin.from("client_update_page_items").select("id, record_table, record_id, group_id, display_order, display_name, ai_summary, ai_summary_generated_at").eq("page_id", pageId).order("display_order"),
    admin.from("client_update_page_fields").select("id, field_source, field_key, label, display_order, client_visible, field_type, select_options, group_id").eq("page_id", pageId).order("display_order"),
    admin.from("client_update_page_format_rules").select("id, field_id, value, color, display_order").eq("page_id", pageId).order("display_order"),
    // Every relation-type field on the underlying custom table, not just
    // whichever one(s) happen to be configured as a page column -- a table
    // watched by more than one auto_fed source (e.g. Irregularities' Entity
    // + Property, see 20260729250000_auto_fed_multi_source_properties.sql)
    // only ever has ONE of its relation columns configured as the visible
    // "Name" column, but a property-sourced row's actual link lives on the
    // OTHER (unconfigured) one -- without this, its value is never even
    // fetched, so resolveValue's cross-relation fallback below has nothing
    // to fall back to.
    isCustomTable
      ? admin.from("company_table_fields").select("id, field_type, linked_table_id, linked_display_field").eq("table_id", baseTable)
          .in("field_type", ["entity", "property", "project", "table_relation"]).is("deleted_at", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const fields = opts.clientVisibleOnly ? (allFields || []).filter((f: any) => f.client_visible) : (allFields || []);

  // recordId is whichever record this item points at -- see
  // client_update_page_items.record_id (generic, any base_table) in
  // 20260729210000_client_update_pages_visibility_teams_generic_record.sql.
  const recordId = (item: any): string => item.record_id;
  const recordIds = (items || []).map(recordId);
  const itemIds = (items || []).map((i: any) => i.id);
  // A custom_table page's fields are always 'base' (field_key = the source
  // table's own company_table_fields.id, per .../fields/route.ts) -- there's
  // no separate custom-field concept the way system tables have one, since
  // the whole page already only ever shows one company_tables row's own
  // fields. Unioned with every relation-type field on the table (see
  // relationFieldDefs above) so an unconfigured relation column's value
  // still gets fetched below.
  const customTableFieldIds = isCustomTable
    ? [...new Set([...(fields || []).map((f: any) => f.field_key), ...(relationFieldDefs || []).map((f: any) => f.id)])]
    : [];
  const customFieldIds = (fields || []).filter((f: any) => f.field_source === "custom").map((f: any) => f.field_key);
  const relatedEntityFields = baseTable === "projects" ? (fields || []).filter((f: any) => f.field_source === "related_entity") : [];
  const linkFieldIds = [...new Set(relatedEntityFields.map((f: any) => f.field_key.split(":")[0]))];
  const adhocFieldIds = (fields || []).filter((f: any) => f.field_source === "adhoc").map((f: any) => f.id);

  // Every query in this batch depends only on round 1's results above (or
  // nothing at all) -- none of them read each other's output, so despite
  // looking like 8 separate lookups they're one real round trip, not 8.
  // (Previously each was its own top-level `await`, making this section
  // alone ~8 sequential round trips for no reason -- the single biggest
  // contributor to this page being slow to load.)
  const [
    baseRecordById,
    { data: projectPropertyLinks },
    customValueByKey,
    { data: linkValues },
    { data: adhocValues },
    { data: notes },
    { data: appendedEmails },
    { data: customTableFieldDefs },
    customTableValueByKey,
    displayNameById,
  ] = await Promise.all([
    resolveRecordsBatch(admin, baseTable, recordIds),
    // Purchase Price lives on projects, not properties (see the migration's
    // header comment) -- property_address is still the linked property's own
    // field. A project can now have 2+ properties (project_properties
    // junction -- see lib/schema/systemTableRelations.ts's property_id entry
    // and supabase/migrations/20260727035000_project_properties_multi.sql),
    // so this reads every linked property per project, not just the single
    // legacy projects.property_id -- MatterBoard.tsx expands a matter with
    // more than one into its own row/card per property. Falls back to the
    // legacy single column for the (shouldn't-happen-post-backfill, but stay
    // defensive) case of a project with a property_id but no junction row.
    // None of this applies to a non-projects page -- other tables don't
    // have linked properties, so every map here just stays empty.
    baseTable === "projects" && recordIds.length
      ? admin.from("project_properties").select("project_id, property_id").in("project_id", recordIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    resolveFieldValuesBatch(admin, baseTable, customFieldIds, recordIds),
    linkFieldIds.length && recordIds.length
      ? admin.from("company_custom_field_values").select("field_id, record_id, value_record_id").in("field_id", linkFieldIds).in("record_id", recordIds)
      : Promise.resolve({ data: [] as any[] }),
    adhocFieldIds.length && itemIds.length
      ? admin.from("client_update_page_values").select("item_id, field_id, value_text").in("field_id", adhocFieldIds).in("item_id", itemIds)
      : Promise.resolve({ data: [] as any[] }),
    itemIds.length
      ? admin.from("client_update_page_notes").select("id, item_id, note_date, body, author_name, source, created_at, property_id")
          .in("item_id", itemIds).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    itemIds.length
      ? admin.from("client_update_page_emails").select("id, item_id, subject, from_name, from_address, snippet, email_date, added_by_name, created_at")
          .in("item_id", itemIds).order("email_date", { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    customTableFieldIds.length
      ? admin.from("company_table_fields").select("id, field_key, field_type").in("id", customTableFieldIds)
      : Promise.resolve({ data: [] as any[] }),
    resolveFieldValuesBatch(admin, baseTable, customTableFieldIds, recordIds),
    resolveDisplayNamesBatch(admin, baseTable, recordIds),
  ]);

  const propertyIdsByProject = new Map<string, string[]>();
  for (const link of projectPropertyLinks || []) {
    if (!propertyIdsByProject.has(link.project_id)) propertyIdsByProject.set(link.project_id, []);
    propertyIdsByProject.get(link.project_id)!.push(link.property_id);
  }
  for (const [pid, record] of baseRecordById) {
    if (!propertyIdsByProject.has(pid) && record?.property_id) propertyIdsByProject.set(pid, [record.property_id]);
  }

  // custom_table 'base' fields resolve straight off company_table_values,
  // typed by the source table's own company_table_fields.field_type
  // (mirrors getValueColumn in lib/schema/fieldCapabilities.ts) -- a
  // relation-type field (e.g. Irregularities' Entity/Property columns)
  // reads value_record_id and needs a label, so its targets are split by
  // type and folded into relatedEntityIds/allPropertyIds below, resolved by
  // the same entities/properties lookups RELATED_ENTITY_COLUMNS and
  // projects' linked-property fields already use. A custom table watched by
  // more than one auto_fed source (e.g. Irregularities' Entity + Property
  // columns, see 20260729250000_auto_fed_multi_source_properties.sql) can
  // have any of its relation-type fields populated per record, never more
  // than one at once -- resolveValue below falls back across all of them.
  const customTableFieldTypeById = new Map<string, string>((customTableFieldDefs || []).map((f: any) => [f.id, f.field_type]));
  // linked_table_id/linked_display_field only come through relationFieldDefs
  // (customTableFieldDefs' own select doesn't carry them) -- see
  // useCustomTable.ts's identical linked_table_id/linked_display_field
  // resolution for a 'table_relation' field's display label.
  const relationFieldMetaById = new Map<string, { linkedTableId: string | null }>(
    (relationFieldDefs || []).map((f: any) => [f.id, { linkedTableId: f.linked_table_id }])
  );
  const customTableRelationValues = [...customTableValueByKey.entries()].filter(([, v]: any) => v.value_record_id);
  const customTableEntityRelationIds = customTableRelationValues
    .filter(([k]) => customTableFieldTypeById.get(k.split(":")[0]) === "entity")
    .map(([, v]: any) => v.value_record_id as string);
  const customTablePropertyRelationIds = customTableRelationValues
    .filter(([k]) => customTableFieldTypeById.get(k.split(":")[0]) === "property")
    .map(([, v]: any) => v.value_record_id as string);
  // A genuinely custom-table source (e.g. Irregularities' Contact column,
  // see 20260729270000_auto_fed_custom_table_source.sql) can point at any
  // number of DIFFERENT linked tables, one 'table_relation' field per
  // source -- grouped by linked_table_id so each group can be resolved
  // against its own table below.
  const tableRelationIdsByLinkedTable = new Map<string, string[]>();
  for (const [k, v] of customTableRelationValues) {
    if (customTableFieldTypeById.get(k.split(":")[0]) !== "table_relation") continue;
    const linkedTableId = relationFieldMetaById.get(k.split(":")[0])?.linkedTableId;
    if (!linkedTableId) continue;
    if (!tableRelationIdsByLinkedTable.has(linkedTableId)) tableRelationIdsByLinkedTable.set(linkedTableId, []);
    tableRelationIdsByLinkedTable.get(linkedTableId)!.push((v as any).value_record_id as string);
  }

  const projectLinkedPropertyIds: string[] = [...propertyIdsByProject.values()].flat();
  const allPropertyIds = [...new Set([...projectLinkedPropertyIds, ...customTablePropertyRelationIds])];

  const linkedEntityIdByKey = new Map<string, string>((linkValues || []).filter((v: any) => v.value_record_id).map((v: any) => [`${v.field_id}:${v.record_id}`, v.value_record_id]));
  const relatedEntityIds = [...new Set([...linkedEntityIdByKey.values(), ...customTableEntityRelationIds])];

  const adhocValueByKey = new Map<string, any>((adhocValues || []).map((v: any) => [`${v.field_id}:${v.item_id}`, v.value_text]));

  const notesByItem = new Map<string, any[]>();
  for (const n of notes || []) {
    if (!notesByItem.has(n.item_id)) notesByItem.set(n.item_id, []);
    notesByItem.get(n.item_id)!.push(n);
  }

  const emailsByItem = new Map<string, any[]>();
  for (const e of appendedEmails || []) {
    if (!emailsByItem.has(e.item_id)) emailsByItem.set(e.item_id, []);
    emailsByItem.get(e.item_id)!.push(e);
  }

  // A 'property' field's field_key packs "base:<column>" or
  // "custom:<company_custom_fields.id>" -- parallel to how a 'base'/
  // 'custom' field works for projects, just scoped to whichever
  // property(ies) a matter is linked to instead of the matter itself (see
  // the fields route's header comment for the picker side of this).
  const propertyFields = (fields || []).filter((f: any) => f.field_key === "property_address" || f.field_source === "property");
  const propertyCustomFieldIds = propertyFields
    .filter((f: any) => f.field_source === "property" && f.field_key.startsWith("custom:"))
    .map((f: any) => f.field_key.split(":")[1]);

  // Both of these only need allPropertyIds/relatedEntityIds (resolved just
  // above from the previous batch) -- independent of each other, so one
  // more real round trip covers both instead of two.
  const [
    { data: properties },
    { data: relatedEntities },
    { data: propertyCustomValues },
    tableRelationNameById,
  ] = await Promise.all([
    // select("*") -- a 'property' field_source (see below) can point at any
    // base column on properties, picked freely from the fields catalog, so
    // there's no fixed column list to name up front the way the narrower
    // single-column select this replaced had.
    allPropertyIds.length
      ? admin.from("properties").select("*").in("id", allPropertyIds)
      : Promise.resolve({ data: [] as any[] }),
    relatedEntityIds.length
      ? admin.from("entities").select(`id, ${RELATED_ENTITY_COLUMN_KEYS.join(", ")}`).in("id", relatedEntityIds)
      : Promise.resolve({ data: [] as any[] }),
    propertyCustomFieldIds.length && allPropertyIds.length
      ? admin.from("company_custom_field_values")
          .select("field_id, record_id, value_text, value_number, value_date, value_boolean")
          .in("field_id", propertyCustomFieldIds).in("record_id", allPropertyIds)
      : Promise.resolve({ data: [] as any[] }),
    // Same "each custom table's own primary_field_key value" lookup
    // resolveDisplayNamesBatch already does for the page's own items,
    // reused here per distinct linked table a 'table_relation' relation
    // column points at (usually just one).
    (async () => {
      const merged = new Map<string, string>();
      await Promise.all([...tableRelationIdsByLinkedTable.entries()].map(async ([linkedTableId, ids]) => {
        const names = await resolveDisplayNamesBatch(admin, linkedTableId, ids);
        for (const [id, name] of names) merged.set(id, name);
      }));
      return merged;
    })(),
  ]);
  const propertyById = new Map<string, any>((properties || []).map((p: any) => [p.id, p]));
  const entityById = new Map<string, any>((relatedEntities || []).map((e: any) => [e.id, e]));
  const propertyCustomValueByKey = new Map<string, any>((propertyCustomValues || []).map((v: any) => [`${v.field_id}:${v.record_id}`, v]));

  function resolvePropertyField(field: any, propertyId: string | undefined): any {
    if (!propertyId) return null;
    const property = propertyById.get(propertyId);
    if (field.field_key === "property_address") return property?.street_address ?? null;
    const [kind, key] = field.field_key.split(":");
    if (kind === "base") return property?.[key] ?? null;
    if (kind === "custom") {
      const v = propertyCustomValueByKey.get(`${key}:${propertyId}`);
      return v ? (v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null) : null;
    }
    return null;
  }

  function resolveValue(field: any, item: any): any {
    const rid = recordId(item);
    const record = baseRecordById.get(rid);
    if (field.field_source === "adhoc") return adhocValueByKey.get(`${field.id}:${item.id}`) ?? null;
    if (field.field_source === "related_entity") {
      const [linkFieldId, column] = field.field_key.split(":");
      const entityId = linkedEntityIdByKey.get(`${linkFieldId}:${rid}`);
      const entity = entityId ? entityById.get(entityId) : null;
      return entity ? entity[column] ?? null : null;
    }
    if (field.field_source === "custom") {
      const v = customValueByKey.get(`${field.field_key}:${rid}`);
      return v ? (v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null) : null;
    }
    if (baseTable === "projects" && (field.field_key === "property_address" || field.field_source === "property")) {
      const propIds = propertyIdsByProject.get(rid) || [];
      return resolvePropertyField(field, propIds[0]);
    }
    if (isCustomTable) {
      let v = customTableValueByKey.get(`${field.field_key}:${rid}`);
      let effectiveFieldKey = field.field_key;
      // A table watched by more than one auto_fed source (e.g.
      // Irregularities' Entity + Property columns) never has more than one
      // of its relation-type columns populated per record -- if THIS
      // column's own field_key is a relation type but empty here, the
      // record's actual link lives on a sibling relation column instead
      // (whichever source_table_name produced it). Falls back across every
      // relation-type field on the table rather than hardcoding a 2nd
      // named column, so a 3rd future source (e.g. 'project') needs zero
      // changes here.
      const RELATION_TYPES = new Set(["entity", "property", "project", "table_relation"]);
      if (!v?.value_record_id && RELATION_TYPES.has(customTableFieldTypeById.get(field.field_key) as string)) {
        for (const [key, fieldType] of customTableFieldTypeById) {
          if (!RELATION_TYPES.has(fieldType)) continue;
          const candidate = customTableValueByKey.get(`${key}:${rid}`);
          if (candidate?.value_record_id) { v = candidate; effectiveFieldKey = key; break; }
        }
      }
      if (!v) return null;
      const effectiveType = customTableFieldTypeById.get(effectiveFieldKey);
      if (effectiveType === "entity" && v.value_record_id) return entityById.get(v.value_record_id)?.name ?? null;
      if (effectiveType === "property" && v.value_record_id) return propertyById.get(v.value_record_id)?.street_address ?? null;
      if (effectiveType === "table_relation" && v.value_record_id) return tableRelationNameById.get(v.value_record_id) ?? null;
      return v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
    }
    return record?.[field.field_key] ?? null;
  }

  return {
    groups: groups || [],
    items: (items || []).map((i: any) => {
      const rid = recordId(i);
      return {
        ...i,
        matterName: i.display_name || displayNameById.get(rid) || "",
        values: Object.fromEntries((fields || []).map((f: any) => [f.id, resolveValue(f, i)])),
        notes: notesByItem.get(i.id) || [],
        emails: emailsByItem.get(i.id) || [],
        properties: baseTable === "projects"
          ? (propertyIdsByProject.get(rid) || []).map((pid: string) => ({
              id: pid,
              address: propertyById.get(pid)?.street_address ?? null,
              values: Object.fromEntries(propertyFields.map((f: any) => [f.id, resolvePropertyField(f, pid)])),
            }))
          : [],
      };
    }),
    fields: fields || [],
    formatRules: formatRules || [],
  };
}
