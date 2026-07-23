// app/api/public-tasks/[pageId]/tasks/[taskId]/follow-ups/route.ts
// Logs a new follow-up on a task. A task can be followed up more than
// once (e.g. chasing the same person repeatedly), so this is an
// append-only log rather than a single boolean/date — awaiting_follow_up
// and follow_up_date on the task itself are kept as a denormalized
// "latest state" cache so status badges elsewhere don't need to know
// about the log table.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { loadPageAndAuthorize } from "@/lib/publicTaskPageAuth";
import { logTaskActivity } from "@/lib/taskActivityLog";

export async function POST(req: NextRequest, { params }: { params: Promise<{ pageId: string; taskId: string }> }) {
  const { pageId, taskId } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const auth = await loadPageAndAuthorize(admin, pageId, user.id);
  if (auth.error) return auth.error;
  const { page } = auth;

  const { data: existing } = await admin.from("tasks").select("id, company_id").eq("id", taskId).maybeSingle();
  if (!existing || existing.company_id !== page.company_id) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  const followedUpAt = body.followedUpAt || todayStr;
  const isDone = followedUpAt <= todayStr;

  const { data: entry, error } = await admin.from("task_follow_ups").insert({
    task_id: taskId, company_id: page.company_id, followed_up_at: followedUpAt, is_done: isDone, created_by: user.id,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const taskUpdate: Record<string, any> = {};
  if (isDone) { taskUpdate.awaiting_follow_up = true; taskUpdate.follow_up_date = followedUpAt; }
  // A future follow-up date is effectively a rescheduled due date.
  if (!isDone) taskUpdate.due_date = followedUpAt;
  await admin.from("tasks").update(taskUpdate).eq("id", taskId);

  await logTaskActivity(admin, {
    taskId, companyId: page.company_id, actorId: user.id,
    action: "follow_up_set",
    detail: isDone ? `follow-up date: ${followedUpAt}` : `follow-up scheduled: ${followedUpAt} (due date moved to match)`,
  });

  return NextResponse.json({ ok: true, entry: { id: entry.id, followedUpAt: String(entry.followed_up_at).slice(0, 10), isDone: entry.is_done } });
}
