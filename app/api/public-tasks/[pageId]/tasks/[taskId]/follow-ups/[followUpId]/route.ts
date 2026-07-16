// app/api/public-tasks/[pageId]/tasks/[taskId]/follow-ups/[followUpId]/route.ts
// Removes a single follow-up log entry (e.g. logged by mistake) and
// recomputes the task's denormalized awaiting_follow_up/follow_up_date
// cache from whatever entries remain.
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { createClient } from "@supabase/supabase-js";
import { loadPageAndAuthorize } from "@/lib/publicTaskPageAuth";
import { logTaskActivity } from "@/lib/taskActivityLog";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ pageId: string; taskId: string; followUpId: string }> }) {
  const { pageId, taskId, followUpId } = await params;
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

  const { error } = await admin.from("task_follow_ups").delete().eq("id", followUpId).eq("task_id", taskId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: remaining } = await admin.from("task_follow_ups").select("followed_up_at").eq("task_id", taskId);
  const dates = (remaining || []).map((r: any) => String(r.followed_up_at).slice(0, 10));
  const latest = dates.length ? dates.reduce((a: string, b: string) => (a > b ? a : b)) : null;
  await admin.from("tasks").update({ awaiting_follow_up: dates.length > 0, follow_up_date: latest }).eq("id", taskId);

  await logTaskActivity(admin, { taskId, companyId: page.company_id, actorId: user.id, action: "follow_up_cleared" });

  return NextResponse.json({ ok: true });
}
