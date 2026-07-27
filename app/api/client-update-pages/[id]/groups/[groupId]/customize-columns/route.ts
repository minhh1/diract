// app/api/client-update-pages/[id]/groups/[groupId]/customize-columns/route.ts
// A top-level group shows the page's shared column set (client_update_page_
// fields.group_id IS NULL) by default -- it only diverges once someone
// explicitly customizes it here, which snapshots a copy of the current
// shared fields as this group's own rows (adhoc field_keys are regenerated
// to avoid collisions). DELETE reverts: it drops the group's own rows so it
// falls back to the shared set again. Only top-level groups can diverge --
// a subgroup always shows its parent's columns (see MatterBoard.tsx).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id, groupId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: group } = await admin.from("client_update_groups").select("id, name, parent_group_id").eq("id", groupId).eq("page_id", id).maybeSingle();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  if (group.parent_group_id) return NextResponse.json({ error: "Only a top-level group's columns can be customized" }, { status: 400 });

  const { count: alreadyCustom } = await admin.from("client_update_page_fields").select("id", { count: "exact", head: true }).eq("page_id", id).eq("group_id", groupId);
  if (alreadyCustom) return NextResponse.json({ error: "This group already has customized columns" }, { status: 400 });

  const { data: sharedFields } = await admin.from("client_update_page_fields")
    .select("field_source, field_key, label, display_order, client_visible, field_type, select_options").eq("page_id", id).is("group_id", null);

  if (sharedFields?.length) {
    const { error } = await admin.from("client_update_page_fields").insert(
      sharedFields.map((f: any) => ({ ...f, page_id: id, group_id: groupId, field_key: f.field_source === "adhoc" ? `adhoc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}` : f.field_key }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "columns_customized", `Customized columns for "${group.name}" (started from the shared set)`);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id, groupId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: group } = await admin.from("client_update_groups").select("id, name").eq("id", groupId).eq("page_id", id).maybeSingle();
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  // Same guard as the single-field DELETE route -- reverting drops every
  // one of this group's own fields in one shot, so it can hit the exact
  // same silent-condition-breakage risk in bulk (see
  // app/api/client-update-pages/[id]/fields/[fieldId]/route.ts).
  const { data: ownFields } = await admin.from("client_update_page_fields").select("id").eq("page_id", id).eq("group_id", groupId);
  const ownFieldIds = (ownFields || []).map((f: any) => f.id);
  if (ownFieldIds.length) {
    const { data: dependentGroups } = await admin.from("client_update_groups").select("name").eq("page_id", id).in("condition_field_id", ownFieldIds);
    if (dependentGroups?.length) {
      const names = dependentGroups.map((g: any) => `"${g.name}"`).join(", ");
      return NextResponse.json({ error: `Can't revert "${group.name}" -- one of its columns is used as the condition for ${names}. Clear or change that condition first.` }, { status: 400 });
    }
  }

  const { error } = await admin.from("client_update_page_fields").delete().eq("page_id", id).eq("group_id", groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "columns_reverted", `Reverted "${group.name}" to the shared column set`);

  return NextResponse.json({ ok: true });
}
