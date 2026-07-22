// lib/taskGroup.ts
// "Organised view" classification for the public task page — buckets each
// task into one of three groups. A manual override (taskGroup, stored on
// the task) always wins; otherwise it's auto-detected: tasks the viewer is
// only watching (not assigned) are "watcher", tasks that mention chasing
// someone or already have a follow-up logged are "follow_up", everything
// else is "action".
export type TaskGroup = "action" | "follow_up" | "watcher";

const FOLLOW_UP_KEYWORDS = /follow[\s-]?up|chase|call again/i;

export function classifyTask(t: {
  isWatcher: boolean;
  followUpCount: number;
  name: string;
  notes: string | null;
  taskGroup: string | null;
}): TaskGroup {
  if (t.taskGroup === "action" || t.taskGroup === "follow_up" || t.taskGroup === "watcher") return t.taskGroup;
  if (t.isWatcher) return "watcher";
  if (t.followUpCount > 0 || FOLLOW_UP_KEYWORDS.test(t.name) || (t.notes && FOLLOW_UP_KEYWORDS.test(t.notes))) return "follow_up";
  return "action";
}

export const TASK_GROUP_LABELS: Record<TaskGroup, string> = {
  action: "Action",
  follow_up: "Follow up",
  watcher: "Watching",
};
