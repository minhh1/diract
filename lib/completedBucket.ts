// lib/completedBucket.ts
// Splits completed tasks into "this week" (completed within the last 7
// days) vs "older" — used to break the Completed section into two groups
// in the Checklist View and the public task page. Tasks with no
// completed_at (completed before that column existed) fall into "older".
export function splitCompletedByRecency<T>(
  tasks: T[],
  getCompletedAt: (t: T) => string | null
): { thisWeek: T[]; older: T[] } {
  const cutoff = Date.now() - 7 * 86_400_000;
  const thisWeek: T[] = [];
  const older: T[] = [];
  for (const t of tasks) {
    const completedAt = getCompletedAt(t);
    if (completedAt && new Date(completedAt).getTime() >= cutoff) thisWeek.push(t);
    else older.push(t);
  }
  return { thisWeek, older };
}
