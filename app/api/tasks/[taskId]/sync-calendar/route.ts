// app/api/tasks/[taskId]/sync-calendar/route.ts
// Manual "Add to calendar" trigger for a single task -- pushes it to the
// assignee's connected calendar via the same calendar-sync edge function
// (and the same company-configured event title format, see
// companies.calendar_event_title_format / buildEventTitle in
// supabase/functions/calendar-sync/index.ts) that already runs
// automatically from the public tasks page and Gmail Add-on. ChecklistTab
// (the main dashboard) never triggers this on its own edits, so this route
// is the only way a task edited there gets a calendar event at all.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { triggerCalendarSync } from "@/lib/triggerCalendarSync";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: task } = await admin
    .from("tasks").select("id, company_id, due_date, assignee_id")
    .eq("id", taskId).is("deleted_at", null).maybeSingle();
  if (!task || task.company_id !== companyId) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!task.assignee_id) return NextResponse.json({ error: "Task has no assignee" }, { status: 400 });
  if (!task.due_date) return NextResponse.json({ error: "Task has no due date" }, { status: 400 });

  triggerCalendarSync(taskId, "upsert");
  return NextResponse.json({ ok: true });
}
