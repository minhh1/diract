// app/api/public-tasks/list/route.ts
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;

  let query = admin
    .from("public_task_pages")
    .select("id, title, scope, team_id, columns, expires_at, is_active, created_at, created_by, teams:team_id(team_name), creator:created_by(full_name, email)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (!isAdmin) query = query.eq("created_by", user.id);

  const { data: pages, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    pages: (pages || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      scope: p.scope,
      teamName: p.teams?.team_name || null,
      columns: p.columns,
      expiresAt: p.expires_at,
      isActive: p.is_active,
      createdAt: p.created_at,
      createdBy: p.creator?.full_name || p.creator?.email || "Unknown",
    })),
  });
}
