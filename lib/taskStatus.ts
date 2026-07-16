// lib/taskStatus.ts
// Task status is no longer a manually-set field — it's derived from
// is_completed / awaiting_follow_up so it can never drift from reality.
// Mirrored (duplicated, not imported) in the Gmail Add-on's Apps Script
// since it can't import from here.

export interface TaskStatusDisplay {
  label: "Pending" | "Follow Up" | "Complete";
  colorHex: string;
}

export function getTaskStatus(isCompleted: boolean, awaitingFollowUp: boolean): TaskStatusDisplay {
  if (isCompleted) return { label: "Complete", colorHex: "#10b981" };
  if (awaitingFollowUp) return { label: "Follow Up", colorHex: "#f59e0b" };
  return { label: "Pending", colorHex: "#64748b" };
}
