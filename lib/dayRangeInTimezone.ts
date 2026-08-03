// lib/dayRangeInTimezone.ts
// The UTC [start, end) instant range for a given YYYY-MM-DD calendar date in
// a given IANA timezone -- used to scope "completed today"/"emails today"
// queries (tasks.completed_at, project_emails.date) to the CALLER'S actual
// local day, not whatever day UTC happens to be at query time. Same
// "guess with Date.UTC, then correct using Intl's own offset" technique as
// lib/vmProviders/scheduling.ts's zonedTimeToUtc (no timezone library
// installed in this repo) -- duplicated here in miniature rather than
// exported from that file, which is scoped to VM hibernate/wake scheduling,
// not date-range queries.
function zonedTimeToUtc(year: number, month: number, day: number, timeZone: string): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0));
  const asIfUtc = new Date(
    utcGuess.toLocaleString("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  );
  const asIfZoned = new Date(
    utcGuess.toLocaleString("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  );
  const offsetMs = asIfUtc.getTime() - asIfZoned.getTime();
  return new Date(utcGuess.getTime() + offsetMs);
}

// dateStr must be YYYY-MM-DD. Returns ISO strings ready for a `.gte`/`.lt`
// Supabase filter pair.
export function dayRangeInTimezone(dateStr: string, timeZone: string): { startIso: string; endIso: string } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const start = zonedTimeToUtc(y, m, d, timeZone);
  const end = zonedTimeToUtc(y, m, d + 1, timeZone);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
