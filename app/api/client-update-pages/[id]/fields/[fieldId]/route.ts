// app/api/client-update-pages/[id]/fields/[fieldId]/route.ts
// Removing a field from a page only removes it from this report -- for
// base/custom fields the underlying projects/properties/
// company_custom_field_values data is completely untouched.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

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
