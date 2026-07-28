// app/api/client-update-pages/[id]/items/[itemId]/trust/route.ts
// The Trust an entity is Corporate Trustee for (entity_relationships,
// relationship_type='Trustee', parent=Trust/child=Corporate Trustee -- same
// convention components/NewEntityModal.tsx already uses when creating a
// trust+trustee together). Entities-only, same reasoning as the sibling
// officeholders routes.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadPageForCompany } from "@/lib/clientUpdatePagesAdmin";
import { logChange, resolveActorName } from "@/lib/clientUpdatePageLog";

async function resolveEntityId(admin: any, pageId: string, itemId: string): Promise<string | null> {
  const { data: item } = await admin.from("client_update_page_items").select("entity_id").eq("id", itemId).eq("page_id", pageId).maybeSingle();
  return item?.entity_id ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  if (gate.page.base_table !== "entities") return NextResponse.json({ error: "Not available on this page" }, { status: 400 });

  const entityId = await resolveEntityId(admin, id, itemId);
  if (!entityId) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const { data: rel } = await admin.from("entity_relationships")
    .select("id, parent_entity_id, trust:parent_entity_id(name)")
    .eq("child_entity_id", entityId).eq("relationship_type", "Trustee")
    .or("is_current.is.null,is_current.eq.true")
    .maybeSingle();

  return NextResponse.json({ trust: rel ? { relationshipId: rel.id, trustId: rel.parent_entity_id, trustName: (rel as any).trust?.name ?? null } : null });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params;
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, user, companyId } = auth;

  const gate = await loadPageForCompany(admin, id, companyId);
  if (gate.error) return gate.error;
  if (gate.page.base_table !== "entities") return NextResponse.json({ error: "Not available on this page" }, { status: 400 });

  const entityId = await resolveEntityId(admin, id, itemId);
  if (!entityId) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { trustId, trustName } = body; // trustId null/undefined clears the link

  const { data: existing } = await admin.from("entity_relationships")
    .select("id").eq("child_entity_id", entityId).eq("relationship_type", "Trustee").maybeSingle();

  if (!trustId) {
    if (existing) await admin.from("entity_relationships").delete().eq("id", existing.id);
  } else if (existing) {
    await admin.from("entity_relationships").update({ parent_entity_id: trustId, is_current: true }).eq("id", existing.id);
  } else {
    await admin.from("entity_relationships").insert({ parent_entity_id: trustId, child_entity_id: entityId, relationship_type: "Trustee", is_current: true });
  }

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "trust_link_changed", trustId ? `Linked Trust "${trustName || trustId}"` : "Removed Trust link");

  return NextResponse.json({ ok: true });
}
