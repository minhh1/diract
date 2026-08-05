// app/api/precedents/[id]/route.ts
// Admin-side (auth required). `id` here is the precedentId. PATCH updates
// name/description/ai_instructions/display_order. DELETE is a soft delete
// (deleted_at, matching company_tables' convention) rather than a hard one -
// precedent_issuances rows keep referencing this precedent for history even
// after it's retired from the tab.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can edit precedents" }, { status: 403 });

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id").eq("id", precedentId).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) {
    return NextResponse.json({ error: "Precedent not found" }, { status: 404 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const update: Record<string, string | number | null> = {};
  if ("name" in body) {
    const name = String(body.name || "").trim();
    if (!name) return NextResponse.json({ error: "name cannot be blank" }, { status: 400 });
    update.name = name;
  }
  if ("description" in body) update.description = String(body?.description || "").trim() || null;
  if ("aiInstructions" in body) update.ai_instructions = String(body?.aiInstructions || "").trim() || null;
  // A reorder (drag/move) doesn't touch the precedent's own content, so it
  // shouldn't reset the "prepared" date shown in the Precedent library/tab
  // (see precedents_updated_at.sql) -- only name/description/ai_instructions
  // edits count as re-preparing it.
  const touchesContent = "name" in body || "description" in body || "aiInstructions" in body;
  if ("displayOrder" in body) update.display_order = Number(body.displayOrder) || 0;
  if (touchesContent) update.updated_at = new Date().toISOString();

  const { error } = await admin.from("precedents").update(update).eq("id", precedentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: precedentId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can delete precedents" }, { status: 403 });

  const { data: precedent } = await admin
    .from("precedents").select("id, company_id").eq("id", precedentId).maybeSingle();
  if (!precedent || precedent.company_id !== companyId) {
    return NextResponse.json({ error: "Precedent not found" }, { status: 404 });
  }

  const { error } = await admin.from("precedents").update({ deleted_at: new Date().toISOString() }).eq("id", precedentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
