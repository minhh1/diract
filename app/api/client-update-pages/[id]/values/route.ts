// app/api/client-update-pages/[id]/values/route.ts
// Writes a staff edit made on the Client Update Page editor through to
// wherever the field actually lives -- the page's base table (projects or
// entities, see client_update_pages.base_table) directly for 'base' fields,
// company_custom_field_values for 'custom' fields (same table the normal
// matter/entity dashboard reads/writes), client_update_page_values for
// 'adhoc' (page-only) fields, or properties/company_custom_field_values
// again (table_name='properties' this time, projects pages only) for
// 'property' fields -- see lib/clientUpdatePageDetail.ts's header comment on
// how those resolve. This is what keeps editing a matter/entity here in
// sync with its normal dashboard.
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
  const { itemId, fieldId, value, propertyId, reason } = body;
  if (!itemId || !fieldId) return NextResponse.json({ error: "itemId and fieldId are required" }, { status: 400 });
  const reasonTrimmed = typeof reason === "string" ? reason.trim() : "";
  if (!reasonTrimmed) return NextResponse.json({ error: "A reason for this change is required" }, { status: 400 });

  const [{ data: item }, { data: field }] = await Promise.all([
    admin.from("client_update_page_items").select("id, project_id, entity_id, custom_record_id").eq("id", itemId).eq("page_id", id).maybeSingle(),
    admin.from("client_update_page_fields").select("id, field_source, field_key, label").eq("id", fieldId).eq("page_id", id).maybeSingle(),
  ]);
  if (!item) return NextResponse.json({ error: "Item not found on this page" }, { status: 404 });
  if (!field) return NextResponse.json({ error: "Field not found on this page" }, { status: 404 });

  // An auto_fed page's own field values (e.g. Irregularities' Type/
  // Seriousness) are system-computed, not staff-editable here -- fixing an
  // irregularity means editing the flagged record's actual field, a
  // separate mechanism entirely (see .../items/[itemId]/fix/route.ts).
  // Each registry names its own exceptions (auto_fed_registries.
  // editable_field_keys, e.g. ['status']) -- ticking Open/Resolved by hand
  // (e.g. "won't fix", already handled another way) is a real, useful
  // override. If the underlying condition gets re-triggered by a later
  // source-record edit, the recompute trigger opens a fresh row rather than
  // reviving this one (it only ever matches an existing *Open* row) --
  // that's intentional, not a bug: the acknowledged row stays resolved,
  // history-wise, and a genuinely-recurring issue gets re-flagged.
  if (gate.page.page_kind === "auto_fed") {
    const [{ data: sourceField }, { data: registry }] = await Promise.all([
      admin.from("company_table_fields").select("field_key").eq("id", field.field_key).maybeSingle(),
      admin.from("auto_fed_registries").select("editable_field_keys").eq("target_table_id", gate.page.source_table_id).maybeSingle(),
    ]);
    if (!sourceField || !(registry?.editable_field_keys || []).includes(sourceField.field_key)) {
      return NextResponse.json({ error: "This column isn't editable here" }, { status: 400 });
    }
    const { data: existing } = await admin.from("company_table_values").select("value_text").eq("field_id", field.field_key).eq("record_id", item.custom_record_id).maybeSingle();
    const { error } = await admin.from("company_table_values")
      .upsert({ company_id: companyId, table_id: gate.page.source_table_id, record_id: item.custom_record_id, field_id: field.field_key, value_text: value ?? null }, { onConflict: "field_id,record_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const actorName = await resolveActorName(admin, user.id);
    await logChange(admin, id, actorName, "staff", "value_changed", `Set "${field.label}" to ${value || "(blank)"}`, {
      itemId, fieldId, oldValue: existing?.value_text ?? null, newValue: value || null, reason: reasonTrimmed,
    });
    return NextResponse.json({ ok: true });
  }
  const baseTable: "projects" | "entities" = gate.page.base_table === "entities" ? "entities" : "projects";

  const recordId: string = item.project_id ?? item.entity_id;
  const { data: record } = baseTable === "projects"
    ? await admin.from("projects").select("id, name, property_id").eq("id", recordId).maybeSingle()
    : await admin.from("entities").select("id, name").eq("id", recordId).maybeSingle();

  // oldValue is whatever the branch below read before it overwrote the
  // record -- passed in here so the per-cell history (see
  // components/clientUpdatePages/CellHistoryPopover.tsx) can show a real
  // before/after instead of just the new value.
  const logAfterSave = async (oldValue: any) => {
    const actorName = await resolveActorName(admin, user.id);
    const displayValue = value == null || value === "" ? "(blank)" : String(value);
    await logChange(admin, id, actorName, "staff", "value_changed", `Set "${field.label}" to ${displayValue} on ${record?.name || (baseTable === "projects" ? "a matter" : "an entity")}`, {
      itemId, fieldId,
      oldValue: oldValue == null || oldValue === "" ? null : String(oldValue),
      newValue: value == null || value === "" ? null : String(value),
      reason: reasonTrimmed,
    });
  };

  // Read-only -- see lib/clientUpdatePageDetail.ts's header comment. Editing
  // continues to happen on the entity's own record, not through this report.
  if (field.field_source === "related_entity") {
    return NextResponse.json({ error: "This column isn't editable here" }, { status: 400 });
  }

  if (field.field_source === "adhoc") {
    const { data: existing } = await admin.from("client_update_page_values").select("value_text").eq("item_id", itemId).eq("field_id", fieldId).maybeSingle();
    const { error } = await admin.from("client_update_page_values")
      .upsert({ item_id: itemId, field_id: fieldId, value_text: value ?? null }, { onConflict: "item_id,field_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAfterSave(existing?.value_text ?? null);
    return NextResponse.json({ ok: true });
  }

  // property_address (a synthetic 'base' field) and 'property' fields both
  // write onto a specific linked property, not the matter itself -- projects
  // pages only (an entities page's fields route never offers these, so this
  // branch is unreached for baseTable === "entities"). A matter with 2+
  // properties (project_properties junction) edits a specific one at a time
  // (whichever split row/card the edit came from, passed as propertyId); a
  // single-property matter (or a caller that doesn't know about the split,
  // e.g. an older cached client) falls back to the matter's primary linked
  // property. Verifies propertyId actually belongs to this matter first --
  // otherwise a stale/tampered id could write onto an unrelated property
  // record.
  if (baseTable === "projects" && (field.field_key === "property_address" || field.field_source === "property")) {
    const { data: links } = await admin.from("project_properties").select("property_id").eq("project_id", recordId).order("created_at", { ascending: true });
    const linkedIds = (links || []).map((l: any) => l.property_id);
    const fallbackId = linkedIds[0] || (record as any)?.property_id || null;
    const targetPropertyId = propertyId && linkedIds.includes(propertyId) ? propertyId : fallbackId;
    if (!targetPropertyId) return NextResponse.json({ error: "This matter has no linked property" }, { status: 400 });

    if (field.field_key === "property_address") {
      const { data: existingProp } = await admin.from("properties").select("street_address").eq("id", targetPropertyId).maybeSingle();
      const { error } = await admin.from("properties").update({ street_address: value ?? null }).eq("id", targetPropertyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logAfterSave(existingProp?.street_address ?? null);
      return NextResponse.json({ ok: true });
    }

    const [kind, key] = String(field.field_key).split(":");
    if (kind === "base") {
      const { data: existingProp } = await admin.from("properties").select(key).eq("id", targetPropertyId).maybeSingle();
      const { error } = await admin.from("properties").update({ [key]: value ?? null }).eq("id", targetPropertyId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logAfterSave((existingProp as any)?.[key] ?? null);
      return NextResponse.json({ ok: true });
    }

    // kind === "custom" -- key is the company_custom_fields.id (table_name
    // 'properties'), same typed-column resolution as the base-table custom
    // branch below, just written against the property record instead.
    const { data: cf } = await admin.from("company_custom_fields").select("field_type").eq("id", key).maybeSingle();
    if (!cf) return NextResponse.json({ error: "Custom field definition not found" }, { status: 404 });
    const { data: existingVal } = await admin.from("company_custom_field_values").select("value_text, value_number, value_date, value_boolean").eq("field_id", key).eq("record_id", targetPropertyId).maybeSingle();
    const oldValue = existingVal && (["number", "currency"].includes(cf.field_type) ? existingVal.value_number : cf.field_type === "date" ? existingVal.value_date : cf.field_type === "boolean" ? existingVal.value_boolean : existingVal.value_text);
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
    await logAfterSave(oldValue ?? null);
    return NextResponse.json({ ok: true });
  }

  if (field.field_source === "base") {
    const { data: existingRecord } = await admin.from(baseTable).select(field.field_key).eq("id", recordId).maybeSingle();
    const { error } = await admin.from(baseTable).update({ [field.field_key]: value ?? null }).eq("id", recordId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAfterSave((existingRecord as any)?.[field.field_key] ?? null);
    return NextResponse.json({ ok: true });
  }

  // 'custom' -- field.field_key is the company_custom_fields.id; resolve its
  // field_type to know which typed column to write.
  const { data: cf } = await admin.from("company_custom_fields").select("field_type").eq("id", field.field_key).maybeSingle();
  if (!cf) return NextResponse.json({ error: "Custom field definition not found" }, { status: 404 });

  const { data: existingVal } = await admin.from("company_custom_field_values").select("value_text, value_number, value_date, value_boolean").eq("field_id", field.field_key).eq("record_id", recordId).maybeSingle();
  const oldValue = existingVal && (["number", "currency"].includes(cf.field_type) ? existingVal.value_number : cf.field_type === "date" ? existingVal.value_date : cf.field_type === "boolean" ? existingVal.value_boolean : existingVal.value_text);

  const row: Record<string, any> = {
    field_id: field.field_key, record_id: recordId, company_id: companyId, table_name: baseTable,
    value_text: null, value_number: null, value_date: null, value_boolean: null,
  };
  if (["number", "currency"].includes(cf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
  else if (cf.field_type === "date") row.value_date = value || null;
  else if (cf.field_type === "boolean") row.value_boolean = !!value;
  else row.value_text = value ?? null;

  const { error } = await admin.from("company_custom_field_values").upsert(row, { onConflict: "field_id,record_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logAfterSave(oldValue ?? null);
  return NextResponse.json({ ok: true });
}
