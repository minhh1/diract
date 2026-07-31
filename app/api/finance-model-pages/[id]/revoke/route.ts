// app/api/finance-model-pages/[id]/revoke/route.ts
// Admin-side (auth required). PATCH sets a Finance Model public page's
// is_active = false. Mirrors app/api/document-templates/[id]/revoke/route.ts
// (creator-or-admin check).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: pageId } = await params;

  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  const { data: page } = await admin
    .from("finance_model_pages").select("id, company_id, created_by").eq("id", pageId).maybeSingle();
  if (!page || page.company_id !== companyId) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  if (!isAdmin && page.created_by !== user.id) {
    return NextResponse.json({ error: "Only the page creator or a company admin can revoke this page" }, { status: 403 });
  }

  const { error } = await admin.from("finance_model_pages").update({ is_active: false }).eq("id", pageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
