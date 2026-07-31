// lib/cashFlowEngine.ts
// Time-phases every Budget Line (cost or revenue) into the months it
// actually lands in, instead of treating the whole project as one
// instantaneous transaction the way lib/feasibilityCalculator.ts's
// parametric model does. This is the foundation the debt-drawdown
// simulation and returns engine (XIRR/NPV/leveraged IRR) build on top of.
//
// A line's dates come from its linked Timeline task (start_date/due_date)
// when set, falling back to its own manual timing_start_date/
// timing_end_date override -- a line with neither is "unresolved" and
// excluded from the schedule (surfaced to the caller so the UI can flag
// it, never silently dropped/guessed).

export type TimingProfile = "Lump Sum at Start" | "Lump Sum at End" | "Even Spread" | "S-Curve";

export interface TimedBudgetLine {
  id: string;
  category: string | null; // "Revenue" = cash in, everything else = cash out
  label: string | null;
  budgetedAmount: number;
  linkedTaskId: string | null;
  timingProfile: TimingProfile | null;
  timingStartDate: string | null;
  timingEndDate: string | null;
}

export interface TaskDatesRef {
  start_date: string | null;
  due_date: string | null;
}

export interface MonthlyCashFlow {
  month: string; // "YYYY-MM"
  cashIn: number;
  cashOut: number;
  net: number;
  cumulative: number;
}

export interface CashFlowResult {
  rows: MonthlyCashFlow[];
  unresolvedLines: TimedBudgetLine[]; // no linked task AND no manual dates
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthsInRange(start: Date, end: Date): string[] {
  const months: string[] = [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cursor <= last) {
    months.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

// Smoothstep (3t²-2t³) as the S-curve shape -- the standard ease-in/
// ease-out approximation for construction spend curves (slow start, fast
// middle, slow finish) without pulling in a stats/distribution library
// for what's ultimately just a shape a developer eyeballs as "S-ish".
function sCurveCumulative(t: number): number {
  return 3 * t * t - 2 * t * t * t;
}

export function spreadAmountOverMonths(amount: number, start: Date | null, end: Date | null, profile: TimingProfile | null): Map<string, number> {
  const result = new Map<string, number>();
  if (!start && !end) return result;
  const s = start || end!;
  const e = end && end >= s ? end : s;
  const months = monthsInRange(s, e);
  if (months.length === 0) return result;

  if (months.length === 1 || profile === "Lump Sum at Start") {
    result.set(months[0], amount);
    return result;
  }
  if (profile === "Even Spread") {
    const per = amount / months.length;
    for (const m of months) result.set(m, per);
    return result;
  }
  if (profile === "S-Curve") {
    let prevCum = 0;
    for (let i = 0; i < months.length; i++) {
      const cum = sCurveCumulative((i + 1) / months.length);
      result.set(months[i], (cum - prevCum) * amount);
      prevCum = cum;
    }
    return result;
  }
  // "Lump Sum at End" and the no-profile-set default -- matches "invoice
  // paid / settlement collected on completion", a defensible default for
  // a line nobody has explicitly time-phased yet.
  result.set(months[months.length - 1], amount);
  return result;
}

function resolveLineDates(line: TimedBudgetLine, tasksById: Map<string, TaskDatesRef>): { start: Date | null; end: Date | null } {
  const task = line.linkedTaskId ? tasksById.get(line.linkedTaskId) : undefined;
  const startStr = task?.start_date || line.timingStartDate;
  const endStr = task?.due_date || task?.start_date || line.timingEndDate || line.timingStartDate;
  return {
    start: startStr ? new Date(startStr) : null,
    end: endStr ? new Date(endStr) : null,
  };
}

export function buildMonthlyCashFlow(lines: TimedBudgetLine[], tasksById: Map<string, TaskDatesRef>): CashFlowResult {
  const perMonth = new Map<string, { in: number; out: number }>();
  const unresolvedLines: TimedBudgetLine[] = [];

  for (const line of lines) {
    const { start, end } = resolveLineDates(line, tasksById);
    if (!start && !end) { unresolvedLines.push(line); continue; }
    const spread = spreadAmountOverMonths(line.budgetedAmount, start, end, line.timingProfile);
    const isRevenue = line.category === "Revenue";
    for (const [month, amt] of spread) {
      const cur = perMonth.get(month) || { in: 0, out: 0 };
      if (isRevenue) cur.in += amt; else cur.out += amt;
      perMonth.set(month, cur);
    }
  }

  const months = [...perMonth.keys()].sort();
  let cumulative = 0;
  const rows: MonthlyCashFlow[] = months.map(month => {
    const { in: cashIn, out: cashOut } = perMonth.get(month)!;
    const net = cashIn - cashOut;
    cumulative += net;
    return { month, cashIn, cashOut, net, cumulative };
  });

  return { rows, unresolvedLines };
}
