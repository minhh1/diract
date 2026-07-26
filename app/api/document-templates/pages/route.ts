// app/api/document-templates/pages/route.ts
// Admin-side (auth required). Company-wide listing of active document_fill_pages
// across every project -- unlike list/route.ts (which is scoped to one projectId,
// for the project's own Document Templates tab), this powers the dashboard
// widget's page picker (see components/dashboard/builder/WidgetConfigPanel.tsx's
// PublicDocumentPageConfig), which has no project context of its own.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: pagesRaw } = await admin
    .from("document_fill_pages")
    .select("id, title, client_name, created_at, project:projects(name)")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const pages = (pagesRaw || []).map((p: any) => ({
    id: p.id,
    title: p.title,
    clientName: p.client_name,
    projectName: p.project?.name || null,
  }));

  return NextResponse.json({ pages });
}
