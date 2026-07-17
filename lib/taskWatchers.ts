// lib/taskWatchers.ts
// Reconciles a task's watcher list (task_watchers rows) to exactly the
// given set of profile IDs, logging an activity entry for whatever
// changed. Shared between the public task page's create/update routes —
// ChecklistTab.tsx does the same diff inline since it already has the
// current watcher list and profile names in memory client-side.
import { logTaskActivity } from "./taskActivityLog";

export async function saveTaskWatchers(
  supabase: any,
  params: { taskId: string; companyId: string; newIds: string[]; actorId: string | null }
) {
  const { taskId, companyId, newIds, actorId } = params;
  const { data: existing } = await supabase.from("task_watchers").select("profile_id").eq("task_id", taskId);
  const oldIds = (existing || []).map((w: any) => w.profile_id);
  const added = newIds.filter(id => !oldIds.includes(id));
  const removed = oldIds.filter((id: string) => !newIds.includes(id));
  if (!added.length && !removed.length) return;

  if (removed.length) await supabase.from("task_watchers").delete().eq("task_id", taskId).in("profile_id", removed);
  if (added.length) {
    await supabase.from("task_watchers").insert(added.map((profile_id: string) => ({ task_id: taskId, company_id: companyId, profile_id, created_by: actorId })));
  }

  const involvedIds = [...new Set([...added, ...removed])];
  const { data: profs } = involvedIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", involvedIds)
    : { data: [] };
  const nameFor = (id: string) => {
    const p = (profs || []).find((x: any) => x.id === id);
    return p?.full_name || p?.email || "someone";
  };
  const detail = [
    added.length ? `+watcher ${added.map(nameFor).join(", ")}` : null,
    removed.length ? `-watcher ${removed.map(nameFor).join(", ")}` : null,
  ].filter(Boolean).join(", ");
  if (detail) await logTaskActivity(supabase, { taskId, companyId, actorId, action: "updated", detail });
}
