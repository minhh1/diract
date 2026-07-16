// lib/taskActivityLog.ts
// Human-readable change descriptions + insert helper for the task activity
// log, shared between the main app (ChecklistTab) and the public task page
// — both run in the browser/Next.js context and can use a Supabase client
// directly. The Gmail Add-on's edge function and Apps Script log entries
// the same way but write their own log rows inline (different runtime).

export interface TaskLogLookups {
  profiles?: { id: string; full_name: string | null; email: string | null }[];
  teams?: { id: string; team_name: string }[];
}

function personName(id: string | null | undefined, profiles: TaskLogLookups["profiles"]): string {
  if (!id) return "Unassigned";
  const p = profiles?.find(x => x.id === id);
  return p?.full_name || p?.email || "Unknown";
}

function teamName(id: string | null | undefined, teams: TaskLogLookups["teams"]): string {
  if (!id) return "No team";
  return teams?.find(x => x.id === id)?.team_name || "Unknown";
}

// Compares a "before" and "after" task record and returns a list of plain-
// English change descriptions, e.g. ["due date → 20/07/2026", "assignee →
// Jason Cao"]. Only fields present (not undefined) on `after` are compared,
// so partial patches don't get flagged as changing everything else to blank.
export function describeTaskChanges(before: any, after: any, lookups: TaskLogLookups = {}): string[] {
  const changes: string[] = [];

  if (after.name !== undefined && after.name !== before.name) {
    changes.push(`renamed to "${after.name}"`);
  }
  if (after.due_date !== undefined && String(after.due_date || "").slice(0, 10) !== String(before.due_date || "").slice(0, 10)) {
    changes.push(`due date → ${after.due_date ? String(after.due_date).slice(0, 10) : "none"}`);
  }
  if (after.due_time !== undefined && (after.due_time || "").slice(0, 5) !== (before.due_time || "").slice(0, 5)) {
    changes.push(`due time → ${after.due_time ? String(after.due_time).slice(0, 5) : "none"}`);
  }
  if (after.assignee_id !== undefined && after.assignee_id !== before.assignee_id) {
    changes.push(`assignee → ${personName(after.assignee_id, lookups.profiles)}`);
  }
  if (after.assigned_team_id !== undefined && after.assigned_team_id !== before.assigned_team_id) {
    changes.push(`team → ${teamName(after.assigned_team_id, lookups.teams)}`);
  }
  if (after.is_monetary !== undefined && !!after.is_monetary !== !!before.is_monetary) {
    changes.push(after.is_monetary ? "marked as monetary" : "unmarked as monetary");
  }
  if (after.estimated_cost !== undefined && Number(after.estimated_cost || 0) !== Number(before.estimated_cost || 0)) {
    changes.push(`estimated cost → $${Number(after.estimated_cost || 0).toLocaleString()}`);
  }
  if (after.notes !== undefined && (after.notes || "") !== (before.notes || "")) {
    changes.push("notes updated");
  }

  return changes;
}

// Inserts a row into task_activity_log. `supabase` can be either the
// browser client (RLS-gated) or a service-role client (server routes) —
// both expose the same `.from().insert()` shape.
export async function logTaskActivity(
  supabase: any,
  params: { taskId: string; companyId: string; actorId: string | null; action: string; detail?: string | null }
) {
  await supabase.from("task_activity_log").insert({
    task_id: params.taskId,
    company_id: params.companyId,
    actor_id: params.actorId,
    action: params.action,
    detail: params.detail || null,
  });
}
