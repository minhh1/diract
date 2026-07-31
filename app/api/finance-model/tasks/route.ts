// app/api/finance-model/tasks/route.ts
// Read-only task list for the Timeline subtab's Card/Diagram/List views --
// real tasks (the shared, company-wide tasks table), not a custom table.
// Tasks without a start_date (most existing ones, until start_date gets
// used going forward) still come back -- the Gantt view renders those as a
// single-day marker at due_date instead of a duration bar. Also returns
// each task's teams (task_teams -- a task can be tagged with more than
// one, e.g. a settlement task can genuinely belong to both Legal and
// Finance) and the project's task_dependencies edges, so the client can
// build the same "blocked by an incomplete prerequisite" logic
// components/dashboard/tabs/ChecklistTab.tsx already uses for its
// completion checkbox.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data, error } = await admin
    .from("tasks")
    .select(`
      id, name, notes, start_date, due_date, is_completed, assignee_id,
      assignee:assignee_id(id, full_name), task_statuses:status_id(label, color_hex),
      task_teams(team_id, teams:team_id(id, team_name))
    `)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const taskIds = (data || []).map((t: any) => t.id);
  const { data: dependencies } = taskIds.length
    ? await admin.from("task_dependencies").select("task_id, depends_on_task_id").in("task_id", taskIds)
    : { data: [] };

  const tasks = (data || []).map((t: any) => ({
    ...t,
    teams: (t.task_teams || []).map((tt: any) => tt.teams).filter(Boolean),
    task_teams: undefined,
  }));

  return NextResponse.json({ tasks, dependencies: dependencies || [] });
}
