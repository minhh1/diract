// lib/residualLandValue.ts
// Fully self-consistent residual land value solver -- answers "what is the
// MOST I can pay for this site and still hit my target margin on cost?",
// the number a developer actually bids off.
//
// Differs from lib/feasibilityCalculator.ts's solveMaxSupportableLandPrice
// in one important way: stamp duty and title fees are RE-DERIVED at every
// candidate land price (they're a function of the price being solved for,
// so holding them fixed at the currently-entered price -- as that function
// documents it does -- overstates the answer whenever the solve lands far
// from the entered price). The circularity (price -> duty -> acquisition
// cost -> margin -> price) is resolved by bisection over the same
// calculateFeasibility everything else uses, never by a hand-derived
// closed form.
import {
  calculateFeasibility,
  type FeasibilityInputs,
  type FeasibilityContext,
  type FeasibilityResult,
  type GstMethod,
} from "./feasibilityCalculator";
import { calculateStampDuty, type AuState } from "./stampDuty";
import { calculateTitleFees } from "./titleFees";

export interface ResidualLandSolveResult {
  landPrice: number;
  stampDuty: number;
  // null when the state's fee schedule is unverified (lib/titleFees.ts
  // throws for QLD/WA/SA/NT) or no state is selected -- treated as $0 in
  // the solve, same convention FeasibilitySubtab already uses.
  titleTransferFee: number | null;
  // The full feasibility at the solved price -- margin on cost here equals
  // the target (to bisection tolerance) by construction.
  result: FeasibilityResult;
}

// Duty/fees re-derived per candidate price -- the whole point of this
// module. calculateTitleFees throws for unverified states; stamp duty
// throws only on a missing rate table. Either failure degrades to $0/null
// rather than blocking the solve.
function contextAt(price: number, state: AuState | null, gstMethod: GstMethod | null): FeasibilityContext {
  let stampDuty = 0;
  let titleFees: FeasibilityContext["titleFees"] = null;
  if (state && price > 0) {
    try { stampDuty = calculateStampDuty(state, price); } catch { /* leave at 0 */ }
    try { titleFees = calculateTitleFees(state, price, null); } catch { titleFees = null; }
  }
  return { purchasePrice: price, stampDuty, titleFees, gstMethod };
}

// Same bisection shape as lib/feasibilityCalculator.ts's (not exported
// from there) -- evaluate must be increasing in x and cross zero once in
// [lo, hi].
function bisect(evaluate: (x: number) => number, lo: number, hi: number, iterations = 60): number {
  let a = lo, b = hi;
  for (let i = 0; i < iterations; i++) {
    const mid = (a + b) / 2;
    if (evaluate(mid) > 0) b = mid; else a = mid;
  }
  return (a + b) / 2;
}

// Upper bound for the search: land can never cost more than gross revenue
// (a deal where it does can't hit ANY positive margin), so 2x revenue is a
// comfortably safe bracket; the $10m floor keeps the bracket sane when
// revenue inputs are still blank.
function searchCeiling(inputs: FeasibilityInputs): number {
  const revenue = (inputs.dwellingsCount ?? 0) * (inputs.expectedSalePricePerDwelling ?? 0);
  return Math.max(revenue * 2, 10_000_000);
}

export function solveResidualLandValue(
  inputs: FeasibilityInputs,
  state: AuState | null,
  gstMethod: GstMethod | null,
): ResidualLandSolveResult | null {
  if (inputs.targetMarginPct == null) return null;
  const target = inputs.targetMarginPct;

  // margin on cost is decreasing in land price, so (target - margin) is
  // increasing -- the shape bisect expects.
  const evaluate = (price: number) => {
    const r = calculateFeasibility(inputs, contextAt(price, state, gstMethod));
    return target - (r.marginOnCostPct ?? -Infinity);
  };

  const hi = searchCeiling(inputs);
  // Even free land can't reach the target (other costs alone eat the
  // margin) -> no honest answer; returning $0 would look like a real bid.
  if (evaluate(0) > 0) return null;
  // Target still exceeded at the ceiling -> inputs are degenerate (e.g.
  // no costs entered at all); an unbounded "answer" is meaningless.
  if (evaluate(hi) < 0) return null;

  const landPrice = bisect(evaluate, 0, hi);
  const ctx = contextAt(landPrice, state, gstMethod);
  return {
    landPrice,
    stampDuty: ctx.stampDuty,
    titleTransferFee: ctx.titleFees?.transferFee ?? null,
    result: calculateFeasibility(inputs, ctx),
  };
}

// Residual land value across a grid of target margins x sale price moves --
// "what can I still pay if the market softens 10% / if I'd accept an 15%
// margin". Null cells mean the combination can't be achieved at any
// non-negative land price.
export interface ResidualLandGridRow {
  targetMarginPct: number;
  cells: { salePriceDeltaPct: number; landPrice: number | null }[];
}

export const GRID_TARGET_MARGINS = [15, 17.5, 20, 22.5, 25];
export const GRID_SALE_PRICE_DELTAS = [-10, -5, 0, 5, 10];

export function runResidualLandGrid(
  inputs: FeasibilityInputs,
  state: AuState | null,
  gstMethod: GstMethod | null,
): ResidualLandGridRow[] {
  return GRID_TARGET_MARGINS.map(margin => ({
    targetMarginPct: margin,
    cells: GRID_SALE_PRICE_DELTAS.map(delta => {
      const adjusted: FeasibilityInputs = {
        ...inputs,
        targetMarginPct: margin,
        expectedSalePricePerDwelling: inputs.expectedSalePricePerDwelling == null
          ? null
          : inputs.expectedSalePricePerDwelling * (1 + delta / 100),
      };
      return { salePriceDeltaPct: delta, landPrice: solveResidualLandValue(adjusted, state, gstMethod)?.landPrice ?? null };
    }),
  }));
}
