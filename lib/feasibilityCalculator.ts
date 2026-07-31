// lib/feasibilityCalculator.ts
// A scoped-down version of a PropDEV-style (varloch.com.au/construction/
// propdev) feasibility calculator: parametric inputs (dwelling count/size,
// construction rate, cost percentages) -> a full cost breakdown -> profit/
// margin/ROE/peak-debt/break-even outputs. Deliberately NOT the full
// commercial tool -- no monthly cash-flow draw schedule/graph, no PDF/CSV/
// shareable-link export, no trade-by-trade bill of quantities, no "scale
// recommender" heat map, no jurisdiction compliance alerts (e.g. NSW DBP
// Act). What's here is real, correctly-computed math; what's cut is cut
// and shown as cut in the UI, not faked.
//
// Mirrors the GST/net-cost/margin math already used by
// components/public/financeModel/FeasibilitySubtab.tsx's itemised P&L
// (which stays reading from Budget Lines, unchanged) so the two agree
// when their inputs line up.
export const GST_METHODS = ["Margin Scheme", "Standard (1/11th)", "GST-free"] as const;
export type GstMethod = (typeof GST_METHODS)[number];

export interface FeasibilityInputs {
  dwellingsCount: number | null;
  avgDwellingSizeSqm: number | null;
  siteAreaSqm: number | null;
  expectedSalePricePerDwelling: number | null;
  constructionRatePerSqm: number | null;
  professionalFeesPct: number | null;
  contingencyPct: number | null;
  marketingSellingPct: number | null;
  otherAcquisitionCosts: number | null;
  holdingCostsAnnual: number | null;
  projectDurationMonths: number | null;
  interestRatePct: number | null;
  loanToCostPct: number | null;
  targetMarginPct: number | null;
  // Construction facility parameters -- drive the dated debt-drawdown
  // simulation (lib/cashFlowEngine.ts's simulateFacility) rather than
  // this file's own parametric (instant, non-dated) Peak Debt estimate.
  facilityLimit: number | null;
  facilityInterestRatePct: number | null;
  maxLvrPct: number | null;
}

export interface FeasibilityContext {
  purchasePrice: number;
  stampDuty: number;
  // Resolved by the caller (title fees throw for QLD/WA/SA/NT -- unverified
  // rates, see lib/titleFees.ts) -- null means unavailable, treated as $0
  // here rather than blocking the whole calculator.
  titleFees: { transferFee: number; mortgageFee: number | null } | null;
  gstMethod: GstMethod | null;
}

export interface FeasibilityResult {
  gfa: number;
  revenue: number;
  acquisition: number;
  construction: number;
  professionalFees: number;
  contingency: number;
  marketingSelling: number;
  holding: number;
  peakDebt: number;
  interest: number;
  gstCollected: number;
  gstInputCredits: number;
  netRevenue: number;
  netCosts: number;
  totalDevelopmentCost: number;
  netProfit: number;
  marginOnCostPct: number | null;
  requiredEquity: number;
  returnOnEquityPct: number | null;
  feasible: boolean | null;
}

function calculateGst(gstMethod: GstMethod | null, revenue: number, acquisition: number, creditableCosts: number) {
  const gstCollected =
    gstMethod === "Margin Scheme" ? Math.max(0, revenue - acquisition) / 11
    : gstMethod === "Standard (1/11th)" ? revenue / 11
    : 0;
  const gstInputCredits = creditableCosts / 11;
  return { gstCollected, gstInputCredits };
}

export function calculateFeasibility(inputs: FeasibilityInputs, ctx: FeasibilityContext): FeasibilityResult {
  const dwellings = inputs.dwellingsCount ?? 0;
  const gfa = dwellings * (inputs.avgDwellingSizeSqm ?? 0);
  const revenue = dwellings * (inputs.expectedSalePricePerDwelling ?? 0);

  const acquisition = ctx.purchasePrice + ctx.stampDuty + (ctx.titleFees?.transferFee ?? 0) + (inputs.otherAcquisitionCosts ?? 0);
  const construction = gfa * (inputs.constructionRatePerSqm ?? 0);
  const professionalFees = construction * ((inputs.professionalFeesPct ?? 0) / 100);
  const contingency = construction * ((inputs.contingencyPct ?? 0) / 100);
  const marketingSelling = revenue * ((inputs.marketingSellingPct ?? 0) / 100);
  const durationMonths = inputs.projectDurationMonths ?? 0;
  const holding = (inputs.holdingCostsAnnual ?? 0) * (durationMonths / 12);

  const grossCost = acquisition + construction + professionalFees + contingency + marketingSelling + holding;

  const peakDebt = grossCost * ((inputs.loanToCostPct ?? 0) / 100);
  // Approximate finance cost via the standard feasibility shorthand: a
  // progressively-drawn construction loan's balance ramps from $0 to peak
  // debt over the build, so its AVERAGE outstanding balance is ~50% of
  // peak -- not a full monthly amortisation schedule (that needs a dated
  // drawdown curve, out of scope here), but a named, defensible
  // approximation, not a fabricated number.
  const interest = peakDebt * 0.5 * ((inputs.interestRatePct ?? 0) / 100) * (durationMonths / 12);

  // Creditable (GST-inclusive) cost base for Input Tax Credits --
  // Construction/Professional Fees/Contingency/Marketing & Selling/Holding,
  // NOT Acquisition (a margin-scheme land purchase typically carries no
  // claimable input credit for the purchaser) and NOT Finance (interest is
  // input-taxed) -- same convention FeasibilitySubtab's existing P&L uses.
  const creditableCosts = construction + professionalFees + contingency + marketingSelling + holding;
  const { gstCollected, gstInputCredits } = calculateGst(ctx.gstMethod, revenue, acquisition, creditableCosts);

  const netRevenue = revenue - gstCollected;
  const netCosts = grossCost - gstInputCredits;
  const marginBeforeInterest = netRevenue - netCosts;
  const netProfit = marginBeforeInterest - interest;
  const totalDevelopmentCost = netCosts + interest;
  const requiredEquity = totalDevelopmentCost - peakDebt;

  const marginOnCostPct = totalDevelopmentCost > 0 ? (netProfit / totalDevelopmentCost) * 100 : null;
  const returnOnEquityPct = requiredEquity > 0 ? (netProfit / requiredEquity) * 100 : null;
  const feasible = inputs.targetMarginPct != null && marginOnCostPct != null ? marginOnCostPct >= inputs.targetMarginPct : null;

  return {
    gfa, revenue, acquisition, construction, professionalFees, contingency, marketingSelling, holding,
    peakDebt, interest, gstCollected, gstInputCredits, netRevenue, netCosts, totalDevelopmentCost, netProfit,
    marginOnCostPct, requiredEquity, returnOnEquityPct, feasible,
  };
}

// Bisection over a monotonic-increasing function of x that crosses zero
// once in [lo, hi] -- used instead of a hand-derived closed-form solve
// because marketing/selling cost and GST collected both scale with
// revenue (and revenue in turn feeds peak debt -> interest), so "solve
// for X" isn't cleanly invertible by algebra without risking a mistake;
// re-running the same calculateFeasibility used everywhere else and
// converging numerically is simpler to get right and easier to verify.
function bisect(evaluate: (x: number) => number, lo: number, hi: number, iterations = 40): number {
  let a = lo, b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (evaluate(mid) > 0) b = mid; else a = mid;
  }
  return (a + b) / 2;
}

// Sale price per dwelling at which Net Profit = 0, holding every other
// input fixed. Null if there's no dwelling count to divide by.
export function solveBreakEvenSalePricePerDwelling(inputs: FeasibilityInputs, ctx: FeasibilityContext): number | null {
  if (!inputs.dwellingsCount || inputs.dwellingsCount <= 0) return null;
  const hi = Math.max((inputs.expectedSalePricePerDwelling ?? 1_000_000) * 5, 10_000_000);
  return bisect(price => calculateFeasibility({ ...inputs, expectedSalePricePerDwelling: price }, ctx).netProfit, 0, hi);
}

// Purchase price at which Margin on Cost % = the target margin, holding
// every other input (including the currently-entered purchase price's
// flow-through to stamp duty/title fees -- those are NOT re-derived per
// candidate price, since re-deriving stamp duty at every bisection step
// would need lib/stampDuty.ts wired in here too; this answers "how much
// higher/lower could the acquisition cost go" rather than a fully
// self-consistent re-quote). Null if no target margin is set.
export function solveMaxSupportableLandPrice(inputs: FeasibilityInputs, ctx: FeasibilityContext): number | null {
  if (inputs.targetMarginPct == null) return null;
  const target = inputs.targetMarginPct;
  const currentAcquisitionExtra = ctx.purchasePrice; // the purchase-price component being solved for
  const hi = Math.max(currentAcquisitionExtra * 5, 10_000_000);
  const evaluate = (price: number) => {
    const result = calculateFeasibility(inputs, { ...ctx, purchasePrice: price });
    // Decreasing in price (higher land cost -> lower margin) -- flip sign
    // so bisect's ">0 shrink hi" logic still converges correctly.
    return target - (result.marginOnCostPct ?? -Infinity);
  };
  // Not every deal CAN hit the target margin, even at $0 land price (other
  // costs alone may already exceed budget) -- bisect assumes the function
  // crosses zero somewhere in [0, hi]; if it's already positive at 0 (or
  // still negative at hi), there's no non-negative price that works, and
  // returning the boundary would misleadingly look like a real answer.
  if (evaluate(0) > 0) return null;
  if (evaluate(hi) < 0) return null;
  return bisect(evaluate, 0, hi);
}

export interface ScenarioResult {
  label: string;
  result: FeasibilityResult;
}

export function runScenarios(inputs: FeasibilityInputs, ctx: FeasibilityContext): ScenarioResult[] {
  const run = (label: string, salePriceMult: number, constructionMult: number): ScenarioResult => ({
    label,
    result: calculateFeasibility({
      ...inputs,
      expectedSalePricePerDwelling: inputs.expectedSalePricePerDwelling == null ? null : inputs.expectedSalePricePerDwelling * salePriceMult,
      constructionRatePerSqm: inputs.constructionRatePerSqm == null ? null : inputs.constructionRatePerSqm * constructionMult,
    }, ctx),
  });
  return [
    run("Conservative", 0.95, 1.05),
    run("Base", 1, 1),
    run("Optimistic", 1.05, 0.95),
  ];
}

export interface SensitivityRow {
  salePriceDeltaPct: number;
  cells: { constructionDeltaPct: number; marginOnCostPct: number | null }[];
}

const SENSITIVITY_DELTAS = [-10, -5, 0, 5, 10];

export function runSensitivity(inputs: FeasibilityInputs, ctx: FeasibilityContext): SensitivityRow[] {
  return SENSITIVITY_DELTAS.map(salePct => ({
    salePriceDeltaPct: salePct,
    cells: SENSITIVITY_DELTAS.map(constPct => {
      const adjusted: FeasibilityInputs = {
        ...inputs,
        expectedSalePricePerDwelling: inputs.expectedSalePricePerDwelling == null ? null : inputs.expectedSalePricePerDwelling * (1 + salePct / 100),
        constructionRatePerSqm: inputs.constructionRatePerSqm == null ? null : inputs.constructionRatePerSqm * (1 + constPct / 100),
      };
      return { constructionDeltaPct: constPct, marginOnCostPct: calculateFeasibility(adjusted, ctx).marginOnCostPct };
    }),
  }));
}

// Annualised return on equity, assuming a SINGLE equity injection at
// project start and a SINGLE return (equity + profit) at project
// completion -- a CAGR-style approximation, not a full monthly
// cash-flow IRR (which needs a dated drawdown/return schedule, out of
// scope here). Explicitly labeled as such wherever it's shown.
export function simplifiedIRR(requiredEquity: number, netProfit: number, durationMonths: number): number | null {
  if (requiredEquity <= 0 || durationMonths <= 0) return null;
  const totalReturnMultiple = 1 + netProfit / requiredEquity;
  if (totalReturnMultiple <= 0) return null;
  return (Math.pow(totalReturnMultiple, 12 / durationMonths) - 1) * 100;
}
