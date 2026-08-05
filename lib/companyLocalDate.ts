// lib/companyLocalDate.ts
// Diract's law-firm and property-developer verticals are Australia-only
// products (ABN/ACN validation, AU trust-accounting rules, settlement
// dates, court-rule date calculators) -- for those companies, "today"
// should always be Australia/Sydney wall-clock time, even if the signed-in
// user is physically travelling overseas (a lawyer working an Australian
// matter deadline from London still needs Sydney's calendar date, not
// London's). Every other company type keeps using whichever local
// wall-clock date `new Date()` already resolves to on the machine calling
// this (the browser's for client components, the server's for API
// routes) -- there's no reliable way to know a generic company's own
// "local" without asking, so the caller's own clock is the closest
// approximation. Works in both the browser and Node (Intl.DateTimeFormat
// with an explicit IANA zone is supported in both), so the exact same
// function can be called from client components and API routes.
const AU_VERTICAL_COMPANY_TYPES = new Set(["Law Firm", "Property Developer"]);

export function isAuVerticalCompanyType(companyType: string | null | undefined): boolean {
  return !!companyType && AU_VERTICAL_COMPANY_TYPES.has(companyType);
}

// en-CA happens to format as YYYY-MM-DD, the same shape the codebase's
// existing `new Date().toISOString().slice(0, 10)` produced -- just
// resolved against the requested wall clock instead of UTC. Exported
// because some callers already build a Date via local-timezone arithmetic
// (e.g. `new Date(now.getFullYear(), now.getMonth(), 1)`) and just need it
// re-formatted against Sydney's wall clock, not re-derived from "now"
// entirely -- `.toISOString().slice(0, 10)` on a locally-constructed Date
// silently rolls back a day whenever the local UTC offset is positive
// (all of Australia, always), which is its own flavour of this same bug.
export function ymdInSydney(d: Date): string {
  return ymd(d, "Australia/Sydney");
}

function ymd(d: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", timeZone ? { timeZone, year: "numeric", month: "2-digit", day: "2-digit" } : { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function companyTodayStr(companyType: string | null | undefined, now: Date = new Date()): string {
  return isAuVerticalCompanyType(companyType) ? ymd(now, "Australia/Sydney") : ymd(now);
}

// Same companyType branching as companyTodayStr, but for re-formatting an
// already-computed Date (e.g. "issue date + payment terms") instead of
// "now" -- callers that build a Date via local-timezone arithmetic
// (`new Date(dateStr + 'T00:00:00')`, `.setDate(...)`) and then call
// `.toISOString().slice(0, 10)` on the result hit the same UTC-rollback bug
// as companyTodayStr, just on a derived date instead of the current one.
export function companyYmd(d: Date, companyType: string | null | undefined): string {
  return isAuVerticalCompanyType(companyType) ? ymd(d, "Australia/Sydney") : ymd(d);
}

// For features that only ever exist under a law-firm or property-developer
// company in the first place (trust accounting, invoicing, finance models,
// court-date calculators) -- there's no generic-company code path to fall
// back to, so this skips the companyType lookup/prop-threading entirely
// and is always Australia/Sydney.
export function auTodayStr(now: Date = new Date()): string {
  return ymd(now, "Australia/Sydney");
}

// Some callers (lib/loanCalculator.ts's schedule builder, which does all of
// its own date arithmetic in UTC via setUTCMonth/etc, deliberately, so a
// generated period never lands on a different calendar day depending on
// the machine's local timezone) need "today" AS a Date object seeded at
// UTC midnight of Sydney's current calendar day, not a formatted string --
// this keeps the rest of that UTC-based pipeline working unmodified while
// still anchoring "today" to the right day for the property-developer
// vertical.
export function auTodayUtcMidnight(now: Date = new Date()): Date {
  return new Date(`${ymd(now, "Australia/Sydney")}T00:00:00.000Z`);
}

// "N days from today" (an expiry date, a follow-up default, etc). Anchored
// to Sydney's current calendar day only for the two AU verticals -- same
// companyType branching as companyTodayStr -- everything else falls back
// to plain local-day arithmetic, which doesn't have the UTC-rollback issue
// since it never round-trips through toISOString.
export function companyTodayPlusDaysStr(days: number, companyType: string | null | undefined, now: Date = new Date()): string {
  if (isAuVerticalCompanyType(companyType)) {
    const d = auTodayUtcMidnight(now);
    d.setUTCDate(d.getUTCDate() + days);
    return ymd(d, "Australia/Sydney");
  }
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

// Same reasoning as auTodayStr, for the "default filter to the 1st of this
// month" pattern the trust cash book/journal widgets use.
export function auStartOfMonthStr(now: Date = new Date()): string {
  const [y, m] = ymd(now, "Australia/Sydney").split("-");
  return `${y}-${m}-01`;
}
