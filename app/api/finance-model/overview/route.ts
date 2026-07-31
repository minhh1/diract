// app/api/finance-model/overview/route.ts
// Authenticated data for the Finance Model tab's Overview subtab
// (components/public/financeModel/OverviewSubtab.tsx). Replaces
// app/api/xero/finance-model/route.ts -- moved out of app/api/xero/ since
// Xero is now optional (see lib/financeModel/data.ts's loadOverview),
// not the defining feature of this route. The unauthenticated public-page
// equivalent is app/api/finance-model-pages/public/[pageId]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadOverview } from "@/lib/financeModel/data";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const data = await loadOverview(admin, companyId, projectId);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load" }, { status: 502 });
  }
}
