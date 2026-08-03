// app/api/client-update-pages/[id]/items/[itemId]/officeholders/route.ts
// Directors/Secretaries (entity_officeholders) for the entity behind an
// entities-based Client Update Page item -- entities-only feature (see
// client_update_pages.base_table), the row-expand equivalent of a matter's
// NotesPanel. Writes go straight onto entity_officeholders (the
// same table components/dashboard/FieldLayoutEditor.tsx's Officeholders
// related-table editor uses), so a director added/removed here shows up on
// the entity's own record too, and vice versa. Every change is logged (see
// lib/clientUpdatePageLog.ts) so it shows in this page's Activity Log
// alongside field edits -- no reason prompt though, unlike a value edit:
// adding/removing a related record isn't overwriting one, same reasoning as
// why matter_added/column_added don't ask for a reason either.
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

  const [{ data: officeholders }, { data: entity }] = await Promise.all([
    admin.from("entity_officeholders").select("id, full_name, role, officeholder_entity_id, is_active")
      .eq("entity_id", entityId).eq("is_active", true).order("role"),
    admin.from("entities").select("entity_type, roles").eq("id", entityId).maybeSingle(),
  ]);

  return NextResponse.json({ officeholders: officeholders || [], entityType: entity?.entity_type ?? null, roles: entity?.roles ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
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
  const { directorEntityId, fullName, role } = body;
  if (!fullName?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!["Director", "Secretary", "Public Officer", "Shareholder", "Trustee", "Beneficiary", "Other"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let { data: officeholder, error } = await admin.from("entity_officeholders").insert({
    entity_id: entityId, officeholder_entity_id: directorEntityId || null, full_name: fullName.trim(), role, is_active: true,
  }).select("id, full_name, role, officeholder_entity_id, is_active").single();

  // entity_officeholders has a unique (entity_id, full_name) constraint that
  // doesn't account for is_active -- someone previously removed (see the
  // sibling [officeholderId] DELETE route, a soft is_active=false) then
  // re-added under the exact same name hits it. Reactivate that row instead
  // of erroring.
  if (error?.code === "23505") {
    const { data: reactivated, error: updateError } = await admin.from("entity_officeholders")
      .update({ officeholder_entity_id: directorEntityId || null, role, is_active: true })
      .eq("entity_id", entityId).eq("full_name", fullName.trim())
      .select("id, full_name, role, officeholder_entity_id, is_active").single();
    officeholder = reactivated;
    error = updateError;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const actorName = await resolveActorName(admin, user.id);
  await logChange(admin, id, actorName, "staff", "officeholder_added", `Added ${role} "${fullName.trim()}"`);

  return NextResponse.json({ officeholder });
}
