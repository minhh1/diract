// lib/returnsEngine.ts
// Real, dated cash-flow IRR/NPV -- built on top of lib/cashFlowEngine.ts's
// monthly time-phased cash flow and facility simulation, distinct from
// lib/feasibilityCalculator.ts's simplifiedIRR (a single-equity-injection/
// single-return CAGR approximation, kept as-is and still labeled
// "simplified" wherever it's shown).
//
// Two cash-flow perspectives:
//  - Unleveraged: the project's own monthly net cash flow (cashIn - cashOut),
//    as if 100% funded by equity with no debt at all.
//  - Leveraged: the equity investor's cash flow once a construction
//    facility (lib/cashFlowEngine.ts's simulateFacility) is drawn to cover
//    monthly shortfalls first -- equity only funds what the facility limit
//    couldn't cover (equityInjected), and only receives a distribution once
//    that month's surplus has first repaid any outstanding debt balance
//    (net - repayment). With no facility configured (limit 0), this
//    collapses to exactly the unleveraged series, so no special-casing is
//    needed for the "no debt" case.
import { buildMonthlyCashFlow, simulateFacility, type FacilityConfig, type MonthlyCashFlow, type MonthlyDebtRow, type TaskDatesRef, type TimedBudgetLine } from "./cashFlowEngine";

export interface DatedCashFlow {
  date: Date;
  amount: number;
}

const MS_PER_YEAR = 365 * 24 * 60 * 60 * 1000;

function monthToDate(month: string): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function unleveragedCashFlow(rows: MonthlyCashFlow[]): DatedCashFlow[] {
  return rows.map(r => ({ date: monthToDate(r.month), amount: r.net }));
}

export function leveragedCashFlow(rows: MonthlyDebtRow[]): DatedCashFlow[] {
  return rows.map(r => {
    const distribution = r.net > 0 ? r.net - r.repayment : 0;
    return { date: monthToDate(r.month), amount: distribution - r.equityInjected };
  });
}

function xnpv(rate: number, flows: DatedCashFlow[]): number {
  const t0 = flows[0].date.getTime();
  return flows.reduce((sum, f) => {
    const years = (f.date.getTime() - t0) / MS_PER_YEAR;
    return sum + f.amount / Math.pow(1 + rate, years);
  }, 0);
}

function xnpvDerivative(rate: number, flows: DatedCashFlow[]): number {
  const t0 = flows[0].date.getTime();
  return flows.reduce((sum, f) => {
    const years = (f.date.getTime() - t0) / MS_PER_YEAR;
    if (years === 0) return sum;
    return sum - (years * f.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

// Act/365 XIRR. Newton-Raphson from a 10% guess first (fast, exact when it
// converges); falls back to a bracket-search + bisection when
// Newton-Raphson diverges -- draw/repay/redraw cash flows can have several
// sign changes, which sometimes throws Newton-Raphson off a straight path.
// Returns null (never a fabricated number) when there's no sign change in
// the series (no real root exists) or no root found in a wide bracket.
export function xirr(flows: DatedCashFlow[]): number | null {
  if (flows.length < 2) return null;
  const hasPositive = flows.some(f => f.amount > 0);
  const hasNegative = flows.some(f => f.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  let rate = 0.1;
  for (let i = 0; i < 50; i++) {
    const value = xnpv(rate, flows);
    const derivative = xnpvDerivative(rate, flows);
    if (Math.abs(derivative) < 1e-10) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
  }

  const evaluate = (r: number) => xnpv(r, flows);
  let lo = -0.99, hi = 10;
  let fLo = evaluate(lo), fHi = evaluate(hi);
  if (Math.sign(fLo) === Math.sign(fHi)) {
    const steps = 400;
    let found = false;
    let prevR = lo, prevF = fLo;
    for (let i = 1; i <= steps; i++) {
      const r = lo + (hi - lo) * (i / steps);
      const f = evaluate(r);
      if (Math.sign(f) !== Math.sign(prevF)) { lo = prevR; hi = r; fLo = prevF; fHi = f; found = true; break; }
      prevR = r; prevF = f;
    }
    if (!found) return null;
  }
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fMid = evaluate(mid);
    if (Math.sign(fMid) === Math.sign(fLo)) { lo = mid; fLo = fMid; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

export function npv(flows: DatedCashFlow[], annualRatePct: number, asOf?: Date): number | null {
  if (flows.length === 0) return null;
  const t0 = asOf ?? flows[0].date;
  return flows.reduce((sum, f) => {
    const years = (f.date.getTime() - t0.getTime()) / MS_PER_YEAR;
    return sum + f.amount / Math.pow(1 + annualRatePct / 100, years);
  }, 0);
}

export function equityMultiple(flows: DatedCashFlow[]): number | null {
  const contributions = flows.filter(f => f.amount < 0).reduce((s, f) => s - f.amount, 0);
  const distributions = flows.filter(f => f.amount > 0).reduce((s, f) => s + f.amount, 0);
  if (contributions <= 0) return null;
  return distributions / contributions;
}

// Months from the first modeled cash flow until cumulative amount first
// reaches zero or above. Null if it never recovers within the horizon.
export function paybackMonths(flows: DatedCashFlow[]): number | null {
  let cumulative = 0;
  for (let i = 0; i < flows.length; i++) {
    cumulative += flows[i].amount;
    if (cumulative >= 0) return i;
  }
  return null;
}

export interface ReturnsMetrics {
  irrPct: number | null;
  npv: number | null;
  equityMultiple: number | null;
  paybackMonths: number | null;
}

export interface ReturnsSummary {
  unleveraged: ReturnsMetrics;
  leveraged: ReturnsMetrics;
}

export function computeReturns(cashFlowRows: MonthlyCashFlow[], debtRows: MonthlyDebtRow[], discountRatePct: number): ReturnsSummary {
  const unleveragedFlows = unleveragedCashFlow(cashFlowRows);
  const leveragedFlows = leveragedCashFlow(debtRows);
  const irrU = xirr(unleveragedFlows);
  const irrL = xirr(leveragedFlows);
  return {
    unleveraged: {
      irrPct: irrU != null ? irrU * 100 : null,
      npv: npv(unleveragedFlows, discountRatePct),
      equityMultiple: equityMultiple(unleveragedFlows),
      paybackMonths: paybackMonths(unleveragedFlows),
    },
    leveraged: {
      irrPct: irrL != null ? irrL * 100 : null,
      npv: npv(leveragedFlows, discountRatePct),
      equityMultiple: equityMultiple(leveragedFlows),
      paybackMonths: paybackMonths(leveragedFlows),
    },
  };
}

export interface ResidualLandValueParams {
  lines: TimedBudgetLine[];
  acquisitionLineId: string;
  tasksById: Map<string, TaskDatesRef>;
  facility: FacilityConfig;
  gdv: number | null;
  targetLeveragedIrrPct: number;
}

// Back-solves the Acquisition budget line's amount so leveraged XIRR hits
// the target -- reuses the SAME dated pipeline (buildMonthlyCashFlow ->
// simulateFacility -> leveragedCashFlow -> xirr) at every trial price
// rather than a closed-form estimate, so the answer is only ever as good
// as (and always consistent with) the real Debt Schedule and Returns
// panels. Bisection: leveraged IRR is decreasing in acquisition price
// (costlier land -> lower return), so if the target can't be reached even
// at a $0 land price, or is still exceeded at 5x the current price, there's
// no sensible answer to return -- null rather than an out-of-bracket guess.
export function solveResidualLandValue(params: ResidualLandValueParams): number | null {
  const { lines, acquisitionLineId, tasksById, facility, gdv, targetLeveragedIrrPct } = params;
  const acquisitionLine = lines.find(l => l.id === acquisitionLineId);
  if (!acquisitionLine) return null;

  const target = targetLeveragedIrrPct / 100;

  // Bisecting on the raw IRR number breaks at very low land prices: if the
  // facility limit covers the entire shortfall, equity never contributes
  // anything at all, so the cash-flow series has no negative leg and
  // xirr() correctly returns null (undefined rate, not "no root exists").
  // That's actually an infinite return, not an unresolvable one -- any
  // positive distribution with zero equity in beats any finite target.
  // Compare against the target as a tri-state predicate instead so that
  // case bisects the same direction a genuine sky-high IRR would.
  const meetsTarget = (landPrice: number): boolean | null => {
    const adjustedLines = lines.map(l => (l.id === acquisitionLineId ? { ...l, budgetedAmount: landPrice } : l));
    const { rows } = buildMonthlyCashFlow(adjustedLines, tasksById);
    if (rows.length === 0) return null;
    const debtSim = simulateFacility(rows, facility, gdv);
    const flows = leveragedCashFlow(debtSim.rows);
    const hasNegative = flows.some(f => f.amount < 0);
    const hasPositive = flows.some(f => f.amount > 0);
    if (!hasNegative) return hasPositive; // zero equity ever contributed -- infinite return if there's any distribution at all
    if (!hasPositive) return false; // pure loss, never meets a target
    const irr = xirr(flows);
    return irr != null ? irr >= target : null;
  };

  let lo = 0;
  let hi = Math.max(acquisitionLine.budgetedAmount || 100_000, 100_000) * 5;
  if (meetsTarget(lo) !== true) return null; // can't hit target even at $0 land price
  if (meetsTarget(hi) === true) return null; // target still met at 5x current price -- no meaningful bracket to solve within

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (meetsTarget(mid) === true) lo = mid; else hi = mid; // unresolved/false both treated as "too expensive"
  }
  return (lo + hi) / 2;
}
