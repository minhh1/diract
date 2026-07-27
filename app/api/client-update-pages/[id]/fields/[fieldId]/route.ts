// app/api/client-update-pages/[id]/fields/[fieldId]/route.ts
// Removing a field from a page only removes it from this report -- for
// base/custom fields the underlying projects/properties/
// company_custom_field_values data is completely untouched.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

// Adds one new option to a select-type field's declared select_options --
// e.g. a new Status value like "Not Exchanged". This is currently the only
// way a select field's option list can grow after creation: adhoc fields
// snapshot select_options once at add-time (see the fields POST route) and
// nothing else in the app writes to that column. GroupConditionModal's
// "Equals" dropdown is hard-limited to whatever's already in this array, so
// without this route a genuinely new status could never be set as a
// subgroup condition from the UI at all.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const { id, fieldId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const option = String(body.addOption || "").trim();
  if (!option) return NextResponse.json({ error: "New option text is required" }, { status: 400 });

  const { data: field } = await admin.from("client_update_page_fields").select("id, label, field_type, select_options").eq("id", fieldId).eq("page_id", id).maybeSingle();
  if (!field) return NextResponse.json({ error: "Field not found" }, { status: 404 });
  if (field.field_type !== "select") return NextResponse.json({ error: "Only dropdown columns have options" }, { status: 400 });

  const existing: string[] = field.select_options || [];
  if (existing.some(o => o.toLowerCase() === option.toLowerCase())) {
    return NextResponse.json({ field: { ...field, select_options: existing } });
  }

  const selectOptions = [...existing, option];
  const { data: updated, error } = await admin.from("client_update_page_fields").update({ select_options: selectOptions }).eq("id", fieldId).select("id, select_options").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "field_option_added", `Added "${option}" as an option for "${field.label}"`);

  return NextResponse.json({ field: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fieldId: string }> }) {
  const { id, fieldId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: existing } = await admin.from("client_update_page_fields").select("label").eq("id", fieldId).eq("page_id", id).maybeSingle();

  // client_update_groups.condition_field_id -> this table is ON DELETE SET
  // NULL, so deleting a field a subgroup's condition depends on would
  // silently blank that condition instead of erroring -- every matter
  // previously classified by it would drop into "Unclassified" with no
  // indication why (see the 2026-07-27 Niksen incident this guard was
  // added for). Block it instead and name the dependent group(s).
  const { data: dependentGroups } = await admin.from("client_update_groups").select("name").eq("page_id", id).eq("condition_field_id", fieldId);
  if (dependentGroups?.length) {
    const names = dependentGroups.map((g: any) => `"${g.name}"`).join(", ");
    return NextResponse.json({ error: `Can't remove "${existing?.label || "this column"}" -- it's used as the condition for ${names}. Clear or change that condition first.` }, { status: 400 });
  }

  const { error } = await admin.from("client_update_page_fields").delete().eq("id", fieldId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "column_removed", `Removed column "${existing?.label || "Unknown"}"`);

  return NextResponse.json({ ok: true });
}
