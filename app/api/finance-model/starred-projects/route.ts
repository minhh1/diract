// app/api/finance-model/starred-projects/route.ts
// GET/POST/DELETE for the signed-in user's starred Finance Model projects
// (FinanceModelSearchWidget.tsx's "Starred" section) -- same
// access-filtering as recent-projects/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getAccessibleProjectIds } from "@/lib/projectAccess";
import { prependMatterNumbers } from "@/lib/prependMatterNumbers";

export async function GET(_req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  const { data: stars } = await admin
    .from("finance_model_project_stars")
    .select("project_id, created_at")
    .eq("user_id", user.id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  const projectIds = (stars || []).map((s: { project_id: string }) => s.project_id);
  if (projectIds.length === 0) return NextResponse.json({ projects: [] });

  const { data: projects } = await admin.from("projects").select("id, name, status").in("id", projectIds).is("deleted_at", null);
  const accessible = await getAccessibleProjectIds(admin, companyId, user.id, isAdmin);
  const byId = new Map((projects || []).map((p: any) => [p.id, p]));

  const ordered = projectIds
    .map(id => byId.get(id))
    .filter((p: any) => p && (accessible === "all" || accessible.has(p.id)));

  return NextResponse.json({ projects: await prependMatterNumbers(admin, companyId, ordered) });
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

  await admin.from("finance_model_project_stars").upsert(
    { company_id: companyId, user_id: user.id, project_id: projectId },
    { onConflict: "user_id,project_id" },
  );

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  await admin.from("finance_model_project_stars").delete().eq("user_id", user.id).eq("project_id", projectId);
  return NextResponse.json({ success: true });
}
