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
  // An auto_fed page's items are system-generated (e.g. Irregularities
  // rows, created by the rule engine) -- never manually added.
  if (gate.page.page_kind === "auto_fed") {
    return NextResponse.json({ error: "Items on this page can't be added manually" }, { status: 400 });
  }
  const baseTable: "projects" | "entities" = gate.page.base_table === "entities" ? "entities" : "projects";

  const body = await req.json().catch(() => ({}));
  const { projectId, entityId, groupId } = body;
  const recordId = baseTable === "projects" ? projectId : entityId;
  if (!recordId) return NextResponse.json({ error: `${baseTable === "projects" ? "projectId" : "entityId"} is required` }, { status: 400 });

  const { data: record } = await admin.from(baseTable).select("id, name, company_id").eq("id", recordId).maybeSingle();
  if (!record || record.company_id !== companyId) {
    return NextResponse.json({ error: baseTable === "projects" ? "Matter not found" : "Entity not found" }, { status: 404 });
  }

  const { count } = await admin.from("client_update_page_items").select("id", { count: "exact", head: true }).eq("page_id", id);
  const insertRow: Record<string, any> = { page_id: id, group_id: groupId || null, display_order: count || 0 };
  if (baseTable === "projects") insertRow.project_id = recordId; else insertRow.entity_id = recordId;
  const { data: item, error } = await admin.from("client_update_page_items")
    .insert(insertRow)
    .select("id, project_id, entity_id, group_id, display_order").single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: `That ${baseTable === "projects" ? "matter" : "entity"} is already on this page` }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", baseTable === "projects" ? "matter_added" : "entity_added", `Added ${baseTable === "projects" ? "matter" : "entity"} "${record.name}" to the page`);

  return NextResponse.json({ item });
}
