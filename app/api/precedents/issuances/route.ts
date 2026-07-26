// app/api/precedents/issuances/route.ts
// Recently-issued documents for one matter, shown under each precedent in
// components/dashboard/tabs/PrecedentsTab.tsx. Downloads go through
// app/api/precedents/issuances/[id]/download rather than a stored signed URL,
// since those expire (see precedent_issuances.sql).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id, company_id").eq("id", projectId).maybeSingle();
  if (!project || project.company_id !== companyId) return NextResponse.json({ error: "Invalid project" }, { status: 400 });

  const { data, error } = await admin
    .from("precedent_issuances")
    .select("id, precedent_id, subject_line, created_at, precedents(name)")
    .eq("company_id", companyId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const issuances = (data || []).map((row: any) => ({
    id: row.id,
    precedentId: row.precedent_id,
    precedentName: row.precedents?.name || "Deleted precedent",
    subjectLine: row.subject_line,
    createdAt: row.created_at,
  }));
  return NextResponse.json({ issuances });
}
