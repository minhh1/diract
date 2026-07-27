// app/api/client-update-pages/[id]/groups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;

  const body = await req.json().catch(() => ({}));
  const name = body.name?.trim();
  const parentGroupId = body.parentGroupId || null;
  if (!name) return NextResponse.json({ error: "Group name is required" }, { status: 400 });

  if (parentGroupId) {
    const { data: parent } = await admin.from("client_update_groups").select("id, parent_group_id").eq("id", parentGroupId).eq("page_id", id).maybeSingle();
    if (!parent) return NextResponse.json({ error: "Parent group not found" }, { status: 404 });
    if (parent.parent_group_id) return NextResponse.json({ error: "Groups only nest one level deep" }, { status: 400 });
  }

  let countQuery = admin.from("client_update_groups").select("id", { count: "exact", head: true }).eq("page_id", id);
  countQuery = parentGroupId ? countQuery.eq("parent_group_id", parentGroupId) : countQuery.is("parent_group_id", null);
  const { count } = await countQuery;
  const { data: group, error } = await admin.from("client_update_groups")
    .insert({ page_id: id, name, parent_group_id: parentGroupId, display_order: count || 0 })
    .select("id, name, display_order, parent_group_id").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "group_created", parentGroupId ? `Created subgroup "${name}"` : `Created group "${name}"`);

  return NextResponse.json({ group });
}
