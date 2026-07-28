// app/api/client-update-pages/[id]/items/[itemId]/fix/route.ts
// The one-click "fix this field" mechanism for a custom_table irregularity
// item (see supabase/migrations/20260729110000_niksen_irregularities_field_link.sql's
// target_field_key). GET resolves which entity + which exact field is
// flagged and returns enough metadata to render the right inline editor;
// PATCH writes the fix straight onto that entity (native column,
// company_custom_field_values, or entity_relationships for the 'trust_link'
// sentinel) -- never onto the irregularity row itself, which is
// database-trigger-managed and will flip to Resolved on its own the moment
// the underlying entity is actually fixed (see niksen_recompute_entity_irregularities).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

// Labels/types for the native-column target_field_key values a rule can
// name -- mirrors the entities columns niksen_recompute_entity_irregularities
// actually checks (see that function for the full rule list).
const NATIVE_FIELD_META: Record<string, { label: string; fieldType: string }> = {
  established_date: { label: "Established Date", fieldType: "text" },
  tfn: { label: "TFN", fieldType: "text" },
  acn: { label: "ACN", fieldType: "text" },
  abn: { label: "ABN", fieldType: "text" },
};

async function resolveTarget(admin: any, pageId: string, itemId: string, companyId: string) {
  const { data: item } = await admin.from("client_update_page_items").select("id, custom_record_id").eq("id", itemId).eq("page_id", pageId).maybeSingle();
  if (!item?.custom_record_id) return { error: NextResponse.json({ error: "Item not found" }, { status: 404 }) };

  const { data: values } = await admin.from("company_table_values")
    .select("field_id, value_text, value_record_id, field:company_table_fields(field_key)")
    .eq("record_id", item.custom_record_id);
  const byFieldKey = Object.fromEntries((values || []).map((v: any) => [v.field?.field_key, v]));
  const entityId: string | undefined = byFieldKey.entity?.value_record_id;
  const targetFieldKey: string | undefined = byFieldKey.target_field_key?.value_text;
  if (!entityId || !targetFieldKey) return { error: NextResponse.json({ error: "Nothing to fix on this item" }, { status: 400 }) };

  const { data: entity } = await admin.from("entities").select("id, name, company_id").eq("id", entityId).maybeSingle();
  if (!entity || entity.company_id !== companyId) return { error: NextResponse.json({ error: "Entity not found" }, { status: 404 }) };

  return { entity, targetFieldKey };
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
  const { entity, targetFieldKey } = resolved;

  if (targetFieldKey === "trust_link") {
    const { data: rel } = await admin.from("entity_relationships")
      .select("id, parent_entity_id, trust:parent_entity_id(name)")
      .eq("child_entity_id", entity.id).eq("relationship_type", "Trustee")
      .or("is_current.is.null,is_current.eq.true").maybeSingle();
    return NextResponse.json({
      entityId: entity.id, entityName: entity.name, fieldKey: "trust_link", fieldLabel: "Trust", fieldType: "entity",
      currentValue: rel?.parent_entity_id ?? null, currentLabel: (rel as any)?.trust?.name ?? null,
    });
  }

  if (NATIVE_FIELD_META[targetFieldKey]) {
    const { data: row } = await admin.from("entities").select(targetFieldKey).eq("id", entity.id).maybeSingle();
    return NextResponse.json({
      entityId: entity.id, entityName: entity.name, fieldKey: targetFieldKey,
      fieldLabel: NATIVE_FIELD_META[targetFieldKey].label, fieldType: NATIVE_FIELD_META[targetFieldKey].fieldType,
      currentValue: (row as any)?.[targetFieldKey] ?? null,
    });
  }

  // Otherwise targetFieldKey is a company_custom_fields.id.
  const { data: cf } = await admin.from("company_custom_fields").select("id, label, field_type, select_options").eq("id", targetFieldKey).maybeSingle();
  if (!cf) return NextResponse.json({ error: "Target field definition not found" }, { status: 404 });
  const { data: val } = await admin.from("company_custom_field_values").select("value_text, value_number, value_date, value_boolean").eq("field_id", cf.id).eq("record_id", entity.id).maybeSingle();
  return NextResponse.json({
    entityId: entity.id, entityName: entity.name, fieldKey: cf.id, fieldLabel: cf.label, fieldType: cf.field_type, selectOptions: cf.select_options,
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
  const { entity, targetFieldKey } = resolved;

  const body = await req.json().catch(() => ({}));
  const { value } = body;

  if (targetFieldKey === "trust_link") {
    const { data: existing } = await admin.from("entity_relationships")
      .select("id").eq("child_entity_id", entity.id).eq("relationship_type", "Trustee").maybeSingle();
    if (!value) {
      if (existing) await admin.from("entity_relationships").delete().eq("id", existing.id);
    } else if (existing) {
      await admin.from("entity_relationships").update({ parent_entity_id: value, is_current: true }).eq("id", existing.id);
    } else {
      await admin.from("entity_relationships").insert({ parent_entity_id: value, child_entity_id: entity.id, relationship_type: "Trustee", is_current: true });
    }
    return NextResponse.json({ ok: true });
  }

  if (NATIVE_FIELD_META[targetFieldKey]) {
    const { error } = await admin.from("entities").update({ [targetFieldKey]: value || null }).eq("id", entity.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const { data: cf } = await admin.from("company_custom_fields").select("field_type").eq("id", targetFieldKey).maybeSingle();
  if (!cf) return NextResponse.json({ error: "Target field definition not found" }, { status: 404 });
  const row: Record<string, any> = {
    field_id: targetFieldKey, record_id: entity.id, company_id: companyId, table_name: "entities",
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
