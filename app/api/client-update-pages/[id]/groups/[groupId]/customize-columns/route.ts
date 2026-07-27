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

// A subgroup's condition (e.g. Status -> "In Progress") is pinned to one
// specific field id. Customizing or reverting a group's columns replaces
// its active Status field with a different row (a fresh copy, or falling
// back to the shared one) -- if the condition isn't re-pointed to follow,
// it keeps checking the OLD field while the visible column edits the NEW
// one, so classification silently stops seeing new edits (exactly what
// happened to Niksen in production: a matter's Status showed correctly in
// the table but the matter sat in "Unclassified"). Matches by LABEL
// ("Status") since the replacement field always gets a new id. Returns the
// names of any subgroups that couldn't be resolved (no same-labelled field
// in the target scope) so the caller can decide whether to block.
async function repointConditionsByLabel(admin: any, pageId: string, groupId: string, targetGroupId: string | null): Promise<string[]> {
  const { data: subgroups } = await admin.from("client_update_groups")
    .select("id, name, condition_field_id").eq("parent_group_id", groupId).not("condition_field_id", "is", null);
  if (!subgroups?.length) return [];

  const { data: currentFields } = await admin.from("client_update_page_fields")
    .select("id, label").in("id", subgroups.map((s: any) => s.condition_field_id));
  const labelById = new Map((currentFields || []).map((f: any) => [f.id, f.label]));

  let targetQuery = admin.from("client_update_page_fields").select("id, label").eq("page_id", pageId);
  targetQuery = targetGroupId ? targetQuery.eq("group_id", targetGroupId) : targetQuery.is("group_id", null);
  const { data: targetFields } = await targetQuery;
  const targetIdByLabel = new Map((targetFields || []).map((f: any) => [f.label, f.id]));

  const unresolved: string[] = [];
  for (const sg of subgroups) {
    const label = labelById.get(sg.condition_field_id);
    const newId = label ? targetIdByLabel.get(label) : undefined;
    if (!newId) { unresolved.push(sg.name); continue; }
    if (newId !== sg.condition_field_id) {
      await admin.from("client_update_groups").update({ condition_field_id: newId }).eq("id", sg.id);
    }
  }
  return unresolved;
}

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

  // Best-effort -- a condition left pointing at the shared field still
  // works today (that field still exists), it just won't track this
  // group's own future edits. Not worth blocking the customize over.
  await repointConditionsByLabel(admin, id, groupId, groupId);

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

  // Re-point any of this group's own subgroup conditions to the matching
  // shared field BEFORE dropping the group's own fields (the field a
  // condition currently points at still needs to exist to read its label
  // off it). Only block if a condition genuinely has no shared equivalent
  // to fall back to.
  const unresolved = await repointConditionsByLabel(admin, id, groupId, null);
  if (unresolved.length) {
    const names = unresolved.map(n => `"${n}"`).join(", ");
    return NextResponse.json({ error: `Can't revert "${group.name}" -- no shared column matches the condition on ${names}. Clear or change that condition first.` }, { status: 400 });
  }

  const { error } = await admin.from("client_update_page_fields").delete().eq("page_id", id).eq("group_id", groupId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "columns_reverted", `Reverted "${group.name}" to the shared column set`);

  return NextResponse.json({ ok: true });
}
