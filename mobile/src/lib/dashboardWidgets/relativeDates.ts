/* eslint-disable @typescript-eslint/no-explicit-any -- verbatim copy of lib/dashboardWidgets/relativeDates.ts on the web app */
// A date filter/condition value doesn't have to be one literal date -- a
// viewer usually means "this week's entries", not "17 July specifically",
// and re-picking the same day every morning (or losing the filter overnight)
// is exactly the friction this exists to remove. A relative range is
// serialized as a plain string token, `$<range>` (e.g. "$this_week"),
// stored in the exact same slot a literal 'YYYY-MM-DD' string already used
// (DashboardFilterBar's filters state, TileCondition.value) -- every
// existing consumer that just does `=== someDate` still works unmodified
// for a literal date; only the two places that need to understand a token
// (useDashboardData's filteredRecords/chartRecords matching, and
// evaluateCondition's 'date_relative' operator in compute.ts) import this
// module. The '$' prefix is the same sentinel convention RelationPicker
// already uses for "$current_user" -- an unambiguous non-date string no
// real 'YYYY-MM-DD' value could ever collide with.
export type RelativeDateRange =
  | 'today' | 'yesterday'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'last_7_days' | 'last_30_days'
  | 'this_year';

export const RELATIVE_DATE_RANGES: RelativeDateRange[] = [
  'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_7_days', 'last_30_days', 'this_year',
];

export const RELATIVE_DATE_LABELS: Record<RelativeDateRange, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  last_week: 'Last week',
  this_month: 'This month',
  last_month: 'Last month',
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  this_year: 'This year',
};

const TOKEN_PREFIX = '$';

export function toRelativeDateToken(range: RelativeDateRange): string {
  return `${TOKEN_PREFIX}${range}`;
}

// Returns the range a token encodes, or null for anything else (a literal
// 'YYYY-MM-DD' date, undefined, empty string) -- callers branch on this to
// tell "relative range" from "exact date" without re-parsing the prefix
// themselves.
export function relativeDateFromToken(value: any): RelativeDateRange | null {
  if (typeof value !== 'string' || !value.startsWith(TOKEN_PREFIX)) return null;
  const range = value.slice(TOKEN_PREFIX.length) as RelativeDateRange;
  return (RELATIVE_DATE_RANGES as string[]).includes(range) ? range : null;
}

export function isRelativeDateToken(value: any): boolean {
  return relativeDateFromToken(value) !== null;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

// Monday-of-week, matching compute.ts's bucketKey week convention exactly
// (getDay(): 0=Sun..6=Sat; days back to Monday is (dow+6)%7) -- a range
// filter and a chart's week bucketing should agree on where a week starts.
function startOfWeek(d: Date): Date {
  const diffToMonday = (d.getDay() + 6) % 7;
  return addDays(d, -diffToMonday);
}

// Inclusive [start, end] bounds, both 'YYYY-MM-DD', in the browser's local
// calendar (matches how a date-type field's value is already treated
// everywhere else in this widget system -- see bucketKey's own comment on
// local-midnight parsing).
export function relativeDateBounds(range: RelativeDateRange): { start: string; end: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case 'today': return { start: ymd(today), end: ymd(today) };
    case 'yesterday': { const y = addDays(today, -1); return { start: ymd(y), end: ymd(y) }; }
    case 'this_week': { const s = startOfWeek(today); return { start: ymd(s), end: ymd(addDays(s, 6)) }; }
    case 'last_week': { const s = addDays(startOfWeek(today), -7); return { start: ymd(s), end: ymd(addDays(s, 6)) }; }
    case 'this_month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      const e = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { start: ymd(s), end: ymd(e) };
    }
    case 'last_month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: ymd(s), end: ymd(e) };
    }
    case 'last_7_days': return { start: ymd(addDays(today, -6)), end: ymd(today) };
    case 'last_30_days': return { start: ymd(addDays(today, -29)), end: ymd(today) };
    case 'this_year': return { start: `${today.getFullYear()}-01-01`, end: `${today.getFullYear()}-12-31` };
  }
}

// The one predicate every consumer actually calls -- `rawDateValue` is a
// record's raw field value (a 'YYYY-MM-DD'-prefixed string, or empty/null).
export function matchesRelativeDate(rawDateValue: any, range: RelativeDateRange): boolean {
  if (!rawDateValue) return false;
  const day = String(rawDateValue).slice(0, 10);
  const { start, end } = relativeDateBounds(range);
  return day >= start && day <= end;
}
