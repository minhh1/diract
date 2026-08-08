// lib/billing/aiUsagePeriod.ts
// Single definition of "the current AI usage/billing period" -- shared by
// lib/billing/aiUsageCap.ts (enforcement), app/api/ai/usage/route.ts
// (display), app/api/ai/usage/sweep/route.ts (Stripe reporting), and
// app/api/webhooks/stripe/route.ts (credit-purchase attribution), so all
// four agree on the same window instead of reimplementing "start of month"
// independently and risking drift.
export function currentPeriodStart(): Date {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  return start;
}

// A purchased AI credit pack (see lib/billing/aiCredit.ts) stays valid for
// the calendar month it's bought in *and* the following one, not just the
// month it's bought in -- otherwise a pack bought on, say, the 30th would
// evaporate within days. Deliberately not a persistent rolling wallet (no
// per-event debit ledger) -- just a two-value window, cheap to query.
export function creditValidPeriodStarts(): Date[] {
  const current = currentPeriodStart();
  const previous = new Date(current);
  previous.setMonth(previous.getMonth() - 1);
  return [current, previous];
}

export function periodStartDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
