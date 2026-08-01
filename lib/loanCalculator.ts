// lib/loanCalculator.ts
// Pure functions -- no I/O -- for the Loans subtab's repayment calculator.
// Property-development finance loans (senior/mezzanine/money-partner) are
// usually interest-only with a bullet repayment, sometimes switching to a
// standard principal+interest schedule partway through the term (e.g. "5
// years interest-only, then P+I") -- that's what Loan Phases models: a loan
// is an ordered sequence of phases, each either Interest Only or
// Amortizing, and the ending balance of one phase becomes the opening
// balance of the next.
//
// Interest rates are tracked separately (Loan Interest Rates -- multiple
// dated entries per loan, since development loans are frequently
// variable-rate and get repriced over the term) rather than fixed on the
// phase itself, so a mid-phase repricing is picked up correctly for
// Interest Only phases. Amortizing phases are a documented simplification:
// the payment amount is calculated once from the rate in effect at the
// phase's start (as a real bank would when setting a fixed instalment) --
// a rate change during an amortizing phase changes future periods'
// interest/principal split but does not recompute the instalment amount,
// which is how amortizing loans work in practice unless explicitly
// refinanced.

export interface LoanInterestRateEntry {
  effective_date: string; // ISO date
  interest_rate_pa: number; // e.g. 8.5 for 8.5%
}

export interface LoanPhaseInput {
  id: string;
  phase_order: number;
  repayment_type: "Interest Only" | "Amortizing";
  start_date: string; // ISO date
  end_date: string | null; // ISO date -- null treated as "ongoing, use today"
  payment_frequency: "Monthly" | "Quarterly" | "Six-Monthly" | "Annually" | "At Maturity";
}

export interface RepaymentPeriod {
  phaseId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  interest: number;
  principal: number;
  payment: number;
  closingBalance: number;
}

export interface LoanScheduleResult {
  periods: RepaymentPeriod[];
  totalInterest: number;
  finalBalance: number;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth()) + (b.getUTCDate() >= a.getUTCDate() ? 0 : -1);
}

function frequencyMonths(freq: LoanPhaseInput["payment_frequency"]): number {
  switch (freq) {
    case "Monthly": return 1;
    case "Quarterly": return 3;
    case "Six-Monthly": return 6;
    case "Annually": return 12;
    case "At Maturity": return Infinity;
  }
}

// The interest rate in effect on `date`: the entry with the latest
// effective_date <= date. Falls back to 0 if no entry is effective yet
// (e.g. all entries are future-dated relative to `date`), rather than
// throwing -- an incomplete rate history shouldn't crash the calculator,
// just under-state interest until a rate is entered.
export function rateOnDate(rates: LoanInterestRateEntry[], date: Date): number {
  let best: LoanInterestRateEntry | null = null;
  for (const r of rates) {
    const d = new Date(r.effective_date);
    if (d.getTime() > date.getTime()) continue;
    if (!best || d.getTime() > new Date(best.effective_date).getTime()) best = r;
  }
  return best?.interest_rate_pa ?? 0;
}

// Simple interest on a flat `balance` over [from, to), correct even when a
// rate change (per Loan Interest Rates) falls inside the interval --
// splits at every effective_date boundary within range and sums each
// sub-interval at its own rate. Sampling the rate at just one end of the
// interval (e.g. periodEnd) is wrong whenever a period happens to end
// exactly on a rate's effective_date: the new rate would retroactively
// apply to the whole period instead of just from that date forward.
function accrueInterest(rates: LoanInterestRateEntry[], balance: number, from: Date, to: Date): number {
  const boundaries = [...new Set(rates.map(r => r.effective_date))]
    .map(d => new Date(d))
    .filter(d => d > from && d < to)
    .sort((a, b) => a.getTime() - b.getTime());
  let total = 0;
  let cursor = from;
  for (const boundary of [...boundaries, to]) {
    // rateOnDate(rates, cursor) is exactly the rate effective from `cursor`
    // onward: for the first sub-interval cursor === from; for every
    // subsequent one, cursor === a rate's own effective_date, whose
    // "latest effective_date <= date" match is itself.
    const rate = rateOnDate(rates, cursor) / 100;
    total += balance * rate * (daysBetween(cursor, boundary) / 365);
    cursor = boundary;
  }
  return total;
}

// `until` stops the schedule at a date part-way through the loan term.
// A development loan is written over a long term (a 30-year facility is
// normal) but is repaid out of settlement proceeds when the project
// finishes, so the interest a FEASIBILITY should carry is only what
// accrues up to completion -- costing the full contractual term instead
// overstates finance costs by an order of magnitude. Null/omitted keeps
// the old behaviour (the whole term), which is still what you want when
// reading the loan as a loan rather than as a project cost.
export function calculateLoanSchedule(
  principal: number,
  phases: LoanPhaseInput[],
  rates: LoanInterestRateEntry[],
  until?: string | null
): LoanScheduleResult {
  const sorted = [...phases].sort((a, b) => a.phase_order - b.phase_order);
  const today = new Date();
  const cutoff = until ? new Date(until) : null;
  let balance = principal;
  const periods: RepaymentPeriod[] = [];

  for (const phase of sorted) {
    const start = new Date(phase.start_date);
    const contractualEnd = phase.end_date ? new Date(phase.end_date) : today;
    // Phases starting after the cutoff never happen for costing purposes.
    if (cutoff && start >= cutoff) continue;
    const end = cutoff && contractualEnd > cutoff ? cutoff : contractualEnd;
    if (end <= start || balance <= 0) continue;

    if (phase.repayment_type === "Interest Only") {
      const months = frequencyMonths(phase.payment_frequency);
      let cursor = start;
      while (cursor < end) {
        const next = months === Infinity ? end : addMonths(cursor, months);
        const periodEnd = next < end ? next : end;
        const interest = accrueInterest(rates, balance, cursor, periodEnd);
        periods.push({ phaseId: phase.id, periodStart: toISODate(cursor), periodEnd: toISODate(periodEnd), openingBalance: balance, interest, principal: 0, payment: interest, closingBalance: balance });
        cursor = periodEnd;
      }
    } else {
      // Amortizing -- "At Maturity" frequency doesn't make sense for a
      // periodic P&I schedule, treat it as Monthly rather than producing a
      // single, meaningless period.
      const months = phase.payment_frequency === "At Maturity" ? 1 : frequencyMonths(phase.payment_frequency);
      // n and the instalment come from the CONTRACTUAL phase length, not
      // the truncated one: a bank sets the instalment to amortize the loan
      // over its full term, so cutting the schedule short must not
      // re-amortize it into much bigger payments over the shorter window.
      const totalMonths = Math.max(1, monthsBetween(start, contractualEnd));
      const n = Math.max(1, Math.round(totalMonths / months));
      const annualRate = rateOnDate(rates, start) / 100; // fixed at phase start -- see file header comment
      const periodicRate = annualRate * (months / 12);
      const instalment = periodicRate === 0 ? balance / n : (balance * periodicRate) / (1 - Math.pow(1 + periodicRate, -n));

      let cursor = start;
      for (let i = 0; i < n; i++) {
        const next = i === n - 1 ? contractualEnd : addMonths(cursor, months);
        if (next > end) {
          // The cutoff lands mid-period: accrue the part of this period's
          // interest that actually falls before it (pro-rata on days, on
          // the opening balance) and stop. No principal -- that
          // instalment is never reached.
          const fraction = daysBetween(cursor, end) / Math.max(1, daysBetween(cursor, next));
          const interest = balance * periodicRate * fraction;
          if (interest > 0) {
            periods.push({ phaseId: phase.id, periodStart: toISODate(cursor), periodEnd: toISODate(end), openingBalance: balance, interest, principal: 0, payment: interest, closingBalance: balance });
          }
          break;
        }
        const interest = balance * periodicRate;
        const principalPortion = i === n - 1 ? balance : Math.min(balance, instalment - interest);
        const payment = interest + principalPortion;
        const opening = balance;
        balance = Math.max(0, balance - principalPortion);
        periods.push({ phaseId: phase.id, periodStart: toISODate(cursor), periodEnd: toISODate(next), openingBalance: opening, interest, principal: principalPortion, payment, closingBalance: balance });
        cursor = next;
      }
    }
  }

  return { periods, totalInterest: periods.reduce((s, p) => s + p.interest, 0), finalBalance: balance };
}

// The date a loan's interest should be costed to, in priority order:
// the user's own override on the loan, else the project's Timeline
// completion (the latest task due date) as the baseline, else null
// meaning "no cutoff, use the full contractual term". Kept here so the
// Loans subtab and the Feasibility subtab can't drift on which date they
// each decided to use.
export function resolveInterestCutoff(loanOverride: string | null | undefined, timelineCompletion: string | null): string | null {
  return loanOverride || timelineCompletion || null;
}

// Latest due date across the project's Timeline tasks -- the baseline
// project-completion date. Null when no task carries a due date.
export function timelineCompletionDate(tasks: { due_date: string | null }[]): string | null {
  const dates = tasks.map(t => t.due_date).filter((d): d is string => !!d).sort();
  return dates.length ? dates[dates.length - 1] : null;
}
