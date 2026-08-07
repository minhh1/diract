// app/api/projects/search/route.ts
// Search projects for the Finance Model dashboard widget's project picker
// -- results are filtered to what the signed-in user actually has access
// to via lib/projectAccess.ts's access_mode/project_teams/project_members
// system (company admins see everything, same as elsewhere in the app).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getAccessibleProjectIds } from "@/lib/projectAccess";
import { prependMatterNumbers } from "@/lib/prependMatterNumbers";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  const q = req.nextUrl.searchParams.get("q")?.trim() || "";

  let query = admin.from("projects").select("id, name, status").eq("company_id", companyId).is("deleted_at", null).order("name").limit(50);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: projects } = await query;

  const accessible = await getAccessibleProjectIds(admin, companyId, user.id, isAdmin);
  const filtered = accessible === "all" ? (projects || []) : (projects || []).filter((p: any) => accessible.has(p.id));

  return NextResponse.json({ projects: await prependMatterNumbers(admin, companyId, filtered) });
}
