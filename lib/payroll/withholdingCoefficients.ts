// lib/payroll/withholdingCoefficients.ts
//
// Data ONLY -- no calculation logic here (see calculateWithholding.ts for
// that). This is deliberate: the ATO's "formula method" (NAT 1004, Schedule
// 1) expresses withholding as y = ax - b over weekly-earnings bands, and
// those a/b coefficients get revised most financial years. Keeping them as
// plain data means updating for a new tax year is "edit this file", not
// "audit calculation code for hardcoded numbers".
//
// ============================================================================
// COEFFICIENTS BELOW ARE **NOT VERIFIED AGAINST THE LIVE ATO DOCUMENT**.
// ============================================================================
// ato.gov.au blocks automated fetches and its PAYG withholding coefficients
// are published as PDF/CSV, not in a form that could be reliably scraped
// during development. The band structure and values below are a best-effort
// reference reconstruction (resident individual, Scale 1/2 shape only -- no
// working-holiday-maker, foreign-resident, or seniors/pensioners-offset
// scales), good enough to exercise the calculation engine end-to-end, but
// MUST be checked against the current NAT 1004 Schedule 1 before this is
// used to run a real, paid pay run. COEFFICIENTS_VERIFIED_AT stays null
// until someone has actually done that -- see
// components/payroll/CoefficientsWarningBanner.tsx, which reads this flag
// and renders on every payroll page so this can't be missed.
export const COEFFICIENTS_VERIFIED_AT: string | null = null;
export const COEFFICIENTS_SOURCE_URL =
  "https://www.ato.gov.au/tax-rates-and-codes/tax-tables/schedule-1-statement-of-formulas-for-calculating-amounts-to-be-withheld";

export interface WithholdingBand {
  /** Weekly earnings, inclusive lower bound, dollars. */
  min: number;
  /** Weekly earnings, inclusive upper bound, dollars. `null` = no upper bound. */
  max: number | null;
  /** Coefficient applied to weekly earnings. */
  a: number;
  /** Subtracted constant. */
  b: number;
}

export type WithholdingScale = "claiming_threshold" | "no_threshold";

export const WITHHOLDING_COEFFICIENTS: Record<WithholdingScale, WithholdingBand[]> = {
  // Scale 2 shape: employee has claimed the tax-free threshold.
  claiming_threshold: [
    { min: 0, max: 361, a: 0, b: 0 },
    { min: 361, max: 500, a: 0.16, b: 57.85 },
    { min: 500, max: 710, a: 0.26, b: 107.85 },
    { min: 710, max: 1281, a: 0.34, b: 164.73 },
    { min: 1281, max: 1727, a: 0.39, b: 228.88 },
    { min: 1727, max: 3461, a: 0.47, b: 366.58 },
    { min: 3461, max: null, a: 0.47, b: 366.58 },
  ],
  // Scale 1 shape: no tax-free threshold claimed (e.g. a second job).
  no_threshold: [
    { min: 0, max: 45, a: 0.19, b: 0 },
    { min: 45, max: 361, a: 0.29, b: 4.5 },
    { min: 361, max: 500, a: 0.21, b: -22.15 },
    { min: 500, max: 710, a: 0.34, b: 41.85 },
    { min: 710, max: 1281, a: 0.39, b: 77.35 },
    { min: 1281, max: 3461, a: 0.47, b: 179.85 },
    { min: 3461, max: null, a: 0.47, b: 179.85 },
  ],
};

export interface StslBand {
  min: number;
  max: number | null;
  rate: number;
}

// Additional weekly withholding for employees with a HELP/STSL debt, layered
// on top of the base withholding above. Same "not verified" caveat applies.
export const STSL_WEEKLY_COMPONENT: StslBand[] = [
  { min: 0, max: 1078, rate: 0 },
  { min: 1078, max: 1245, rate: 0.01 },
  { min: 1245, max: 1319, rate: 0.02 },
  { min: 1319, max: 1420, rate: 0.025 },
  { min: 1420, max: 1519, rate: 0.03 },
  { min: 1519, max: 1620, rate: 0.035 },
  { min: 1620, max: 1717, rate: 0.04 },
  { min: 1717, max: 1867, rate: 0.045 },
  { min: 1867, max: 2010, rate: 0.05 },
  { min: 2010, max: 2118, rate: 0.055 },
  { min: 2118, max: 2266, rate: 0.06 },
  { min: 2266, max: 2420, rate: 0.065 },
  { min: 2420, max: 2547, rate: 0.07 },
  { min: 2547, max: 2699, rate: 0.075 },
  { min: 2699, max: 2857, rate: 0.08 },
  { min: 2857, max: 3010, rate: 0.085 },
  { min: 3010, max: 3202, rate: 0.09 },
  { min: 3202, max: 3398, rate: 0.095 },
  { min: 3398, max: null, rate: 0.1 },
];

// Superannuation Guarantee rate, FY2026-27 -- confirmed current via live
// web search (unlike the withholding coefficients above, which is why this
// one isn't gated behind the same warning banner).
export const SUPER_GUARANTEE_RATE = 0.12;
