// app/api/client-update-pages/[id]/groups/[groupId]/route.ts
// Rename/reorder a group, set/clear its condition, or delete it -- deleting
// just un-groups its matters (client_update_page_items.group_id ON DELETE
// SET NULL), it never removes the matters themselves.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id, groupId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: existing } = await admin.from("client_update_groups").select("id, name, condition_field_id").eq("id", groupId).eq("page_id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, any> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.displayOrder === "number") updates.display_order = body.displayOrder;
  // Condition fields are set together -- clearing one clears both (falls
  // back to manual/drag assignment for this group).
  let conditionChanged = false;
  if ("conditionFieldId" in body) {
    updates.condition_field_id = body.conditionFieldId || null;
    updates.condition_value = body.conditionFieldId ? (body.conditionValue ?? null) : null;
    conditionChanged = true;
  }
  // Staff's Status-checkbox selection for this (top-level) group, applied
  // page-wide as the default for everyone -- a client can still locally
  // override it (see MatterBoard.tsx), which never writes back here.
  if ("defaultStatusNames" in body) {
    updates.default_status_names = Array.isArray(body.defaultStatusNames) ? body.defaultStatusNames : null;
  }
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { error } = await admin.from("client_update_groups").update(updates).eq("id", groupId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  if (updates.name && updates.name !== existing.name) {
    await logChange(admin, id, actorName, "staff", "group_renamed", `Renamed group "${existing.name}" to "${updates.name}"`);
  }
  if (conditionChanged) {
    const detail = body.conditionFieldId
      ? `Set condition on "${updates.name || existing.name}": equals "${body.conditionValue}"`
      : `Cleared condition on "${updates.name || existing.name}"`;
    await logChange(admin, id, actorName, "staff", "group_condition_changed", detail);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; groupId: string }> }) {
  const { id, groupId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: existing } = await admin.from("client_update_groups").select("id, name").eq("id", groupId).eq("page_id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Group not found" }, { status: 404 });

  const { error } = await admin.from("client_update_groups").delete().eq("id", groupId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "group_deleted", `Deleted group "${existing.name}"`);

  return NextResponse.json({ ok: true });
}
