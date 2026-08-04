// lib/payroll/calculateWithholding.ts
//
// Pure calculation -- no I/O, no Supabase, callable from an API route or a
// script. Formula-field records (multiply/add/percentage_of/sum_related/
// max_related) can't express tax-bracket branching, so this can't live as a
// company_table_fields formula_type; it has to be real code that the "Run
// Pay" API route calls before writing a payslip.
import {
  WITHHOLDING_COEFFICIENTS,
  STSL_WEEKLY_COMPONENT,
  SUPER_GUARANTEE_RATE,
  type WithholdingScale,
} from "./withholdingCoefficients";

export interface WithholdingInput {
  /** Gross pay for the whole period, dollars. */
  grossPay: number;
  /**
   * Length of the pay period expressed in weeks -- e.g. exactly 1 for a
   * calendar week, 2 for a fortnight, ~4.33 for a calendar month. A pay run
   * period is just whatever date range the user picked, not necessarily a
   * clean weekly/fortnightly/monthly cadence, so this is a plain number
   * (periodDays / 7) rather than a fixed enum -- see
   * deriveWeeksFromPeriod() below for the standard way to get one from two
   * dates.
   */
  periodWeeks: number;
  claimsTaxFreeThreshold: boolean;
  hasHelpDebt: boolean;
}

/** (periodEnd - periodStart), inclusive of both ends, expressed in weeks. */
export function deriveWeeksFromPeriod(periodStart: string, periodEnd: string): number {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  if (days <= 0) throw new Error("periodEnd must not be before periodStart");
  return days / 7;
}

export interface WithholdingResult {
  /** Tax withheld for the actual pay period (scaled back from weekly), dollars. */
  taxWithheld: number;
  weeklyEquivalentGross: number;
  weeklyEquivalentTax: number;
}

function findBand<T extends { min: number; max: number | null }>(bands: T[], weeklyEarnings: number): T | undefined {
  return bands.find(b => weeklyEarnings >= b.min && (b.max === null || weeklyEarnings <= b.max));
}

export function calculateWithholding(input: WithholdingInput): WithholdingResult {
  if (input.grossPay < 0) throw new Error("grossPay cannot be negative");

  if (input.periodWeeks <= 0) throw new Error("periodWeeks must be positive");
  const weeks = input.periodWeeks;
  const weeklyGross = input.grossPay / weeks;

  const scale: WithholdingScale = input.claimsTaxFreeThreshold ? "claiming_threshold" : "no_threshold";
  const band = findBand(WITHHOLDING_COEFFICIENTS[scale], weeklyGross);
  let weeklyTax = band ? Math.max(0, weeklyGross * band.a - band.b) : 0;

  if (input.hasHelpDebt) {
    const stslBand = findBand(STSL_WEEKLY_COMPONENT, weeklyGross);
    if (stslBand) weeklyTax += weeklyGross * stslBand.rate;
  }

  // ATO's documented method: round the weekly component to whole dollars,
  // THEN scale back to the real pay cycle -- not the other way around.
  weeklyTax = Math.round(weeklyTax);
  const taxWithheld = Math.round(weeklyTax * weeks);

  return { taxWithheld, weeklyEquivalentGross: weeklyGross, weeklyEquivalentTax: weeklyTax };
}

/** Superannuation Guarantee on Ordinary Time Earnings. Rounded to the nearest cent. */
export function calculateSuperGuarantee(ordinaryTimeEarnings: number): number {
  if (ordinaryTimeEarnings < 0) throw new Error("ordinaryTimeEarnings cannot be negative");
  return Math.round(ordinaryTimeEarnings * SUPER_GUARANTEE_RATE * 100) / 100;
}
