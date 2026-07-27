// app/api/client-update-pages/[id]/items/[itemId]/route.ts
// Move a matter to a different group (or null = Ungrouped), reorder it, or
// remove it from the page entirely (the underlying matter/project is never
// touched -- this only removes it from this report).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, any> = {};
  if ("groupId" in body) updates.group_id = body.groupId || null;
  if (typeof body.displayOrder === "number") updates.display_order = body.displayOrder;
  if ("displayName" in body) updates.display_name = body.displayName?.trim() || null;
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: before } = await admin.from("client_update_page_items").select("project_id, display_name").eq("id", itemId).eq("page_id", id).maybeSingle();
  const { error } = await admin.from("client_update_page_items").update(updates).eq("id", itemId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: project } = before?.project_id ? await admin.from("projects").select("name").eq("id", before.project_id).maybeSingle() : { data: null };

  if ("groupId" in body) {
    const { data: group } = body.groupId ? await admin.from("client_update_groups").select("name").eq("id", body.groupId).maybeSingle() : { data: null };
    const actorName = await resolveActorName(admin, user.id);
    await logChange(admin, id, actorName, "staff", "matter_moved", `Moved "${project?.name || "a matter"}" to ${group?.name || "Ungrouped"}`);
  }

  if ("displayName" in body) {
    const actorName = await resolveActorName(admin, user.id);
    const newTitle = updates.display_name || project?.name || "a matter";
    await logChange(admin, id, actorName, "staff", "matter_renamed", `Renamed "${before?.display_name || project?.name || "a matter"}" to "${newTitle}" on this page`);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const { data: item } = await admin.from("client_update_page_items").select("project_id").eq("id", itemId).eq("page_id", id).maybeSingle();
  const { data: project } = item?.project_id ? await admin.from("projects").select("name").eq("id", item.project_id).maybeSingle() : { data: null };

  const { error } = await admin.from("client_update_page_items").delete().eq("id", itemId).eq("page_id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "matter_removed", `Removed "${project?.name || "a matter"}" from the page`);

  return NextResponse.json({ ok: true });
}
