// lib/applyChecklistTemplate.ts
// Shared "apply a checklist/Gantt template to a project" write path --
// used by both components/dashboard/tabs/ChecklistTab.tsx (Checklist tab)
// and components/public/financeModel/TimelineSubtab.tsx (Finance Model's
// Timeline/Gantt), since both read/write the same tasks table via
// components/dashboard/TemplateManager.tsx's shared editor/apply UI.
// Returns the created rows (with real ids), guaranteed to be in the SAME
// order as tasksToCreate, so the caller (TemplateManager's handleApply)
// can zip template-item ids to task ids and resolve depends_on_item_ids
// into real task_dependencies rows. Inserted one row per request rather
// than a single batch insert -- a batch insert's returned order isn't
// contractually guaranteed to match input order, which doesn't matter for
// the old "just append them to a list" use but does matter once dependency
// resolution needs an exact id correspondence. Template sizes are small
// (tens of tasks, applied once), so N parallel round trips is a non-issue.
import { auTodayStr } from "@/lib/companyLocalDate";

export async function applyChecklistTemplate(
  supabase: any,
  tasksToCreate: Record<string, any>[],
  userId: string | null
): Promise<{ id: string }[]> {
  if (!tasksToCreate.length) return [];
  const dateEntered = auTodayStr();
  const results = await Promise.all(tasksToCreate.map(async t => {
    const { display_order, ...rest } = t;
    const { data, error } = await supabase
      .from("tasks")
      .insert({ ...rest, created_by: userId, date_entered: dateEntered })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }));
  return results;
}
