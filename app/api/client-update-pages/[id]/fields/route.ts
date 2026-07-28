// app/api/client-update-pages/[id]/fields/route.ts
// GET returns the pickable field catalog: base columns on the page's base
// table (projects or entities, see client_update_pages.base_table) + the
// synthetic name/property-linked keys (projects only), this company's
// custom fields on that base table, property base/custom fields
// (field_source: 'property' -- key packs "base:<column>" or
// "custom:<company_custom_fields.id>", resolved per-property by
// lib/clientUpdatePageDetail.ts and split across a row/card per property for
// a matter with more than one -- see MatterBoard.tsx's expandByProperty),
// and "related" tables reachable from a matter -- currently just entities,
// one per 'entity'-type custom field on projects (e.g. "Client Name" links
// to an entities row; each of that entity's own columns, from a curated
// allow-list, becomes a pickable related field). Property/related-table
// options are projects-only -- entities don't have linked properties or
// their own 'entity'-type custom fields, so an entities-based page always
// gets empty arrays for those two. POST adds one (or an 'adhoc' page-only
// field, which just needs a label) to a specific group's column set.
// group_id NULL is the shared/default column set every group shows unless
// it's been explicitly customized -- see .../groups/[groupId]/customize-columns/route.ts
// for how a top-level group diverges from (or reverts back to) that shared
// set. This keeps a fresh or unmodified group's columns stable and
// predictable instead of drifting independently from the moment it's
// created.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { RELATED_ENTITY_COLUMNS, ENTITY_BASE_COLUMNS } from "@/lib/clientUpdatePageDetail";

const SYNTHETIC_PROJECT_BASE_FIELDS = [
  { field_key: "name", label: "Matter" },
  { field_key: "property_address", label: "Property Address" },
  { field_key: "purchase_price", label: "Purchase Price" },
];

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  // A custom_table page's only pickable columns are the source
  // company_tables row's own fields -- no custom/property/related-table
  // concepts (those only exist for a system-table base).
  if (gate.page.base_table === "custom_table") {
    const { data: sourceFields } = await admin.from("company_table_fields")
      .select("id, label").eq("table_id", gate.page.source_table_id).is("deleted_at", null).order("display_order");
    return NextResponse.json({
      base: (sourceFields || []).map((f: any) => ({ field_key: f.id, label: f.label })),
      custom: [], relatedTables: [], propertyBase: [], propertyCustom: [],
    });
  }
  const baseTable: "projects" | "entities" = gate.page.base_table === "entities" ? "entities" : "projects";

  const [{ data: schemaCols }, { data: customFields }, { data: entityLinkFields }, { data: propertySchemaCols }, { data: propertyCustomFields }] = await Promise.all([
    admin.rpc("get_schema_metadata", { target_table: baseTable, p_company_id: companyId }),
    admin.from("company_custom_fields").select("id, field_key, label").eq("company_id", companyId).eq("table_name", baseTable).is("deleted_at", null),
    baseTable === "projects"
      ? admin.from("company_custom_fields").select("id, label").eq("company_id", companyId).eq("table_name", "projects").eq("field_type", "entity").is("deleted_at", null)
      : Promise.resolve({ data: [] as any[] }),
    baseTable === "projects" ? admin.rpc("get_schema_metadata", { target_table: "properties", p_company_id: companyId }) : Promise.resolve({ data: [] as any[] }),
    baseTable === "projects"
      ? admin.from("company_custom_fields").select("id, field_key, label").eq("company_id", companyId).eq("table_name", "properties").is("deleted_at", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const baseOptions = baseTable === "projects"
    ? [
        ...SYNTHETIC_PROJECT_BASE_FIELDS,
        ...(schemaCols || [])
          // "name" and "purchase_price" are already covered above (with nicer
          // labels than the schema RPC's underscore-replaced fallback would
          // give) -- purchase_price only became a real projects column
          // recently (see the migration's header comment), so it'd otherwise
          // now show up a second time here.
          .filter((c: any) => c.category === "data" && !c.is_hidden && c.column_name !== "name" && c.column_name !== "purchase_price")
          .map((c: any) => ({ field_key: c.column_name, label: c.label || c.column_name.replace(/_/g, " ") })),
      ]
    : (schemaCols || [])
        .filter((c: any) => c.category === "data" && !c.is_hidden && ENTITY_BASE_COLUMNS.includes(c.column_name))
        .map((c: any) => ({ field_key: c.column_name, label: c.label || c.column_name.replace(/_/g, " ") }));
  const customOptions = (customFields || []).map((f: any) => ({ field_key: f.id, label: f.label }));
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

  return NextResponse.json({ base: baseOptions, custom: customOptions, relatedTables, propertyBase: propertyBaseOptions, propertyCustom: propertyCustomOptions });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  const baseTable: "projects" | "entities" = gate.page.base_table === "entities" ? "entities" : "projects";

  const body = await req.json().catch(() => ({}));
  const { fieldSource, fieldKey, label } = body;
  const groupId: string | null = body.groupId || null;
  if (!["base", "custom", "adhoc", "related_entity", "property"].includes(fieldSource)) {
    return NextResponse.json({ error: "Invalid field source" }, { status: 400 });
  }
  if ((fieldSource === "related_entity" || fieldSource === "property") && baseTable !== "projects") {
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
      fieldType = ["date", "select", "number", "currency", "boolean"].includes(cf.field_type) ? cf.field_type : "text";
      selectOptions = cf.field_type === "select" ? cf.select_options : null;
    }
  } else if (fieldSource === "related_entity") {
    fieldType = "text"; // read-only display column -- see the file header comment
  } else if (fieldSource === "base") {
    if (fieldKey === "purchase_price") fieldType = "currency";
    else if (fieldKey === "property_address" || fieldKey === "name") fieldType = "text";
    else {
      const { data: schemaCols } = await admin.rpc("get_schema_metadata", { target_table: baseTable, p_company_id: companyId });
      const col = (schemaCols || []).find((c: any) => c.column_name === fieldKey);
      fieldType = col?.data_type?.includes("date") ? "date" : ["numeric", "integer"].includes(col?.data_type) ? "number" : col?.data_type === "boolean" ? "boolean" : "text";
    }
  } else if (fieldSource === "property") {
    const [, key] = String(fieldKey).split(":");
    if (propertyFieldKind === "custom") {
      const { data: cf } = await admin.from("company_custom_fields").select("field_type, select_options").eq("id", key).maybeSingle();
      if (cf) {
        fieldType = ["date", "select", "number", "currency", "boolean"].includes(cf.field_type) ? cf.field_type : "text";
        selectOptions = cf.field_type === "select" ? cf.select_options : null;
      }
    } else {
      const { data: schemaCols } = await admin.rpc("get_schema_metadata", { target_table: "properties", p_company_id: companyId });
      const col = (schemaCols || []).find((c: any) => c.column_name === key);
      fieldType = col?.data_type?.includes("date") ? "date" : ["numeric", "integer"].includes(col?.data_type) ? "number" : "text";
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
