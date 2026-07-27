// app/api/client-update-pages/[id]/values/route.ts
// Writes a staff edit made on the Client Update Page editor through to
// wherever the field actually lives -- projects/properties directly for
// 'base' fields, company_custom_field_values for 'custom' fields (same
// table the normal matter dashboard reads/writes), or
// client_update_page_values for 'adhoc' (page-only) fields. This is what
// keeps editing a matter here in sync with its normal dashboard.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const { itemId, fieldId, value } = body;
  if (!itemId || !fieldId) return NextResponse.json({ error: "itemId and fieldId are required" }, { status: 400 });

  const [{ data: item }, { data: field }] = await Promise.all([
    admin.from("client_update_page_items").select("id, project_id").eq("id", itemId).eq("page_id", id).maybeSingle(),
    admin.from("client_update_page_fields").select("id, field_source, field_key").eq("id", fieldId).eq("page_id", id).maybeSingle(),
  ]);
  if (!item) return NextResponse.json({ error: "Matter not found on this page" }, { status: 404 });
  if (!field) return NextResponse.json({ error: "Field not found on this page" }, { status: 404 });

  if (field.field_source === "adhoc") {
    const { error } = await admin.from("client_update_page_values")
      .upsert({ item_id: itemId, field_id: fieldId, value_text: value ?? null }, { onConflict: "item_id,field_id" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (field.field_source === "base") {
    if (field.field_key === "property_address" || field.field_key === "purchase_price") {
      const { data: project } = await admin.from("projects").select("property_id").eq("id", item.project_id).maybeSingle();
      if (!project?.property_id) return NextResponse.json({ error: "This matter has no linked property" }, { status: 400 });
      const column = field.field_key === "property_address" ? "street_address" : "purchase_price";
      const { error } = await admin.from("properties").update({ [column]: value ?? null }).eq("id", project.property_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    const { error } = await admin.from("projects").update({ [field.field_key]: value ?? null }).eq("id", item.project_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  return NextResponse.json({ ok: true });
}
