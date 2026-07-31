// app/api/finance-model/tasks/route.ts
// Read-only task list for the Timeline subtab's Gantt/list views -- real
// tasks (the shared, company-wide tasks table), not a custom table. Tasks
// without a start_date (most existing ones, until start_date gets used
// going forward) still come back -- the Gantt view renders those as a
// single-day marker at due_date instead of a duration bar.
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
    .select("id, name, start_date, due_date, is_completed, assignee:assignee_id(id, full_name), task_statuses:status_id(label, color_hex)")
    .eq("project_id", projectId)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tasks: data });
}
