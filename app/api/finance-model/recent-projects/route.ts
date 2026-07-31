// app/api/finance-model/recent-projects/route.ts
// GET lists the signed-in user's most recently viewed Finance Model
// projects (in their active company) for FinanceModelSearchWidget.tsx's
// "Recent" section; POST records a view (upsert on user_id+project_id).
// Filtered through the same access-control system as
// app/api/projects/search/route.ts so a recent/starred entry never shows
// a project the user has since lost access to.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getAccessibleProjectIds } from "@/lib/projectAccess";

export async function GET(_req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  const { data: recents } = await admin
    .from("finance_model_project_recents")
    .select("project_id, last_viewed_at")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .order("last_viewed_at", { ascending: false })
    .limit(10);

  const projectIds = (recents || []).map((r: { project_id: string }) => r.project_id);
  if (projectIds.length === 0) return NextResponse.json({ projects: [] });

  const { data: projects } = await admin.from("projects").select("id, name, status").in("id", projectIds).is("deleted_at", null);
  const accessible = await getAccessibleProjectIds(admin, companyId, user.id, isAdmin);
  const byId = new Map((projects || []).map((p: any) => [p.id, p]));

  const ordered = projectIds
    .map(id => byId.get(id))
    .filter((p: any) => p && (accessible === "all" || accessible.has(p.id)));

  return NextResponse.json({ projects: ordered });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  await admin.from("finance_model_project_recents").upsert(
    { company_id: companyId, user_id: user.id, project_id: projectId, last_viewed_at: new Date().toISOString() },
    { onConflict: "user_id,project_id" },
  );

  return NextResponse.json({ success: true });
}
