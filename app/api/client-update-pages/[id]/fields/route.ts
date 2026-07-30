// app/api/client-update-pages/[id]/fields/route.ts
// GET returns the pickable field catalog: base+custom fields on the page's
// base table (any system table, or a company_tables.id -- see
// client_update_pages.base_table / lib/clientUpdatePageTableResolver.ts),
// plus (projects only) the synthetic name/property-linked keys, property
// base/custom fields (field_source: 'property' -- key packs "base:<column>"
// or "custom:<company_custom_fields.id>", resolved per-property by
// lib/clientUpdatePageDetail.ts and split across a row/card per property for
// a matter with more than one -- see MatterBoard.tsx's expandByProperty),
// and "related" tables reachable from a matter -- currently just entities,
// one per 'entity'-type custom field on projects (e.g. "Client Name" links
// to an entities row; each of that entity's own columns, from a curated
// allow-list, becomes a pickable related field). Property/related-table
// options are projects-only -- any other base table always gets empty
// arrays for those two (this one-hop relation drill-in is a deliberately
// deferred generalization, see lib/clientUpdatePageTableResolver.ts's own
// header comment). POST adds one (or an 'adhoc' page-only field, which just
// needs a label) to a specific group's column set. group_id NULL is the
// shared/default column set every group shows unless it's been explicitly
// customized -- see .../groups/[groupId]/customize-columns/route.ts for how
// a top-level group diverges from (or reverts back to) that shared set.
// This keeps a fresh or unmodified group's columns stable and predictable
// instead of drifting independently from the moment it's created.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { RELATED_ENTITY_COLUMNS } from "@/lib/clientUpdatePageDetail";
import { isSystemTable, resolveTableFields } from "@/lib/clientUpdatePageTableResolver";

const SYNTHETIC_PROJECT_BASE_FIELDS = [
  { field_key: "name", label: "Matter" },
  { field_key: "property_address", label: "Property Address" },
];

// field_type is snapshotted onto client_update_page_fields at add-time (see
// the POST handler below) so display doesn't need a second lookup per
// render. This allow-list previously omitted the 4 relation types
// (entity/property/project/table_relation) entirely, so adding an
// entity-relation custom field as a column here silently downgraded it to
// 'text' -- it then rendered as a plain input instead of RelationPicker,
// and typing free text into it (rather than picking a record) tried to
// write that raw string into a value_record_id column. Found live: Huynh
// Lawyers' "Property Owner" column (a 'property'-sourced custom field of
// type 'entity').
const KNOWN_FIELD_TYPES = ["date", "select", "number", "currency", "boolean", "entity", "property", "project", "table_relation"];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const baseTable: string = gate.page.base_table;
  const { base, custom } = await resolveTableFields(admin, companyId, baseTable);

  // Trust is a Corporate/Non Corporate Trustee entity's own relationship
  // (entity_relationships, relationship_type='Trustee') -- not a
  // company_custom_fields row, so it can't come out of resolveTableFields'
  // generic 'custom' bucket the way Trust Deed Date does. Entities pages
  // only, one fixed synthetic option (mirrors SYNTHETIC_PROJECT_BASE_FIELDS
  // below). See clientUpdatePageDetail.ts's loadPageDetail for the read
  // side and values/route.ts for the write side.
  const entityRelation = baseTable === "entities" ? [{ field_key: "trust_link", label: "Trust" }] : [];

  // Property/related-table options stay projects-only special cases (see
  // file header) -- not absorbed into the generic resolver, since they're a
  // genuinely narrower, one-hop relation drill (deferred generalization).
  if (!isSystemTable(baseTable) || baseTable !== "projects") {
    return NextResponse.json({ base, custom, relatedTables: [], propertyBase: [], propertyCustom: [], projectProperty: [], entityRelation });
  }

  const [{ data: entityLinkFields }, { data: propertySchemaCols }, { data: propertyCustomFields }, { data: projectPropertyFields }] = await Promise.all([
    admin.from("company_custom_fields").select("id, label").eq("company_id", companyId).eq("table_name", "projects").eq("field_type", "entity").is("deleted_at", null),
    admin.rpc("get_schema_metadata", { target_table: "properties", p_company_id: companyId }),
    admin.from("company_custom_fields").select("id, field_key, label").eq("company_id", companyId).eq("table_name", "properties").is("deleted_at", null),
    // Per-(project, property) transaction fields (purchase price, deposit/
    // settlement dates, ...) -- one value per pairing, not per project, so a
    // matter with 2+ linked properties can have a genuinely different
    // purchase price/date for each one, and a resold property never keeps a
    // past matter's terms attached to it. See
    // supabase/migrations/20260729360000_project_property_values.sql.
    admin.from("company_custom_fields").select("id, field_key, label").eq("company_id", companyId).eq("table_name", "project_properties").is("deleted_at", null).order("display_order"),
  ]);

  // "name" is already covered by the synthetic fields below (a nicer label
  // than the schema RPC's underscore-replaced fallback would give);
  // "purchase_price" is excluded outright -- it's still a real column on
  // projects (left untouched, old data preserved), but purchase price is
  // now a per-property field (see projectPropertyOptions below), so the old
  // project-level column is never offered as a pickable field anymore.
  const baseOptions = [
    ...SYNTHETIC_PROJECT_BASE_FIELDS,
    ...base.filter((f) => f.field_key !== "name" && f.field_key !== "purchase_price"),
  ];
  const relatedTables = (entityLinkFields || []).map((f: any) => ({
    linkFieldId: f.id,
    linkLabel: f.label,
    columns: RELATED_ENTITY_COLUMNS,
  }));
  // street_address is already covered by the synthetic "Property Address"
  // base field above (which also handles the multi-property split) -- so
  // it's excluded here for the same reason name/purchase_price are above.
  const propertyBaseOptions = (propertySchemaCols || [])
    .filter((c: any) => c.category === "data" && !c.is_hidden && c.column_name !== "street_address")
    .map((c: any) => ({ field_key: `base:${c.column_name}`, label: c.label || c.column_name.replace(/_/g, " ") }));
  const propertyCustomOptions = (propertyCustomFields || []).map((f: any) => ({ field_key: `custom:${f.id}`, label: f.label }));
  const projectPropertyOptions = (projectPropertyFields || []).map((f: any) => ({ field_key: f.id, label: f.label }));

  return NextResponse.json({ base: baseOptions, custom, relatedTables, propertyBase: propertyBaseOptions, propertyCustom: propertyCustomOptions, projectProperty: projectPropertyOptions, entityRelation });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  const baseTable: string = gate.page.base_table;

  const body = await req.json().catch(() => ({}));
  const { fieldSource, fieldKey, label } = body;
  const groupId: string | null = body.groupId || null;
  if (!["base", "custom", "adhoc", "related_entity", "property", "project_property", "entity_relation"].includes(fieldSource)) {
    return NextResponse.json({ error: "Invalid field source" }, { status: 400 });
  }
  if ((fieldSource === "related_entity" || fieldSource === "property" || fieldSource === "project_property") && baseTable !== "projects") {
    return NextResponse.json({ error: "Not available on this page" }, { status: 400 });
  }
  if (fieldSource === "entity_relation" && (baseTable !== "entities" || fieldKey !== "trust_link")) {
    return NextResponse.json({ error: "Not available on this page" }, { status: 400 });
  }
  if (!label?.trim()) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (fieldSource !== "adhoc" && !fieldKey) return NextResponse.json({ error: "fieldKey is required" }, { status: 400 });

  if (fieldSource === "related_entity") {
    const [linkFieldId, column] = String(fieldKey).split(":");
    if (!linkFieldId || !column || !RELATED_ENTITY_COLUMNS.some(c => c.key === column)) {
      return NextResponse.json({ error: "Invalid related field" }, { status: 400 });
    }
    const { data: linkField } = await admin.from("company_custom_fields")
      .select("id").eq("id", linkFieldId).eq("company_id", companyId).eq("table_name", "projects").eq("field_type", "entity").is("deleted_at", null).maybeSingle();
    if (!linkField) return NextResponse.json({ error: "Related link field not found" }, { status: 404 });
  }

  // Every project_property field is a real company_custom_fields row --
  // unlike 'property' below, there's no native-column concept here (see
  // 20260729360000_project_property_values.sql), so fieldKey is just the id
  // directly, no "base:"/"custom:" prefix to split.
  if (fieldSource === "project_property") {
    const { data: cf } = await admin.from("company_custom_fields")
      .select("id").eq("id", fieldKey).eq("company_id", companyId).eq("table_name", "project_properties").is("deleted_at", null).maybeSingle();
    if (!cf) return NextResponse.json({ error: "Project-property field not found" }, { status: 404 });
  }

  // "base:<column>" or "custom:<company_custom_fields.id>" -- see the GET
  // handler's header comment for why properties fields are keyed this way
  // instead of getting their own field_source per kind.
  let propertyFieldKind: "base" | "custom" | null = null;
  if (fieldSource === "property") {
    const [kind, key] = String(fieldKey).split(":");
    if (!["base", "custom"].includes(kind) || !key) {
      return NextResponse.json({ error: "Invalid property field" }, { status: 400 });
    }
    propertyFieldKind = kind as "base" | "custom";
    if (kind === "custom") {
      const { data: cf } = await admin.from("company_custom_fields")
        .select("id").eq("id", key).eq("company_id", companyId).eq("table_name", "properties").is("deleted_at", null).maybeSingle();
      if (!cf) return NextResponse.json({ error: "Property custom field not found" }, { status: 404 });
    }
  }

  if (groupId) {
    const { data: group } = await admin.from("client_update_groups").select("id").eq("id", groupId).eq("page_id", id).maybeSingle();
    if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  // field_type/select_options are snapshotted at add-time so display (date
  // formatting, dropdown rendering) doesn't need a second lookup per render.
  // adhoc fields declare their own; base/custom fields mirror whatever the
  // real column/company_custom_fields row is typed as.
  let fieldType = "text";
  let selectOptions: string[] | null = null;
  if (fieldSource === "adhoc") {
    const isSelect = Array.isArray(body.selectOptions) && body.selectOptions.length > 0;
    fieldType = isSelect ? "select" : "text";
    selectOptions = isSelect ? body.selectOptions.map((o: any) => String(o).trim()).filter(Boolean) : null;
  } else if (fieldSource === "custom") {
    const { data: cf } = await admin.from("company_custom_fields").select("field_type, select_options").eq("id", fieldKey).maybeSingle();
    if (cf) {
      fieldType = KNOWN_FIELD_TYPES.includes(cf.field_type) ? cf.field_type : "text";
      selectOptions = cf.field_type === "select" ? cf.select_options : null;
    }
  } else if (fieldSource === "related_entity") {
    fieldType = "text"; // read-only display column -- see the file header comment
  } else if (fieldSource === "entity_relation") {
    fieldType = "entity"; // renders/edits via RelationPicker, same as any other entity-relation field
  } else if (fieldSource === "base") {
    if (fieldKey === "purchase_price") fieldType = "currency";
    else if (fieldKey === "property_address" || fieldKey === "name") fieldType = "text";
    else if (isSystemTable(baseTable)) {
      const { data: schemaCols } = await admin.rpc("get_schema_metadata", { target_table: baseTable, p_company_id: companyId });
      const col = (schemaCols || []).find((c: any) => c.column_name === fieldKey);
      fieldType = col?.data_type?.includes("date") ? "date" : ["numeric", "integer"].includes(col?.data_type) ? "number" : col?.data_type === "boolean" ? "boolean" : "text";
    } else {
      // Custom-table page -- fieldKey is a company_table_fields.id.
      const { data: ctf } = await admin.from("company_table_fields").select("field_type").eq("id", fieldKey).maybeSingle();
      fieldType = ctf && KNOWN_FIELD_TYPES.includes(ctf.field_type) ? ctf.field_type : "text";
    }
  } else if (fieldSource === "property") {
    const [, key] = String(fieldKey).split(":");
    if (propertyFieldKind === "custom") {
      const { data: cf } = await admin.from("company_custom_fields").select("field_type, select_options").eq("id", key).maybeSingle();
      if (cf) {
        fieldType = KNOWN_FIELD_TYPES.includes(cf.field_type) ? cf.field_type : "text";
        selectOptions = cf.field_type === "select" ? cf.select_options : null;
      }
    } else {
      const { data: schemaCols } = await admin.rpc("get_schema_metadata", { target_table: "properties", p_company_id: companyId });
      const col = (schemaCols || []).find((c: any) => c.column_name === key);
      fieldType = col?.data_type?.includes("date") ? "date" : ["numeric", "integer"].includes(col?.data_type) ? "number" : "text";
    }
  } else if (fieldSource === "project_property") {
    const { data: cf } = await admin.from("company_custom_fields").select("field_type, select_options").eq("id", fieldKey).maybeSingle();
    if (cf) {
      fieldType = KNOWN_FIELD_TYPES.includes(cf.field_type) ? cf.field_type : "text";
      selectOptions = cf.field_type === "select" ? cf.select_options : null;
    }
  }

  let countQuery = admin.from("client_update_page_fields").select("id", { count: "exact", head: true }).eq("page_id", id);
  countQuery = groupId ? countQuery.eq("group_id", groupId) : countQuery.is("group_id", null);
  const { count } = await countQuery;

  const { data: field, error } = await admin.from("client_update_page_fields").insert({
    page_id: id, group_id: groupId, field_source: fieldSource, field_key: fieldSource === "adhoc" ? `adhoc_${Date.now()}` : fieldKey,
    label: label.trim(), display_order: count || 0, field_type: fieldType, select_options: selectOptions,
  }).select("id, field_source, field_key, label, display_order, client_visible, field_type, select_options, group_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "column_added", `Added column "${label.trim()}"`);

  return NextResponse.json({ field });
}
