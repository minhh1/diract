// lib/relativeDate.ts
// Human-friendly relative label for an arbitrary date (e.g. a follow-up
// date) — "today", "tomorrow", "in 3 days", "Monday next week", "in 3
// weeks" — instead of a raw date string. Used in the Checklist View and
// the public task page (kept in sync there; the Gmail add-on has its own
// copy of this logic since Apps Script can't import from here).

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function getRelativeDateLabel(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const target = new Date(String(dateStr).slice(0, 10) + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return `${n} day${n !== 1 ? "s" : ""} ago`;
  }
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays <= 6) return `in ${diffDays} days`;
  if (diffDays <= 13) return `${WEEKDAYS[target.getDay()]} next week`;
  const weeks = Math.round(diffDays / 7);
  return `in ${weeks} week${weeks !== 1 ? "s" : ""}`;
}
