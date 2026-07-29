// app/api/client-update-pages/list/route.ts
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const { data: pages, error } = await admin
    .from("client_update_pages")
    .select("id, title, client_label, slug, access_code, is_active, expires_at, created_at, base_table, visibility")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const pageIds = (pages || []).map((p: any) => p.id);
  const [{ data: itemCounts }, { data: pageTeams }] = await Promise.all([
    pageIds.length
      ? admin.from("client_update_page_items").select("page_id").in("page_id", pageIds)
      : Promise.resolve({ data: [] as any[] }),
    pageIds.length
      ? admin.from("client_update_page_teams").select("page_id, teams(team_name)").in("page_id", pageIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const countByPage = new Map<string, number>();
  for (const i of itemCounts || []) countByPage.set(i.page_id, (countByPage.get(i.page_id) || 0) + 1);
  const teamNamesByPage = new Map<string, string[]>();
  for (const t of pageTeams || []) {
    const name = (t as any).teams?.team_name;
    if (!name) continue;
    if (!teamNamesByPage.has(t.page_id)) teamNamesByPage.set(t.page_id, []);
    teamNamesByPage.get(t.page_id)!.push(name);
  }

  return NextResponse.json({
    pages: (pages || []).map((p: any) => ({
      ...p, matterCount: countByPage.get(p.id) || 0, teamNames: teamNamesByPage.get(p.id) || [],
    })),
  });
}
