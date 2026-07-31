// app/api/finance-model-pages/route.ts
// Admin-side (auth required). Create/list public, shareable Finance Model
// links for a project (finance_model_pages -- see supabase/migrations/
// 20260731320000_finance_model_pages_project_scoped.sql). Mirrors
// app/api/document-templates/create-page/route.ts + list/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data, error } = await admin
    .from("finance_model_pages")
    .select("id, title, access_code, is_active, created_at")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ pages: data });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  const title: string | undefined = body?.title;
  const accessCode: string | undefined = body?.accessCode;
  if (!projectId || !title?.trim()) return NextResponse.json({ error: "projectId and title are required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: page, error } = await admin
    .from("finance_model_pages")
    .insert({
      company_id: companyId,
      project_id: projectId,
      title: title.trim(),
      access_code: accessCode?.trim() || null,
      created_by: user.id,
    })
    .select("id, title, access_code, is_active, created_at")
    .single();
  if (error || !page) return NextResponse.json({ error: error?.message || "Failed to create page" }, { status: 500 });

  return NextResponse.json({ page });
}
