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
// abn/acn used to be here too -- they're company_custom_fields now (see
// supabase/migrations/20260729290000_entities_finance_fields_to_custom.sql),
// and this mechanism only resolves native columns, not custom field values,
// so they're no longer offerable as a related_entity column at all.
export const RELATED_ENTITY_COLUMNS: { key: string; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "entity_type", label: "Entity Type" },
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
// acn/abn/tfn/trust_deed_date/bank_name/bsb/account_number/nab_connect_id
// used to be here too -- they're company_custom_fields now (see
// supabase/migrations/20260729290000_entities_finance_fields_to_custom.sql),
// so they're picked up by the normal custom-field catalog instead.
export const ENTITY_BASE_COLUMNS = [
  "name", "entity_type", "gst_registered", "established_date",
];

export async function loadPageDetail(admin: any, pageId: string, opts: { clientVisibleOnly?: boolean; baseTable?: string; pageKind?: string; redactFigures?: boolean } = {}) {
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
  const hasEntityRelationField = baseTable === "entities" && (fields || []).some((f: any) => f.field_source === "entity_relation");

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
    { data: trustRelationships },
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
      ? admin.from("project_properties").select("id, project_id, property_id").in("project_id", recordIds).order("created_at", { ascending: true })
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
    // Trust link -- entity_relationships, not a value table (see
    // .../fields/route.ts's entity_relation bucket). Same shape
    // .../items/[itemId]/trust/route.ts GET already reads.
    hasEntityRelationField
      ? admin.from("entity_relationships").select("child_entity_id, parent_entity_id, trust:parent_entity_id(name)")
          .in("child_entity_id", recordIds).eq("relationship_type", "Trustee").or("is_current.is.null,is_current.eq.true")
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const trustByEntityId = new Map<string, { trustId: string; trustName: string | null }>(
    (trustRelationships || []).map((r: any) => [r.child_entity_id, { trustId: r.parent_entity_id, trustName: r.trust?.name ?? null }])
  );

  const propertyIdsByProject = new Map<string, string[]>();
  // (project_id, property_id) -> project_properties.id -- the actual
  // pairing project_property_values is keyed by (see resolveProjectPropertyField
  // below). Only ever populated for a real junction row; a project on the
  // legacy-fallback single property_id column (no junction row at all --
  // "shouldn't happen post-backfill" per the comment above) has nowhere to
  // attach a per-property value, so it simply resolves to nothing there.
  const projectPropertyIdByPair = new Map<string, string>();
  for (const link of projectPropertyLinks || []) {
    if (!propertyIdsByProject.has(link.project_id)) propertyIdsByProject.set(link.project_id, []);
    propertyIdsByProject.get(link.project_id)!.push(link.property_id);
    projectPropertyIdByPair.set(`${link.project_id}:${link.property_id}`, link.id);
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

  // A 'custom' field_source field (a company_custom_fields row on the page's
  // OWN system table, e.g. projects' "Client"/"Debtor" entity fields) can
  // itself be a relation type -- resolveValue's 'custom' branch below needs
  // these ids' target rows fetched the same way the isCustomTable branch
  // already fetches its own relation targets. table_relation never occurs
  // here (that field_type is company_table_fields-only); 'project' isn't
  // resolved to a name anywhere in this file yet (no such field exists in
  // practice today), so it's left unhandled rather than adding a whole new
  // projects lookup for a case that's never actually hit.
  const customFieldTypeByKey = new Map<string, string>(
    (fields || []).filter((f: any) => f.field_source === "custom").map((f: any) => [f.field_key, f.field_type])
  );
  const customFieldRelationEntityIds: string[] = [];
  const customFieldRelationPropertyIds: string[] = [];
  for (const [key, v] of customValueByKey.entries()) {
    const recordId = (v as any)?.value_record_id;
    if (!recordId) continue;
    const fieldType = customFieldTypeByKey.get(key.split(":")[0]);
    if (fieldType === "entity") customFieldRelationEntityIds.push(recordId);
    else if (fieldType === "property") customFieldRelationPropertyIds.push(recordId);
  }

  const projectLinkedPropertyIds: string[] = [...propertyIdsByProject.values()].flat();
  let allPropertyIds = [...new Set([...projectLinkedPropertyIds, ...customTablePropertyRelationIds, ...customFieldRelationPropertyIds])];

  const linkedEntityIdByKey = new Map<string, string>((linkValues || []).filter((v: any) => v.value_record_id).map((v: any) => [`${v.field_id}:${v.record_id}`, v.value_record_id]));
  let relatedEntityIds = [...new Set([...linkedEntityIdByKey.values(), ...customTableEntityRelationIds, ...customFieldRelationEntityIds])];

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

  // Fetched here, ahead of the entities/properties batch below, specifically
  // so a relation-type property custom field's value_record_id (e.g.
  // "Property Owner", an 'entity'-type field on properties) can be folded
  // into relatedEntityIds/allPropertyIds BEFORE those drive that batch's own
  // entities/properties queries -- the two would otherwise be mutually
  // dependent (this needs allPropertyIds, which is already known by now;
  // the entities/properties fetch needs THIS resolved first). Previously
  // this lived in the batch below and never resolved this case at all, so a
  // "Property Owner" cell either showed blank or (if some earlier client-side
  // workaround typed the name in as plain text -- the same bug this fixes on
  // the write side) looked right by accident, without a real relation link.
  const { data: propertyCustomValues } = propertyCustomFieldIds.length && allPropertyIds.length
    ? await admin.from("company_custom_field_values")
        .select("field_id, record_id, value_text, value_number, value_date, value_boolean, value_record_id, value_record_capacity")
        .in("field_id", propertyCustomFieldIds).in("record_id", allPropertyIds)
    : { data: [] as any[] };
  const propertyCustomValueByKey = new Map<string, any>((propertyCustomValues || []).map((v: any) => [`${v.field_id}:${v.record_id}`, v]));
  const propertyCustomFieldTypeByKey = new Map<string, string>(
    propertyFields.filter((f: any) => f.field_source === "property" && f.field_key.startsWith("custom:")).map((f: any) => [f.field_key.split(":")[1], f.field_type])
  );
  const propertyCustomRelationEntityIds: string[] = [];
  const propertyCustomRelationPropertyIds: string[] = [];
  for (const v of propertyCustomValues || []) {
    if (!v.value_record_id) continue;
    const ft = propertyCustomFieldTypeByKey.get(v.field_id);
    if (ft === "entity") propertyCustomRelationEntityIds.push(v.value_record_id);
    else if (ft === "property") propertyCustomRelationPropertyIds.push(v.value_record_id);
  }
  allPropertyIds = [...new Set([...allPropertyIds, ...propertyCustomRelationPropertyIds])];
  relatedEntityIds = [...new Set([...relatedEntityIds, ...propertyCustomRelationEntityIds])];

  // Per-(project, property) transaction fields (purchase price, deposit/
  // settlement dates, ...) -- a genuinely different mechanism from
  // propertyFields above: those read a PROPERTY's own persistent data
  // (shared across every matter that ever links to it), these read data
  // scoped to THIS matter's own pairing with that property, so a resold
  // property never carries a past matter's price/dates forward. field_key
  // is directly a company_custom_fields.id (table_name='project_properties'),
  // no "base:"/"custom:" prefix since every field here is a custom field --
  // see supabase/migrations/20260729360000_project_property_values.sql.
  const projectPropertyFields = (fields || []).filter((f: any) => f.field_source === "project_property");
  const projectPropertyIds = [...new Set([...projectPropertyIdByPair.values()])];

  // Both of these only need allPropertyIds/relatedEntityIds (resolved just
  // above from the previous batch) -- independent of each other, so one
  // more real round trip covers both instead of two.
  const [
    { data: properties },
    { data: relatedEntities },
    tableRelationNameById,
    { data: projectPropertyValues },
  ] = await Promise.all([
    // select("*") -- a 'property' field_source (see below) can point at any
    // base column on properties, picked freely from the fields catalog, so
    // there's no fixed column list to name up front the way the narrower
    // single-column select this replaced had.
    // .is('deleted_at', null) on both -- without it, a relation column
    // pointing at an archived/merged-away entity or property still
    // resolved its real name here (the row still exists, just soft-
    // deleted), so it never fell into the "(deleted)" branch below. That's
    // what let an Irregularity about an already-archived entity keep
    // showing as if nothing had changed.
    allPropertyIds.length
      ? admin.from("properties").select("*").in("id", allPropertyIds).is("deleted_at", null)
      : Promise.resolve({ data: [] as any[] }),
    relatedEntityIds.length
      ? admin.from("entities").select(`id, ${RELATED_ENTITY_COLUMN_KEYS.join(", ")}`).in("id", relatedEntityIds).is("deleted_at", null)
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
    projectPropertyFields.length && projectPropertyIds.length
      ? admin.from("project_property_values")
          .select("field_id, project_property_id, value_text, value_number, value_date, value_boolean, value_record_id")
          .in("field_id", projectPropertyFields.map((f: any) => f.field_key)).in("project_property_id", projectPropertyIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const propertyById = new Map<string, any>((properties || []).map((p: any) => [p.id, p]));
  const entityById = new Map<string, any>((relatedEntities || []).map((e: any) => [e.id, e]));
  const projectPropertyValueByKey = new Map<string, any>((projectPropertyValues || []).map((v: any) => [`${v.field_id}:${v.project_property_id}`, v]));

  function resolveProjectPropertyField(field: any, projectId: string, propertyId: string | undefined): any {
    if (!propertyId) return null;
    const projectPropertyId = projectPropertyIdByPair.get(`${projectId}:${propertyId}`);
    if (!projectPropertyId) return null;
    const v = projectPropertyValueByKey.get(`${field.field_key}:${projectPropertyId}`);
    return v ? (v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? v.value_record_id ?? null) : null;
  }

  function resolvePropertyField(field: any, propertyId: string | undefined): any {
    if (!propertyId) return null;
    const property = propertyById.get(propertyId);
    if (field.field_key === "property_address") return property?.street_address ?? null;
    const [kind, key] = field.field_key.split(":");
    if (kind === "base") return property?.[key] ?? null;
    if (kind === "custom") {
      const v = propertyCustomValueByKey.get(`${key}:${propertyId}`);
      if (!v) return null;
      // A relation-type property custom field (e.g. "Property Owner", an
      // 'entity'-type field on properties) never resolved its
      // value_record_id to anything here before -- see the KNOWN_FIELD_TYPES
      // fix in fields/route.ts's header comment for the write-side half of
      // this same bug.
      if (field.field_type === "entity" && v.value_record_id) {
        const entity = entityById.get(v.value_record_id);
        if (!entity) return "(deleted)";
        return entity.name ?? "";
      }
      if (field.field_type === "property" && v.value_record_id) {
        const relatedProperty = propertyById.get(v.value_record_id);
        return relatedProperty ? (relatedProperty.street_address ?? "") : "(deleted)";
      }
      return v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
    }
    return null;
  }

  // Per-property counterparts to resolveRelationId/resolveRelationCapacity
  // below -- those two resolve at the MATTER level (propIds[0], the first
  // linked property) for item.relationIds/relationCapacities, which is
  // wrong for any row past the first once a matter has 2+ properties
  // (MatterBoard.tsx's expandByProperty splits the matter into one row per
  // property, but relationIds/relationCapacities were never split the same
  // way item.values already is -- confirmed live: a 2-property matter's
  // second row's "as trustee" popover showed the FIRST property's trust
  // link, not its own). Exposed per-property (below, in the properties:
  // map) so expandByProperty can pull the right one per row instead of
  // falling back to the matter-level, first-property-only maps.
  function resolvePropertyRelationId(field: any, propertyId: string): string | null {
    const [kind, key] = field.field_key.split(":");
    if (kind !== "custom" || (field.field_type !== "entity" && field.field_type !== "property")) return null;
    const v = propertyCustomValueByKey.get(`${key}:${propertyId}`);
    return v?.value_record_id || null;
  }
  function resolvePropertyRelationCapacity(field: any, propertyId: string): string | null {
    const [kind, key] = field.field_key.split(":");
    if (kind !== "custom" || (field.field_type !== "entity" && field.field_type !== "property")) return null;
    const v = propertyCustomValueByKey.get(`${key}:${propertyId}`);
    return v?.value_record_capacity || null;
  }

  function resolveValue(field: any, item: any): any {
    const rid = recordId(item);
    const record = baseRecordById.get(rid);
    if (field.field_source === "adhoc") return adhocValueByKey.get(`${field.id}:${item.id}`) ?? null;
    if (field.field_source === "entity_relation") return trustByEntityId.get(rid)?.trustName ?? null;
    if (field.field_source === "related_entity") {
      const [linkFieldId, column] = field.field_key.split(":");
      const entityId = linkedEntityIdByKey.get(`${linkFieldId}:${rid}`);
      const entity = entityId ? entityById.get(entityId) : null;
      return entity ? entity[column] ?? null : null;
    }
    if (field.field_source === "custom") {
      const v = customValueByKey.get(`${field.field_key}:${rid}`);
      if (!v) return null;
      // A relation-type field's raw value_record_id was never resolved to
      // anything here before -- this column always rendered blank
      // regardless of whether it actually had a linked entity/property.
      // Mirrors the isCustomTable branch below's existing resolution.
      if (field.field_type === "entity" && v.value_record_id) {
        const entity = entityById.get(v.value_record_id);
        if (!entity) return "(deleted)";
        return entity.name ?? "";
      }
      if (field.field_type === "property" && v.value_record_id) {
        const property = propertyById.get(v.value_record_id);
        return property ? (property.street_address ?? "") : "(deleted)";
      }
      return v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
    }
    if (baseTable === "projects" && (field.field_key === "property_address" || field.field_source === "property")) {
      const propIds = propertyIdsByProject.get(rid) || [];
      return resolvePropertyField(field, propIds[0]);
    }
    // Only reached for a single-(or zero-)property matter -- MatterBoard's
    // expandByProperty reads item.values (this) directly in that case,
    // falling back to the matter's one property, and only reads
    // item.properties[].values (populated separately below) once a matter
    // actually has 2+, splitting into one row per property.
    if (baseTable === "projects" && field.field_source === "project_property") {
      const propIds = propertyIdsByProject.get(rid) || [];
      return resolveProjectPropertyField(field, rid, propIds[0]);
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
      // "(deleted)" only when the linked record is genuinely gone (its id
      // isn't in the lookup map at all) -- NOT when it exists but its own
      // display field is legitimately blank (e.g. an "Incomplete Name"
      // violation on an entity whose name really is empty -- that's real
      // data, not a dangling reference, and showing "(deleted)" for it
      // would be actively misleading). Found live: an entity removed by the
      // duplicate-merge flow left its still-open irregularities pointing at
      // nothing, rendering a silently blank Name with no indication why.
      if (effectiveType === "entity" && v.value_record_id) {
        const entity = entityById.get(v.value_record_id);
        return entity ? (entity.name ?? "") : "(deleted)";
      }
      if (effectiveType === "property" && v.value_record_id) {
        const property = propertyById.get(v.value_record_id);
        return property ? (property.street_address ?? "") : "(deleted)";
      }
      if (effectiveType === "table_relation" && v.value_record_id) {
        return tableRelationNameById.has(v.value_record_id) ? tableRelationNameById.get(v.value_record_id) : "(deleted)";
      }
      return v.value_text ?? v.value_number ?? v.value_date ?? v.value_boolean ?? null;
    }
    return record?.[field.field_key] ?? null;
  }

  // resolveValue above returns a relation-type field's resolved DISPLAY
  // LABEL (a plain string) -- deliberately not an {id, label} shape, since
  // `values` already feeds a dozen other things (search, sort, group
  // conditions, saved filters, format-rule coloring) that all just do
  // String(value) and would silently break on an object. An in-cell
  // RelationPicker needs the real id too, so this is a parallel, narrower
  // lookup returning just that, exposed as its own item.relationIds map --
  // additive, touches nothing that already works off `values`.
  function resolveRelationId(field: any, item: any): string | null {
    const rid = recordId(item);
    if (field.field_source === "entity_relation") return trustByEntityId.get(rid)?.trustId ?? null;
    if (field.field_source === "custom") {
      if (field.field_type !== "entity" && field.field_type !== "property") return null;
      const v = customValueByKey.get(`${field.field_key}:${rid}`);
      return v?.value_record_id || null;
    }
    if (field.field_source === "property" && (field.field_type === "entity" || field.field_type === "property")) {
      const [, key] = field.field_key.split(":");
      const propIds = propertyIdsByProject.get(rid) || [];
      const v = propertyCustomValueByKey.get(`${key}:${propIds[0]}`);
      return v?.value_record_id || null;
    }
    if (isCustomTable) {
      const RELATION_TYPES = new Set(["entity", "property", "project", "table_relation"]);
      let v = customTableValueByKey.get(`${field.field_key}:${rid}`);
      if (!v?.value_record_id && RELATION_TYPES.has(customTableFieldTypeById.get(field.field_key) as string)) {
        for (const [key, fieldType] of customTableFieldTypeById) {
          if (!RELATION_TYPES.has(fieldType)) continue;
          const candidate = customTableValueByKey.get(`${key}:${rid}`);
          if (candidate?.value_record_id) { v = candidate; break; }
        }
      }
      return v?.value_record_id || null;
    }
    return null;
  }

  // Sibling to resolveRelationId above, same 2 branches that actually have
  // a value_record_capacity column (company_custom_field_values -- custom
  // tables' company_table_values has no such column, so isCustomTable is
  // deliberately not covered here). Exposed as item.relationCapacities,
  // read by RelationPicker to know whether to show its "as trustee"
  // affordance for the currently-selected value -- see
  // supabase/migrations/20260729430000_relation_value_capacity.sql.
  function resolveRelationCapacity(field: any, item: any): string | null {
    const rid = recordId(item);
    if (field.field_source === "custom") {
      if (field.field_type !== "entity" && field.field_type !== "property") return null;
      const v = customValueByKey.get(`${field.field_key}:${rid}`);
      return v?.value_record_capacity || null;
    }
    if (field.field_source === "property" && (field.field_type === "entity" || field.field_type === "property")) {
      const [, key] = field.field_key.split(":");
      const propIds = propertyIdsByProject.get(rid) || [];
      const v = propertyCustomValueByKey.get(`${key}:${propIds[0]}`);
      return v?.value_record_capacity || null;
    }
    return null;
  }

  // Attaches where a relation-type field's picker should search/create --
  // 'entity'/'property'/'project' always point at their same-named system
  // table (true whether the field is a company_custom_fields row on a
  // system-table page, or a company_table_fields row on a custom-table
  // page); 'table_relation' (custom-table fields only) needs its own
  // linked_table_id, already resolved above into relationFieldMetaById for
  // the cross-relation value-fallback logic.
  const RELATION_FIELD_TYPES = new Set(["entity", "property", "project", "table_relation"]);
  const fieldsWithRelationMeta = (fields || []).map((f: any) => {
    if (!RELATION_FIELD_TYPES.has(f.field_type)) return f;
    if (f.field_type === "table_relation") {
      return { ...f, linkedSystemTable: null, linkedTableId: relationFieldMetaById.get(f.field_key)?.linkedTableId || null };
    }
    const linkedSystemTable = f.field_type === "entity" ? "entities" : f.field_type === "property" ? "properties" : "projects";
    return { ...f, linkedSystemTable, linkedTableId: null };
  });

  // Drops any item whose underlying record has since been archived/soft-
  // deleted (e.g. the "loser" side of a duplicate merge -- see
  // duplicate_merge_rpc.sql, which sets deleted_at but never touches
  // client_update_page_items) -- baseRecordById (resolveRecordsBatch) now
  // excludes deleted_at rows, so "missing from that map" doubles as "gone
  // from the underlying table" without a separate existence check or any
  // cleanup trigger. Recomputed on every load, so the board always
  // reflects current DB state rather than whatever was true when the item
  // was added.
  const mappedItems = (items || []).filter((i: any) => baseRecordById.has(recordId(i))).map((i: any) => {
    const rid = recordId(i);
    return {
      ...i,
      matterName: i.display_name || displayNameById.get(rid) || "",
      values: Object.fromEntries((fields || []).map((f: any) => [f.id, resolveValue(f, i)])),
      relationIds: Object.fromEntries((fields || []).map((f: any) => [f.id, resolveRelationId(f, i)])),
      relationCapacities: Object.fromEntries((fields || []).map((f: any) => [f.id, resolveRelationCapacity(f, i)])),
      notes: notesByItem.get(i.id) || [],
      emails: emailsByItem.get(i.id) || [],
      properties: baseTable === "projects"
        ? (propertyIdsByProject.get(rid) || []).map((pid: string) => ({
            id: pid,
            address: propertyById.get(pid)?.street_address ?? null,
            values: {
              ...Object.fromEntries(propertyFields.map((f: any) => [f.id, resolvePropertyField(f, pid)])),
              ...Object.fromEntries(projectPropertyFields.map((f: any) => [f.id, resolveProjectPropertyField(f, rid, pid)])),
            },
            relationIds: Object.fromEntries(propertyFields.map((f: any) => [f.id, resolvePropertyRelationId(f, pid)])),
            relationCapacities: Object.fromEntries(propertyFields.map((f: any) => [f.id, resolvePropertyRelationCapacity(f, pid)])),
          }))
        : [],
    };
  });

  // An auto_fed item (e.g. an Irregularity row) only exists to flag a
  // problem on the record it links to (Entity/Property/Contact) -- once
  // that link resolves to "(deleted)" (the linked record itself was
  // archived/merged away), there's nothing left to action, so the item is
  // dropped entirely rather than kept around Resolved-but-still-listed.
  // The recompute trigger (auto_fed_recompute, see
  // 20260729330000_auto_fed_deleted_record_handling.sql) already marks it
  // Resolved server-side; this is the display-side "and don't show it
  // either" half. Checks every resolved value for the literal "(deleted)"
  // marker rather than pre-filtering by field_type -- a table watched by
  // more than one auto_fed source (see resolveValue's cross-relation
  // fallback above) can resolve "(deleted)" through a DIFFERENT field than
  // the one configured as this page's visible column, so field_type alone
  // isn't reliable here; the marker itself always is.
  const finalItems = opts.pageKind === "auto_fed"
    ? mappedItems.filter((item: any) => !Object.values(item.values).includes("(deleted)"))
    : mappedItems;

  // Company-shared default sort/filter per group (see
  // supabase/migrations/20260802120000_client_update_page_view_defaults.sql).
  // Returned from the shared loader so the staff route and the public
  // route can't disagree about what the board's default view is -- a
  // public/demo viewer has no localStorage, so this is the ONLY way they
  // ever see the view the admin actually works in.
  const { data: viewDefaults } = await admin
    .from("client_update_page_view_defaults")
    .select("group_id, filters, sort")
    .eq("page_id", pageId);

  // Server-side redaction (see
  // supabase/migrations/20260802140000_public_pages_redact_figures.sql).
  // Currency values are dropped to null rather than replaced with a
  // placeholder string, so nothing recoverable leaves the server and no
  // downstream numeric code has to cope with a non-numeric value; the
  // client renders nulls as password dots because figuresRedacted tells
  // it to. Free text is scrubbed too -- this board's Notes columns carry
  // real amounts inline ("surplus fund $65,278.91"), which a
  // column-type check alone would sail straight past.
  const scrub = (v: any) =>
    typeof v === "string" ? v.replace(/\$\s?\d[\d,]*(\.\d+)?/g, "$\u2022\u2022\u2022\u2022\u2022\u2022") : v;

  const redactedItems = opts.redactFigures
    ? finalItems.map((item: any) => {
        const values: Record<string, any> = {};
        for (const [fieldId, v] of Object.entries(item.values || {})) {
          const field = fieldsWithRelationMeta.find((f: any) => f.id === fieldId);
          if (field?.field_type === "currency") { values[fieldId] = null; continue; }
          values[fieldId] = scrub(v);
        }
        // The record's NAME needs scrubbing too, not just its field
        // values: several loans on this board are literally named
        // "<address> - <lender> - $960,000", so redacting the Principal
        // column while leaving the title intact defeats the whole point.
        // Same for an AI summary, which is generated prose over the
        // record's own figures.
        return { ...item, values, matterName: scrub(item.matterName), ai_summary: scrub(item.ai_summary) };
      })
    : finalItems;

  return {
    groups: groups || [],
    items: redactedItems,
    fields: fieldsWithRelationMeta,
    formatRules: formatRules || [],
    figuresRedacted: !!opts.redactFigures,
    viewDefaults: (viewDefaults || []).map((v: any) => ({ groupId: v.group_id, filters: v.filters || [], sort: v.sort || [] })),
  };
}
