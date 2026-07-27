// app/api/client-update-pages/[id]/fields/[fieldId]/promote/route.ts
// Turns a page-only ("adhoc") report column into a real custom field on
// Matters (company_custom_fields, table_name='projects') -- so it shows up
// on the normal matter dashboard and is reusable across every Client
// Update Page group, not just this one page. Existing values already
// entered here migrate across to company_custom_field_values so nothing
// staff have typed in is lost. The page's own field row (same id, same
// position in the column order, same group conditions/format rules that
// reference it) is repointed from an adhoc snapshot to field_source:
// 'custom' pointing at the new field, rather than leaving a stale
// duplicate column behind.
//
// The caller picks the real field type explicitly (fieldType in the body)
// -- an adhoc column is only ever 'text' or 'select' (see the fields POST
// route), which is rarely the type you actually want on the real matter
// record (e.g. a report-only text column of dollar figures should become
// a real 'currency' field, not stay 'text'). Values already entered are
// converted to match; a value that doesn't parse for the chosen type
// (e.g. free text in a column now being saved as 'date') is left
// unmigrated rather than writing garbage into the real field.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

const ALLOWED_TYPES = ["text", "select", "number", "currency", "date", "boolean"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const { id, fieldId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const fieldType = ALLOWED_TYPES.includes(body.fieldType) ? body.fieldType : null;
  if (!fieldType) return NextResponse.json({ error: "Choose a field type" }, { status: 400 });

  const { data: field } = await admin.from("client_update_page_fields")
    .select("id, label, field_source, select_options").eq("id", fieldId).eq("page_id", id).maybeSingle();
  if (!field) return NextResponse.json({ error: "Field not found" }, { status: 404 });
  if (field.field_source !== "adhoc") {
    return NextResponse.json({ error: "Only report-only columns can be saved as a custom field -- this one already comes from a real matter field" }, { status: 400 });
  }

  const { count: dup } = await admin.from("company_custom_fields").select("id", { count: "exact", head: true })
    .eq("company_id", companyId).eq("table_name", "projects").eq("label", field.label).is("deleted_at", null);
  if (dup) return NextResponse.json({ error: `A custom field named "${field.label}" already exists on Matters` }, { status: 400 });

  const { count: existingCount } = await admin.from("company_custom_fields").select("id", { count: "exact", head: true })
    .eq("company_id", companyId).eq("table_name", "projects");

  const selectOptions = fieldType === "select" ? (field.select_options || null) : null;

  const { data: customField, error: cfError } = await admin.from("company_custom_fields").insert({
    company_id: companyId, table_name: "projects", field_key: `field_${Date.now()}`,
    label: field.label, field_type: fieldType, select_options: selectOptions,
    display_order: existingCount || 0, grid_width: 2, show_in_table: false, is_required: false, is_unique: false,
  }).select("id").single();
  if (cfError) return NextResponse.json({ error: cfError.message }, { status: 500 });

  const { data: values } = await admin.from("client_update_page_values").select("item_id, value_text").eq("field_id", fieldId);
  if (values?.length) {
    const { data: items } = await admin.from("client_update_page_items").select("id, project_id").in("id", values.map((v: any) => v.item_id));
    const projectIdByItem = new Map((items || []).map((i: any) => [i.id, i.project_id]));
    const rows = values
      .map((v: any) => {
        const recordId = projectIdByItem.get(v.item_id);
        if (!recordId || v.value_text == null || v.value_text === "") return null;
        const row: Record<string, any> = {
          field_id: customField.id, record_id: recordId, company_id: companyId, table_name: "projects",
          value_text: null, value_number: null, value_date: null, value_boolean: null,
        };
        if (["number", "currency"].includes(fieldType)) {
          const n = Number(v.value_text);
          if (Number.isNaN(n)) return null;
          row.value_number = n;
        } else if (fieldType === "date") {
          if (!ISO_DATE.test(v.value_text)) return null;
          row.value_date = v.value_text;
        } else if (fieldType === "boolean") {
          row.value_boolean = ["true", "yes", "1"].includes(String(v.value_text).toLowerCase());
        } else {
          row.value_text = v.value_text;
        }
        return row;
      })
      .filter((r: any) => r !== null);
    if (rows.length) {
      const { error: valuesError } = await admin.from("company_custom_field_values").upsert(rows, { onConflict: "field_id,record_id" });
      if (valuesError) return NextResponse.json({ error: valuesError.message }, { status: 500 });
    }
  }

  const { data: updatedField, error: updateError } = await admin.from("client_update_page_fields")
    .update({ field_source: "custom", field_key: customField.id, field_type: fieldType, select_options: selectOptions }).eq("id", fieldId)
    .select("id, field_source, field_key, label, display_order, client_visible, field_type, select_options, group_id").single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await admin.from("client_update_page_values").delete().eq("field_id", fieldId);

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "field_promoted", `Saved "${field.label}" as a ${fieldType} custom field on Matters`);

  return NextResponse.json({ field: updatedField });
}
