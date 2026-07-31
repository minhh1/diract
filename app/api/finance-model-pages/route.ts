// app/api/finance-model-pages/route.ts
// Admin-side (auth required). Create/list public, shareable Finance Model
// links for an entity (finance_model_pages -- see supabase/migrations/
// 20260731230000_finance_model_pages.sql). Mirrors
// app/api/document-templates/create-page/route.ts + list/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 });

  const { data, error } = await admin
    .from("finance_model_pages")
    .select("id, title, access_code, is_active, created_at")
    .eq("company_id", companyId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pages: data });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const title: string | undefined = body?.title;
  const accessCode: string | undefined = body?.accessCode;
  if (!entityId || !title?.trim()) return NextResponse.json({ error: "entityId and title are required" }, { status: 400 });

  const { data: entity } = await admin.from("entities").select("id").eq("id", entityId).eq("company_id", companyId).maybeSingle();
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  const { data: page, error } = await admin
    .from("finance_model_pages")
    .insert({
      company_id: companyId,
      entity_id: entityId,
      title: title.trim(),
      access_code: accessCode?.trim() || null,
      created_by: user.id,
    })
    .select("id, title, access_code, is_active, created_at")
    .single();
  if (error || !page) return NextResponse.json({ error: error?.message || "Failed to create page" }, { status: 500 });

  return NextResponse.json({ page });
}
