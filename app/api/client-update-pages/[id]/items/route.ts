// app/api/client-update-pages/[id]/items/route.ts
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
  const { projectId, groupId } = body;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id, name, company_id").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) {
    return NextResponse.json({ error: "Matter not found" }, { status: 404 });
  }

  const { count } = await admin.from("client_update_page_items").select("id", { count: "exact", head: true }).eq("page_id", id);
  const { data: item, error } = await admin.from("client_update_page_items")
    .insert({ page_id: id, project_id: projectId, group_id: groupId || null, display_order: count || 0 })
    .select("id, project_id, group_id, display_order").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That matter is already on this page" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "matter_added", `Added matter "${project.name}" to the page`);

  return NextResponse.json({ item });
}
