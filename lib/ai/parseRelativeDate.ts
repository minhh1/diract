// lib/ai/parseRelativeDate.ts
// Deterministic fallback for the small set of relative-date phrases the
// Teams bot's date fields (lib/ai/actionAdvance.ts, lib/ai/appointmentAction.ts)
// used to reject outright. The model is told today's date and asked to
// convert relative phrases itself (see lib/botEngine/handleMessage.ts's
// todayContextMessage), but that's not guaranteed -- compound phrasing like
// "today 3pm", or a model that just doesn't comply -- and until now a miss
// there had no fallback at all, just an error telling the user to re-type
// it as YYYY-MM-DD even for something as plain as "today".
//
// "Today" is always the UTC calendar date (matches
// `new Date().toISOString().slice(0, 10)`, the exact same definition
// todayContextMessage itself uses, so both paths always agree on what day
// it is). Weekday semantics mirror that same system prompt's documented
// convention: a bare weekday name is the closest upcoming occurrence
// (today itself if today already is that day); "next <weekday>" or
// "<weekday> next week" always means the following calendar week's
// occurrence, even if this week's hasn't happened yet.
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function todayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseRelativeDate(raw: string, now: Date = new Date()): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  const today = todayUtc(now);

  if (s === "today") return ymd(today);
  if (s === "tomorrow") return ymd(addDays(today, 1));
  if (s === "yesterday") return ymd(addDays(today, -1));

  const inDaysMatch = s.match(/^in (\d+) days?$/);
  if (inDaysMatch) return ymd(addDays(today, parseInt(inDaysMatch[1], 10)));

  // "wednesday" / "next wednesday" / "wednesday next week"
  const weekdayMatch = s.match(/^(next )?(\w+)(?: (next week))?$/);
  if (weekdayMatch) {
    const targetDow = WEEKDAYS.indexOf(weekdayMatch[2]);
    if (targetDow !== -1) {
      const qualified = !!weekdayMatch[1] || !!weekdayMatch[3];
      const currentDow = today.getUTCDay();
      let delta = (targetDow - currentDow + 7) % 7;
      if (qualified) delta = delta === 0 ? 7 : delta + 7;
      return ymd(addDays(today, delta));
    }
  }

  return null;
}
