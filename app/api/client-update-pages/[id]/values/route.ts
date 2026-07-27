// app/api/client-update-pages/[id]/values/route.ts
// Writes a staff edit made on the Client Update Page editor through to
// wherever the field actually lives -- projects/properties directly for
// 'base' fields, company_custom_field_values for 'custom' fields (same
// table the normal matter dashboard reads/writes), client_update_page_values
// for 'adhoc' (page-only) fields, or properties/company_custom_field_values
// again (table_name='properties' this time) for 'property' fields -- see
// lib/clientUpdatePageDetail.ts's header comment on how those resolve. This
// is what keeps editing a matter here in sync with its normal dashboard.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { itemId, fieldId, value, propertyId } = body;
  if (!itemId || !fieldId) return NextResponse.json({ error: "itemId and fieldId are required" }, { status: 400 });

  const [{ data: item }, { data: field }] = await Promise.all([
    admin.from("client_update_page_items").select("id, project_id").eq("id", itemId).eq("page_id", id).maybeSingle(),
    admin.from("client_update_page_fields").select("id, field_source, field_key, label").eq("id", fieldId).eq("page_id", id).maybeSingle(),
  ]);
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });
  if (!field) return NextResponse.json({ error: "Field not found on this page" }, { status: 404 });

  const { data: project } = await admin.from("projects").select("id, name, property_id").eq("id", item.project_id).maybeSingle();

  const logAfterSave = async () => {
    const actorName = await resolveActorName(admin, user.id);
    const displayValue = value == null || value === "" ? "(blank)" : String(value);
    await logChange(admin, id, actorName, "staff", "value_changed", `Set "${field.label}" to ${displayValue} on ${project?.name || "a matter"}`);
  };

  // Read-only -- see lib/clientUpdatePageDetail.ts's header comment. Editing
  // continues to happen on the entity's own record, not through this report.
  if (field.field_source === "related_entity") {
    return NextResponse.json({ error: "This column isn't editable here" }, { status: 400 });
  }

  if (field.field_source === "adhoc") {
    const { error } = await admin.from("client_update_page_values")
      .upsert({ item_id: itemId, field_id: fieldId, value_text: value ?? null }, { onConflict: "item_id,field_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAfterSave();
    return NextResponse.json({ ok: true });
  }

  // property_address (a synthetic 'base' field) and 'property' fields both
  // write onto a specific linked property, not the matter itself -- a
  // matter with 2+ properties (project_properties junction) edits a
  // specific one at a time (whichever split row/card the edit came from,
  // passed as propertyId); a single-property matter (or a caller that
  // doesn't know about the split, e.g. an older cached client) falls back
  // to the matter's primary linked property. Verifies propertyId actually
  // belongs to this matter first -- otherwise a stale/tampered id could
  // write onto an unrelated property record.
  if (field.field_key === "property_address" || field.field_source === "property") {
    const { data: links } = await admin.from("project_properties").select("property_id").eq("project_id", item.project_id).order("created_at", { ascending: true });
    const linkedIds = (links || []).map((l: any) => l.property_id);
    const fallbackId = linkedIds[0] || project?.property_id || null;
    const targetPropertyId = propertyId && linkedIds.includes(propertyId) ? propertyId : fallbackId;
    if (!targetPropertyId) return NextResponse.json({ error: "This matter has no linked property" }, { status: 400 });

    if (field.field_key === "property_address") {
      const { error } = await admin.from("properties").update({ street_address: value ?? null }).eq("id", targetPropertyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logAfterSave();
      return NextResponse.json({ ok: true });
    }

    const [kind, key] = String(field.field_key).split(":");
    if (kind === "base") {
      const { error } = await admin.from("properties").update({ [key]: value ?? null }).eq("id", targetPropertyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logAfterSave();
      return NextResponse.json({ ok: true });
    }

    // kind === "custom" -- key is the company_custom_fields.id (table_name
    // 'properties'), same typed-column resolution as the projects custom
    // branch below, just written against the property record instead.
    const { data: cf } = await admin.from("company_custom_fields").select("field_type").eq("id", key).maybeSingle();
    if (!cf) return NextResponse.json({ error: "Custom field definition not found" }, { status: 404 });
    const row: Record<string, any> = {
      field_id: key, record_id: targetPropertyId, company_id: companyId, table_name: "properties",
      value_text: null, value_number: null, value_date: null, value_boolean: null,
    };
    if (["number", "currency"].includes(cf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
    else if (cf.field_type === "date") row.value_date = value || null;
    else if (cf.field_type === "boolean") row.value_boolean = !!value;
    else row.value_text = value ?? null;
    const { error } = await admin.from("company_custom_field_values").upsert(row, { onConflict: "field_id,record_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAfterSave();
    return NextResponse.json({ ok: true });
  }

  if (field.field_source === "base") {
    const { error } = await admin.from("projects").update({ [field.field_key]: value ?? null }).eq("id", item.project_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAfterSave();
    return NextResponse.json({ ok: true });
  }

  // 'custom' -- field.field_key is the company_custom_fields.id; resolve its
  // field_type to know which typed column to write.
  const { data: cf } = await admin.from("company_custom_fields").select("field_type").eq("id", field.field_key).maybeSingle();
  if (!cf) return NextResponse.json({ error: "Custom field definition not found" }, { status: 404 });

  const row: Record<string, any> = {
    field_id: field.field_key, record_id: item.project_id, company_id: companyId, table_name: "projects",
    value_text: null, value_number: null, value_date: null, value_boolean: null,
  };
  if (["number", "currency"].includes(cf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
  else if (cf.field_type === "date") row.value_date = value || null;
  else if (cf.field_type === "boolean") row.value_boolean = !!value;
  else row.value_text = value ?? null;

  const { error } = await admin.from("company_custom_field_values").upsert(row, { onConflict: "field_id,record_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAfterSave();
  return NextResponse.json({ ok: true });
}
