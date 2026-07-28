// app/api/client-update-pages/[id]/items/[itemId]/officeholders/[officeholderId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string; officeholderId: string }> }) {
  const { id, itemId, officeholderId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  if (gate.page.base_table !== "entities") return NextResponse.json({ error: "Not available on this page" }, { status: 400 });

  const { data: item } = await admin.from("client_update_page_items").select("entity_id").eq("id", itemId).eq("page_id", id).maybeSingle();
  if (!item?.entity_id) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { data: officeholder } = await admin.from("entity_officeholders").select("id, full_name, role").eq("id", officeholderId).eq("entity_id", item.entity_id).maybeSingle();
  if (!officeholder) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin.from("entity_officeholders").update({ is_active: false }).eq("id", officeholderId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "officeholder_removed", `Removed ${officeholder.role} "${officeholder.full_name}"`);

  return NextResponse.json({ ok: true });
}
