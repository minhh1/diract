// app/api/client-update-pages/[id]/items/[itemId]/fix/route.ts
// The one-click "fix this field" mechanism for an auto_fed irregularity
// item (see supabase/migrations/20260729110000_niksen_irregularities_field_link.sql's
// target_field_key). GET resolves which record + which exact field is
// flagged and returns enough metadata to render the right inline editor;
// PATCH writes the fix straight onto that record (native column,
// custom field, or entity_relationships for the 'trust_link' sentinel) --
// never onto the irregularity row itself, which is database-trigger-managed
// and flips to Resolved on its own the moment the underlying record is
// actually fixed (see auto_fed_recompute).
//
// The flagged record can come from more than one source table now (see
// 20260729260000_auto_fed_multi_source_properties.sql /
// 20260729270000_auto_fed_custom_table_source.sql) -- entities (via the
// 'entity' relation field), properties ('property'), or a genuinely custom
// table like Contacts ('table_relation', disambiguated by linked_table_id).
// resolveTarget below reads whichever one of those is actually populated on
// the item, rather than assuming 'entity' the way this route originally did
// (a real bug: a Property- or Contacts-sourced item had no 'entity' value at
// all, so every fix attempt on one silently 400'd and the panel rendered
// nothing).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { isSystemTable, resolveDisplayNamesBatch } from "@/lib/clientUpdatePageTableResolver";

// Labels/types for the native-column target_field_key values a rule can
// name, keyed by which system table they live on -- mirrors the columns
// the auto_fed_rules config actually checks (see
// supabase/migrations/20260729160000_niksen_irregularities_as_config.sql,
// .../20260729180000_niksen_irregularities_fixes.sql,
// .../20260729260000_auto_fed_multi_source_properties.sql for the full rule
// list). tfn/acn/abn used to be here too -- they're company_custom_fields.id
// now (see supabase/migrations/20260729310000_entities_finance_fields_to_custom.sql),
// so they fall through to the generic company_custom_fields branch below.
const NATIVE_FIELD_META: Record<string, Record<string, { label: string; fieldType: string }>> = {
  entities: {
    established_date: { label: "Established Date", fieldType: "text" },
    name: { label: "Name", fieldType: "text" },
  },
  properties: {
    street_address: { label: "Street Address", fieldType: "text" },
  },
};

// sourceTable is 'entities' | 'properties' | a company_tables.id (a
// genuinely custom source, e.g. Contacts) -- same isSystemTable() split
// clientUpdatePageTableResolver.ts already uses everywhere else.
async function resolveTarget(admin: any, pageId: string, itemId: string, companyId: string) {
  const { data: item } = await admin.from("client_update_page_items").select("id, custom_record_id").eq("id", itemId).eq("page_id", pageId).maybeSingle();
  if (!item?.custom_record_id) return { error: NextResponse.json({ error: "Item not found" }, { status: 404 }) };

  const { data: values } = await admin.from("company_table_values")
    .select("field_id, value_text, value_record_id, field:company_table_fields(field_key, field_type, linked_table_id)")
    .eq("record_id", item.custom_record_id);
  const rows = values || [];
  const targetFieldKey: string | undefined = rows.find((v: any) => v.field?.field_key === "target_field_key")?.value_text;

  // Whichever relation-type field on this row is actually populated is the
  // real link -- entity/property (system tables) or table_relation (a
  // custom source) -- mirrors auto_fed_upsert_item's v_link_field_type on
  // the write side.
  const linkRow = rows.find((v: any) => v.value_record_id && ["entity", "property", "table_relation"].includes(v.field?.field_type));
  if (!linkRow || !targetFieldKey) return { error: NextResponse.json({ error: "Nothing to fix on this item" }, { status: 400 }) };

  const recordId: string = linkRow.value_record_id;
  const fieldType: string = linkRow.field.field_type;
  const sourceTable: string = fieldType === "entity" ? "entities" : fieldType === "property" ? "properties" : linkRow.field.linked_table_id;
  if (!sourceTable) return { error: NextResponse.json({ error: "Nothing to fix on this item" }, { status: 400 }) };

  if (isSystemTable(sourceTable)) {
    const { data: record } = await admin.from(sourceTable).select("id, company_id").eq("id", recordId).maybeSingle();
    if (!record || record.company_id !== companyId) return { error: NextResponse.json({ error: "Record not found" }, { status: 404 }) };
  } else {
    const { data: record } = await admin.from("company_table_records").select("id, company_id").eq("id", recordId).maybeSingle();
    if (!record || record.company_id !== companyId) return { error: NextResponse.json({ error: "Record not found" }, { status: 404 }) };
  }
  const recordName = (await resolveDisplayNamesBatch(admin, sourceTable, [recordId])).get(recordId) || "";
  const ruleLabel: string | undefined = rows.find((v: any) => v.field?.field_key === "issue_type")?.value_text;

  return { recordId, recordName, sourceTable, targetFieldKey, ruleLabel };
}

// Duplicate Name's target_field_key ('name') is a normal renameable native
// field, but renaming isn't really "the fix" a user reaches for here --
// they want to merge the two duplicate entities together (see
// merge_duplicate_records, already the reconciliation tool's own merge
// path in app/dashboard/settings/page.tsx). Finds this entity's one
// currently-active name-duplicate, mirroring the exact
// lower(btrim(name)) match auto_fed_rules' duplicate_name condition_sql
// uses so "the other duplicate record" here is always the same entity the
// irregularity itself was raised against.
async function findDuplicatePartner(admin: any, companyId: string, entityId: string) {
  const { data: current } = await admin.from("entities").select("name").eq("id", entityId).maybeSingle();
  const normalized = (current?.name || "").trim().toLowerCase();
  if (!normalized) return null;
  const { data: candidates } = await admin.from("entities").select("id, name")
    .eq("company_id", companyId).is("deleted_at", null).neq("id", entityId);
  return (candidates || []).find((e: any) => (e.name || "").trim().toLowerCase() === normalized) ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const resolved = await resolveTarget(admin, id, itemId, companyId);
  if ("error" in resolved) return resolved.error;
  const { recordId, recordName, sourceTable, targetFieldKey, ruleLabel } = resolved;

  if (targetFieldKey === "name" && sourceTable === "entities" && ruleLabel === "Duplicate Name") {
    const partner = await findDuplicatePartner(admin, companyId, recordId);
    return NextResponse.json({
      entityId: recordId, entityName: recordName, fieldKey: "name", fieldLabel: "Duplicate Name",
      fieldType: "duplicate_merge",
      duplicateEntityId: partner?.id ?? null, duplicateEntityName: partner?.name ?? null,
    });
  }

  if (targetFieldKey === "trust_link") {
    // Only ever meaningful for an entities-sourced item (a Corporate
    // Trustee's own Trust link).
    const { data: rel } = await admin.from("entity_relationships")
      .select("id, parent_entity_id, trust:parent_entity_id(name)")
      .eq("child_entity_id", recordId).eq("relationship_type", "Trustee")
      .or("is_current.is.null,is_current.eq.true").maybeSingle();
    return NextResponse.json({
      entityId: recordId, entityName: recordName, fieldKey: "trust_link", fieldLabel: "Trust", fieldType: "entity",
      currentValue: rel?.parent_entity_id ?? null, currentLabel: (rel as any)?.trust?.name ?? null,
    });
  }

  const nativeMeta = NATIVE_FIELD_META[sourceTable]?.[targetFieldKey];
  if (nativeMeta) {
    const { data: row } = await admin.from(sourceTable).select(targetFieldKey).eq("id", recordId).maybeSingle();
    return NextResponse.json({
      entityId: recordId, entityName: recordName, fieldKey: targetFieldKey,
      fieldLabel: nativeMeta.label, fieldType: nativeMeta.fieldType,
      currentValue: (row as any)?.[targetFieldKey] ?? null,
    });
  }

  if (!isSystemTable(sourceTable)) {
    // Custom-table source (e.g. Contacts) -- targetFieldKey is a literal
    // field_key on THAT table (e.g. 'name'), not a company_custom_fields.id.
    const { data: ctf } = await admin.from("company_table_fields").select("id, label, field_type, select_options").eq("table_id", sourceTable).eq("field_key", targetFieldKey).is("deleted_at", null).maybeSingle();
    if (!ctf) return NextResponse.json({ error: "Target field definition not found" }, { status: 404 });
    const { data: val } = await admin.from("company_table_values").select("value_text, value_number, value_date, value_boolean").eq("field_id", ctf.id).eq("record_id", recordId).maybeSingle();
    return NextResponse.json({
      entityId: recordId, entityName: recordName, fieldKey: ctf.id, fieldLabel: ctf.label, fieldType: ctf.field_type, selectOptions: ctf.select_options,
      currentValue: val ? (val.value_text ?? val.value_number ?? val.value_date ?? val.value_boolean ?? null) : null,
    });
  }

  // Otherwise targetFieldKey is a company_custom_fields.id (a system-table custom field).
  const { data: cf } = await admin.from("company_custom_fields").select("id, label, field_type, select_options").eq("id", targetFieldKey).maybeSingle();
  if (!cf) return NextResponse.json({ error: "Target field definition not found" }, { status: 404 });
  const { data: val } = await admin.from("company_custom_field_values").select("value_text, value_number, value_date, value_boolean").eq("field_id", cf.id).eq("record_id", recordId).maybeSingle();
  return NextResponse.json({
    entityId: recordId, entityName: recordName, fieldKey: cf.id, fieldLabel: cf.label, fieldType: cf.field_type, selectOptions: cf.select_options,
    currentValue: val ? (val.value_text ?? val.value_number ?? val.value_date ?? val.value_boolean ?? null) : null,
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const resolved = await resolveTarget(admin, id, itemId, companyId);
  if ("error" in resolved) return resolved.error;
  const { recordId, sourceTable, targetFieldKey } = resolved;

  const body = await req.json().catch(() => ({}));
  const { value } = body;

  if (targetFieldKey === "trust_link") {
    const { data: existing } = await admin.from("entity_relationships")
      .select("id").eq("child_entity_id", recordId).eq("relationship_type", "Trustee").maybeSingle();
    if (!value) {
      if (existing) await admin.from("entity_relationships").delete().eq("id", existing.id);
    } else if (existing) {
      await admin.from("entity_relationships").update({ parent_entity_id: value, is_current: true }).eq("id", existing.id);
    } else {
      await admin.from("entity_relationships").insert({ parent_entity_id: value, child_entity_id: recordId, relationship_type: "Trustee", is_current: true });
    }
    return NextResponse.json({ ok: true });
  }

  if (NATIVE_FIELD_META[sourceTable]?.[targetFieldKey]) {
    const { error } = await admin.from(sourceTable).update({ [targetFieldKey]: value || null }).eq("id", recordId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!isSystemTable(sourceTable)) {
    const { data: ctf } = await admin.from("company_table_fields").select("id, field_type").eq("table_id", sourceTable).eq("field_key", targetFieldKey).is("deleted_at", null).maybeSingle();
    if (!ctf) return NextResponse.json({ error: "Target field definition not found" }, { status: 404 });
    const row: Record<string, any> = {
      field_id: ctf.id, record_id: recordId, company_id: companyId, table_id: sourceTable,
      value_text: null, value_number: null, value_date: null, value_boolean: null,
    };
    if (["number", "currency"].includes(ctf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
    else if (ctf.field_type === "date") row.value_date = value || null;
    else if (ctf.field_type === "boolean") row.value_boolean = !!value;
    else row.value_text = value ?? null;
    const { error } = await admin.from("company_table_values").upsert(row, { onConflict: "field_id,record_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: cf } = await admin.from("company_custom_fields").select("field_type").eq("id", targetFieldKey).maybeSingle();
  if (!cf) return NextResponse.json({ error: "Target field definition not found" }, { status: 404 });
  const row: Record<string, any> = {
    field_id: targetFieldKey, record_id: recordId, company_id: companyId, table_name: sourceTable,
    value_text: null, value_number: null, value_date: null, value_boolean: null,
  };
  if (["number", "currency"].includes(cf.field_type)) row.value_number = value === "" || value == null ? null : Number(value);
  else if (cf.field_type === "date") row.value_date = value || null;
  else if (cf.field_type === "boolean") row.value_boolean = !!value;
  else row.value_text = value ?? null;
  const { error } = await admin.from("company_custom_field_values").upsert(row, { onConflict: "field_id,record_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Duplicate Name's "fix": merge the flagged entity's duplicate into it via
// merge_duplicate_records (see that migration for exactly what gets
// reassigned), keeping this item's own entity and archiving the partner
// found by findDuplicatePartner. merge_duplicate_records is SECURITY
// INVOKER and normally relies on the calling browser session hitting
// trg_prevent_non_admin_delete under the real user -- but
// prevent_non_admin_delete() explicitly no-ops for auth.role() =
// 'service_role' (see supabase/archive_requests.sql), which is exactly the
// role this route's admin client runs as. So the admin check below is not
// optional -- without it, any company member could merge entities through
// this endpoint regardless of role.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can merge duplicates." }, { status: 403 });

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const resolved = await resolveTarget(admin, id, itemId, companyId);
  if ("error" in resolved) return resolved.error;
  const { recordId, sourceTable, targetFieldKey, ruleLabel } = resolved;
  if (targetFieldKey !== "name" || sourceTable !== "entities" || ruleLabel !== "Duplicate Name") {
    return NextResponse.json({ error: "This item isn't a duplicate-name irregularity" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const mergeId: string | undefined = body?.mergeId;
  if (!mergeId) return NextResponse.json({ error: "mergeId is required" }, { status: 400 });

  const { data, error } = await admin.rpc("merge_duplicate_records", {
    p_company_id: companyId, p_table_kind: "system", p_table: "entities", p_table_id: null,
    p_keep_id: recordId, p_merge_id: mergeId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...(data || {}) });
}
