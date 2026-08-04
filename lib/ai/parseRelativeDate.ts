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
// `timezone` (the company's own, see lib/companyTimezone.ts) is required,
// not optional -- this used to hardcode "today" as the UTC calendar date,
// which is the WRONG calendar day for an Australian company for several
// hours every morning (UTC is still "yesterday" until mid-morning AEST).
// Observed live (2026-08-04): todayContextMessage was fixed to use the
// company's timezone, but this parallel deterministic path -- which kicks
// in whenever the model doesn't convert a relative phrase itself -- was
// missed, so "today"/"tomorrow" etc. could still silently resolve to the
// wrong day depending on which path handled a given reply. Both now agree,
// via the same "format now() in the company's own timezone" technique
// todayContextMessage uses. Once that one calendar date is resolved, the
// day-arithmetic below (setUTCDate) stays in UTC-space on purpose -- adding
// whole days never needs to re-cross the timezone boundary, only the
// INITIAL "what day is it" resolution does. Weekday semantics: a bare
// weekday name is the closest upcoming occurrence (today itself if today
// already is that day); "next <weekday>" or "<weekday> next week" always
// means the following calendar week's occurrence, even if this week's
// hasn't happened yet.
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// en-CA formats as YYYY-MM-DD -- the same trick todayContextMessage uses --
// resolved in the company's own local date, then re-anchored to UTC
// midnight of that date so the day-arithmetic below has a stable base.
function todayInTimezone(now: Date, timezone: string): Date {
  const localDateStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
  return new Date(`${localDateStr}T00:00:00Z`);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseRelativeDate(raw: string, timezone: string, now: Date = new Date()): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  const today = todayInTimezone(now, timezone);

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
