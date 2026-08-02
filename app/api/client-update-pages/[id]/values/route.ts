// app/api/client-update-pages/[id]/values/route.ts
// Writes a staff edit made on the Client Update Page ("Detailed table
// page") editor through to wherever the field actually lives -- the page's
// base table directly for 'base' fields on a system table (or
// company_table_values for 'base' fields on a custom table),
// company_custom_field_values for 'custom' fields (same table the normal
// matter/entity dashboard reads/writes), client_update_page_values for
// 'adhoc' (page-only) fields, or properties/company_custom_field_values
// again (table_name='properties' this time, projects pages only) for
// 'property' fields -- see lib/clientUpdatePageDetail.ts's header comment on
// how those resolve. This is what keeps editing a record here in sync with
// its normal dashboard.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";
import { isSystemTable, resolveDisplayNamesBatch } from "@/lib/clientUpdatePageTableResolver";

const RELATION_FIELD_TYPES = ["entity", "property", "project", "table_relation"];

// Maps a relation field_type to what to read/write against for its
// value_record_id -- 'entity'/'property'/'project' always point at their
// same-named system table; 'table_relation' (custom-table fields only)
// points at whatever company_tables.id linked_table_id names.
function relationRecordTable(fieldType: string, linkedTableId?: string | null): string | null {
  if (fieldType === "entity") return "entities";
  if (fieldType === "property") return "properties";
  if (fieldType === "project") return "projects";
  if (fieldType === "table_relation") return linkedTableId || null;
  return null;
}

// A relation cell's old/new "value" is a record id -- resolve it to that
// record's display name before it goes into the human-readable activity
// log/cell history, same way every other field type's typed value already
// reads naturally there.
async function resolveRelationLabel(admin: any, recordTable: string | null, recordId: any): Promise<string | null> {
  if (!recordTable || !recordId) return null;
  const map = await resolveDisplayNamesBatch(admin, recordTable, [recordId]);
  return map.get(recordId) || null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  // capacity: optional, entity-relation fields only -- 'Trustee' when
  // RelationPicker's capacity prompt was answered "acting as trustee for
  // this", null/undefined otherwise. See supabase/migrations/20260729430000_
  // relation_value_capacity.sql -- per LINK, not a fixed property of the
  // entity, since the same entity can act differently on different matters.
  const { itemId, fieldId, value, propertyId, reason, capacity } = body;
  if (!itemId || !fieldId) return NextResponse.json({ error: "itemId and fieldId are required" }, { status: 400 });
  // log_cell_changes defaults true (matches the DB column's own default) --
  // off skips both the reason requirement and every logChange call below.
  const cellLoggingEnabled = gate.page.log_cell_changes !== false;
  const reasonTrimmed = typeof reason === "string" ? reason.trim() : "";
  if (cellLoggingEnabled && !reasonTrimmed) return NextResponse.json({ error: "A reason for this change is required" }, { status: 400 });

  const [{ data: item }, { data: field }] = await Promise.all([
    admin.from("client_update_page_items").select("id, record_table, record_id").eq("id", itemId).eq("page_id", id).maybeSingle(),
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
  //
  // One target table can now have more than one registry watching it (see
  // 20260729250000_auto_fed_multi_source_properties.sql -- e.g.
  // Irregularities is watched by both an entities and a properties
  // registry), so this reads every registry for the target and unions their
  // editable_field_keys rather than assuming exactly one row.
  if (gate.page.page_kind === "auto_fed") {
    const [{ data: sourceField }, { data: registries }] = await Promise.all([
      admin.from("company_table_fields").select("field_key").eq("id", field.field_key).maybeSingle(),
      admin.from("auto_fed_registries").select("editable_field_keys").eq("target_table_id", gate.page.source_table_id),
    ]);
    const editableFieldKeys = (registries || []).flatMap((r: any) => r.editable_field_keys || []);
    if (!sourceField || !editableFieldKeys.includes(sourceField.field_key)) {
      return NextResponse.json({ error: "This column isn't editable here" }, { status: 400 });
    }
    const { data: existing } = await admin.from("company_table_values").select("value_text").eq("field_id", field.field_key).eq("record_id", item.record_id).maybeSingle();
    const { error } = await admin.from("company_table_values")
      .upsert({ company_id: companyId, table_id: gate.page.source_table_id, record_id: item.record_id, field_id: field.field_key, value_text: value ?? null }, { onConflict: "field_id,record_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (cellLoggingEnabled) {
      const actorName = await resolveActorName(admin, user.id);
      await logChange(admin, id, actorName, "staff", "value_changed", `Set "${field.label}" to ${value || "(blank)"}`, {
        itemId, fieldId, oldValue: existing?.value_text ?? null, newValue: value || null, reason: reasonTrimmed,
      });
    }
    return NextResponse.json({ ok: true });
  }
  const baseTable: string = gate.page.base_table;
  const recordId: string = item.record_id;
  const isCustomTable = !isSystemTable(baseTable);

  // Only a projects-based record has a linked property (see below) -- fetch
  // its own row when it's a system table so property_id/name are on hand;
  // a custom-table record has no single "row" shape, so its display name
  // (for the activity log) is resolved separately via displayNameById.
  const { data: record } = !isCustomTable
    ? await admin.from(baseTable).select("*").eq("id", recordId).maybeSingle()
    : { data: null as any };
  const displayNameById = isCustomTable ? await resolveDisplayNamesBatch(admin, baseTable, [recordId]) : null;

  // oldValue is whatever the branch below read before it overwrote the
  // record -- passed in here so the per-cell history (see
  // components/clientUpdatePages/CellHistoryPopover.tsx) can show a real
  // before/after instead of just the new value.
  // newValueLabel overrides the raw `value` for display -- relation fields
  // pass their picked record's resolved name here instead of its raw id.
  const logAfterSave = async (oldValue: any, newValueLabel?: string | null) => {
    if (!cellLoggingEnabled) return;
    const actorName = await resolveActorName(admin, user.id);
    const newDisplay = newValueLabel !== undefined ? newValueLabel : value;
    const displayValue = newDisplay == null || newDisplay === "" ? "(blank)" : String(newDisplay);
    const recordName = record?.name || displayNameById?.get(recordId) || "this record";
    await logChange(admin, id, actorName, "staff", "value_changed", `Set "${field.label}" to ${displayValue} on ${recordName}`, {
      itemId, fieldId,
      oldValue: oldValue == null || oldValue === "" ? null : String(oldValue),
      newValue: newDisplay == null || newDisplay === "" ? null : String(newDisplay),
      reason: reasonTrimmed,
    });
  };

  // Read-only -- see lib/clientUpdatePageDetail.ts's header comment. Editing
  // continues to happen on the entity's own record, not through this report.
  if (field.field_source === "related_entity") {
    return NextResponse.json({ error: "This column isn't editable here" }, { status: 400 });
  }

  // Trust link (entities pages only) -- lives on entity_relationships, not
  // a value table, same write this mirrors from
  // .../items/[itemId]/trust/route.ts PUT (and the Irregularities "fix"
  // flow's 'trust_link' sentinel branch).
  if (field.field_source === "entity_relation") {
    const { data: existing } = await admin.from("entity_relationships")
      .select("id, parent_entity_id").eq("child_entity_id", recordId).eq("relationship_type", "Trustee").maybeSingle();
    const oldTrustId = existing?.parent_entity_id ?? null;
    if (!value) {
      if (existing) await admin.from("entity_relationships").delete().eq("id", existing.id);
    } else if (existing) {
      await admin.from("entity_relationships").update({ parent_entity_id: value, is_current: true }).eq("id", existing.id);
    } else {
      await admin.from("entity_relationships").insert({ parent_entity_id: value, child_entity_id: recordId, relationship_type: "Trustee", is_current: true });
    }
    const [oldLabel, newLabel] = await Promise.all([resolveRelationLabel(admin, "entities", oldTrustId), resolveRelationLabel(admin, "entities", value)]);
    await logAfterSave(oldLabel, newLabel);
    return NextResponse.json({ ok: true });
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
  // pages only (any other page's fields route never offers these, so this
  // branch is unreached otherwise). A matter with 2+ properties
  // (project_properties junction) edits a specific one at a time (whichever
  // split row/card the edit came from, passed as propertyId); a
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
    const isRelation = RELATION_FIELD_TYPES.includes(cf.field_type);
    const relationTable = isRelation ? relationRecordTable(cf.field_type) : null;
    const { data: existingVal } = await admin.from("company_custom_field_values").select("value_text, value_number, value_date, value_boolean, value_record_id").eq("field_id", key).eq("record_id", targetPropertyId).maybeSingle();
    const oldValue = existingVal && (isRelation ? existingVal.value_record_id : ["number", "currency"].includes(cf.field_type) ? existingVal.value_number : cf.field_type === "date" ? existingVal.value_date : cf.field_type === "boolean" ? existingVal.value_boolean : existingVal.value_text);
    const row: Record<string, any> = {
      field_id: key, record_id: targetPropertyId, company_id: companyId, table_name: "properties",
      value_text: null, value_number: null, value_date: null, value_boolean: null, value_record_id: null, value_record_capacity: null,
    };
    if (isRelation) { row.value_record_id = value || null; row.value_record_capacity = value ? (capacity || null) : null; }
    else if (["number", "currency"].includes(cf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
    else if (cf.field_type === "date") row.value_date = value || null;
    else if (cf.field_type === "boolean") row.value_boolean = !!value;
    else row.value_text = value ?? null;
    const { error } = await admin.from("company_custom_field_values").upsert(row, { onConflict: "field_id,record_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (isRelation) {
      const [oldLabel, newLabel] = await Promise.all([resolveRelationLabel(admin, relationTable, oldValue), resolveRelationLabel(admin, relationTable, value)]);
      await logAfterSave(oldLabel, newLabel);
    } else {
      await logAfterSave(oldValue ?? null);
    }
    return NextResponse.json({ ok: true });
  }

  // Per-(project, property) transaction fields (purchase price, deposit/
  // settlement dates, ...) -- a genuinely different mechanism from the
  // 'property' block above: those write onto a PROPERTY's own persistent
  // row (shared across every matter that ever links to it); this writes
  // onto THIS matter's own pairing with that property instead, so a resold
  // property never keeps a past matter's price/dates attached to it. See
  // supabase/migrations/20260729360000_project_property_values.sql. Same
  // "which property did this edit come from" resolution as the 'property'
  // block, since it's the identical multi-property-matter problem.
  if (baseTable === "projects" && field.field_source === "project_property") {
    const { data: links } = await admin.from("project_properties").select("id, property_id").eq("project_id", recordId).order("created_at", { ascending: true });
    const linkedRows = links || [];
    const fallback = linkedRows[0] || null;
    const targetLink = (propertyId && linkedRows.find((l: any) => l.property_id === propertyId)) || fallback;
    if (!targetLink) return NextResponse.json({ error: "This matter has no linked property" }, { status: 400 });
    const projectPropertyId = targetLink.id;

    const { data: cf } = await admin.from("company_custom_fields").select("field_type").eq("id", field.field_key).maybeSingle();
    if (!cf) return NextResponse.json({ error: "Field definition not found" }, { status: 404 });
    const isRelation = RELATION_FIELD_TYPES.includes(cf.field_type);
    const relationTable = isRelation ? relationRecordTable(cf.field_type) : null;
    const { data: existingVal } = await admin.from("project_property_values").select("value_text, value_number, value_date, value_boolean, value_record_id").eq("field_id", field.field_key).eq("project_property_id", projectPropertyId).maybeSingle();
    const oldValue = existingVal && (isRelation ? existingVal.value_record_id : ["number", "currency"].includes(cf.field_type) ? existingVal.value_number : cf.field_type === "date" ? existingVal.value_date : cf.field_type === "boolean" ? existingVal.value_boolean : existingVal.value_text);
    const row: Record<string, any> = {
      field_id: field.field_key, project_property_id: projectPropertyId, company_id: companyId,
      value_text: null, value_number: null, value_date: null, value_boolean: null, value_record_id: null, value_record_capacity: null,
      updated_at: new Date().toISOString(),
    };
    if (isRelation) { row.value_record_id = value || null; row.value_record_capacity = value ? (capacity || null) : null; }
    else if (["number", "currency"].includes(cf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
    else if (cf.field_type === "date") row.value_date = value || null;
    else if (cf.field_type === "boolean") row.value_boolean = !!value;
    else row.value_text = value ?? null;
    const { error } = await admin.from("project_property_values").upsert(row, { onConflict: "project_property_id,field_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // A direct edit here IS a human review of this cell -- clears any
    // "AI set this, not yet confirmed" flag left by the settlement-date
    // review feature (see client_update_page_ai_field_flags's migration
    // header) regardless of which project_property field was touched, not
    // just Settlement Date, since the same mechanism could cover another
    // field later.
    await admin.from("client_update_page_ai_field_flags").delete()
      .eq("item_id", itemId).eq("project_property_id", projectPropertyId).eq("field_key", field.field_key);
    if (isRelation) {
      const [oldLabel, newLabel] = await Promise.all([resolveRelationLabel(admin, relationTable, oldValue), resolveRelationLabel(admin, relationTable, value)]);
      await logAfterSave(oldLabel, newLabel);
    } else {
      await logAfterSave(oldValue ?? null);
    }
    return NextResponse.json({ ok: true });
  }

  if (field.field_source === "base" && isCustomTable) {
    // field.field_key is a company_table_fields.id -- a custom table has no
    // native columns of its own, every 'base' field's value lives in
    // company_table_values, typed by that field's own field_type.
    const { data: ctf } = await admin.from("company_table_fields").select("field_type, linked_table_id").eq("id", field.field_key).maybeSingle();
    if (!ctf) return NextResponse.json({ error: "Field definition not found" }, { status: 404 });
    const isRelation = RELATION_FIELD_TYPES.includes(ctf.field_type);
    const relationTable = isRelation ? relationRecordTable(ctf.field_type, ctf.linked_table_id) : null;
    const { data: existingVal } = await admin.from("company_table_values").select("value_text, value_number, value_date, value_boolean, value_record_id").eq("field_id", field.field_key).eq("record_id", recordId).maybeSingle();
    const oldValue = existingVal && (isRelation ? existingVal.value_record_id : ["number", "currency"].includes(ctf.field_type) ? existingVal.value_number : ctf.field_type === "date" ? existingVal.value_date : ctf.field_type === "boolean" ? existingVal.value_boolean : existingVal.value_text);
    const row: Record<string, any> = {
      field_id: field.field_key, record_id: recordId, table_id: baseTable, company_id: companyId,
      value_text: null, value_number: null, value_date: null, value_boolean: null, value_record_id: null,
    };
    if (isRelation) row.value_record_id = value || null;
    else if (["number", "currency"].includes(ctf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
    else if (ctf.field_type === "date") row.value_date = value || null;
    else if (ctf.field_type === "boolean") row.value_boolean = !!value;
    else row.value_text = value ?? null;
    const { error } = await admin.from("company_table_values").upsert(row, { onConflict: "field_id,record_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (isRelation) {
      const [oldLabel, newLabel] = await Promise.all([resolveRelationLabel(admin, relationTable, oldValue), resolveRelationLabel(admin, relationTable, value)]);
      await logAfterSave(oldLabel, newLabel);
    } else {
      await logAfterSave(oldValue ?? null);
    }
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
  const isRelation = RELATION_FIELD_TYPES.includes(cf.field_type);
  const relationTable = isRelation ? relationRecordTable(cf.field_type) : null;

  const { data: existingVal } = await admin.from("company_custom_field_values").select("value_text, value_number, value_date, value_boolean, value_record_id").eq("field_id", field.field_key).eq("record_id", recordId).maybeSingle();
  const oldValue = existingVal && (isRelation ? existingVal.value_record_id : ["number", "currency"].includes(cf.field_type) ? existingVal.value_number : cf.field_type === "date" ? existingVal.value_date : cf.field_type === "boolean" ? existingVal.value_boolean : existingVal.value_text);

  const row: Record<string, any> = {
    field_id: field.field_key, record_id: recordId, company_id: companyId, table_name: baseTable,
    value_text: null, value_number: null, value_date: null, value_boolean: null, value_record_id: null, value_record_capacity: null,
  };
  if (isRelation) { row.value_record_id = value || null; row.value_record_capacity = value ? (capacity || null) : null; }
  else if (["number", "currency"].includes(cf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
  else if (cf.field_type === "date") row.value_date = value || null;
  else if (cf.field_type === "boolean") row.value_boolean = !!value;
  else row.value_text = value ?? null;

  const { error } = await admin.from("company_custom_field_values").upsert(row, { onConflict: "field_id,record_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (isRelation) {
    const [oldLabel, newLabel] = await Promise.all([resolveRelationLabel(admin, relationTable, oldValue), resolveRelationLabel(admin, relationTable, value)]);
    await logAfterSave(oldLabel, newLabel);
  } else {
    await logAfterSave(oldValue ?? null);
  }
  return NextResponse.json({ ok: true });
}
