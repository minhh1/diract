// lib/stampDuty.ts
// Australian state/territory transfer (stamp) duty on a property
// acquisition -- shown with full working in the Finance Model's Duty &
// Fees subtab (components/public/financeModel/DutyFeesSubtab.tsx), which
// can push the result into an Acquisition budget line.
//
// See STAMP_DUTY_RATES_UPDATED_AT below for when these were last verified.
// NSW/VIC/QLD/WA/TAS/ACT were fetched directly from that state/territory's
// own revenue office; SA/NT's own revenue office sites (revenuesa.sa.gov.au,
// nt.gov.au) blocked direct fetching on every attempt across two research
// passes this project, so those two are sourced from
// stampduty.calculatorsaustralia.com.au (the aggregator site explicitly
// pointed to for this feature) instead -- cross-checked internally (SA's
// own bracket bases are self-consistent; NT's formula reproduces the
// aggregator's own worked $500k example exactly) but a rung below the
// primary-source rigor of the other six. Re-verify all of these before
// trusting for a live deal, and definitely before a rate-change date
// passes:
//   NSW: revenue.nsw.gov.au/taxes-duties-levies-royalties/transfer-duty/understanding-transfer-duty/calculate-transfer-duty
//   VIC: sro.vic.gov.au/about-us/rates-and-statistics/current-rates/land-transfer-duty-non-principal-place-residence-current-rates
//   QLD: qro.qld.gov.au/duties/transfer-duty/calculate/rates/
//   WA:  wa.gov.au/organisation/department-of-treasury-and-finance/transfer-duty-assessment
//   TAS: sro.tas.gov.au/property-transfer-duties/rates-of-duty
//   ACT: revenue.act.gov.au/rates-and-property-charges/conveyance-duty-stamp-duty/conveyance-duty-for-non-commercial-property
//   SA:  stampduty.calculatorsaustralia.com.au (secondary -- RevenueSA blocked fetch), "effective from 2026-03-25" per that page
//   NT:  stampduty.calculatorsaustralia.com.au (secondary -- NT Treasury blocked fetch)
// These are general (non-PPR, non-first-home-buyer, non-foreign-purchaser)
// rates only -- a real deal may qualify for a concession or attract a
// foreign/absentee-owner surcharge on top, neither of which this
// calculates. Treat the result as a starting point for the budget line,
// not a final figure -- it's inserted as an ordinary, editable
// finance_model_budget_lines row, never shown as authoritative.
export const STAMP_DUTY_RATES_UPDATED_AT = "2026-08-01";

export type AuState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "NT" | "ACT";

interface Bracket {
  upTo: number; // Infinity for the top bracket
  base: number;
  rate: number; // per $1 (not per $100) over the bracket's floor
  floor: number;
}

const RATE_TABLES: Partial<Record<AuState, Bracket[]>> = {
  NSW: [
    { upTo: 18_000, base: 0, rate: 0.0125, floor: 0 },
    { upTo: 38_000, base: 225, rate: 0.015, floor: 18_000 },
    { upTo: 103_000, base: 525, rate: 0.0175, floor: 38_000 },
    { upTo: 387_000, base: 1_662, rate: 0.035, floor: 103_000 },
    { upTo: 1_290_000, base: 11_602, rate: 0.045, floor: 387_000 },
    { upTo: Infinity, base: 52_237, rate: 0.055, floor: 1_290_000 },
  ],
  VIC: [
    { upTo: 25_000, base: 0, rate: 0.014, floor: 0 },
    { upTo: 130_000, base: 350, rate: 0.024, floor: 25_000 },
    { upTo: 960_000, base: 2_870, rate: 0.06, floor: 130_000 },
    // 960k-2m is a flat 5.5% of the WHOLE value, not marginal -- handled as
    // a special case in calculateStampDuty rather than base+floor here.
    { upTo: 2_000_000, base: 0, rate: 0.055, floor: 0 },
    { upTo: Infinity, base: 110_000, rate: 0.065, floor: 2_000_000 },
  ],
  QLD: [
    { upTo: 5_000, base: 0, rate: 0, floor: 0 },
    { upTo: 75_000, base: 0, rate: 0.015, floor: 5_000 },
    { upTo: 540_000, base: 1_050, rate: 0.035, floor: 75_000 },
    { upTo: 1_000_000, base: 17_325, rate: 0.045, floor: 540_000 },
    { upTo: Infinity, base: 38_025, rate: 0.0575, floor: 1_000_000 },
  ],
  WA: [
    { upTo: 120_000, base: 0, rate: 0.019, floor: 0 },
    { upTo: 150_000, base: 2_280, rate: 0.0285, floor: 120_000 },
    { upTo: 360_000, base: 3_135, rate: 0.038, floor: 150_000 },
    { upTo: 725_000, base: 11_115, rate: 0.0475, floor: 360_000 },
    { upTo: Infinity, base: 28_453, rate: 0.0515, floor: 725_000 },
  ],
  TAS: [
    { upTo: 3_000, base: 50, rate: 0, floor: 0 }, // flat $50 minimum, no marginal component below $3k
    { upTo: 25_000, base: 50, rate: 0.0175, floor: 3_000 },
    { upTo: 75_000, base: 435, rate: 0.0225, floor: 25_000 },
    { upTo: 200_000, base: 1_560, rate: 0.035, floor: 75_000 },
    { upTo: 375_000, base: 5_935, rate: 0.04, floor: 200_000 },
    { upTo: 725_000, base: 12_935, rate: 0.0425, floor: 375_000 },
    { upTo: Infinity, base: 27_810, rate: 0.045, floor: 725_000 },
  ],
  ACT: [
    { upTo: 200_000, base: 0, rate: 0.012, floor: 0 },
    { upTo: 300_000, base: 2_400, rate: 0.022, floor: 200_000 },
    { upTo: 500_000, base: 4_600, rate: 0.034, floor: 300_000 },
    { upTo: 750_000, base: 11_400, rate: 0.0432, floor: 500_000 },
    { upTo: 1_000_000, base: 22_200, rate: 0.059, floor: 750_000 },
    { upTo: 1_455_000, base: 36_950, rate: 0.064, floor: 1_000_000 },
    // Over $1.455m is a flat 4.54% of the WHOLE value -- special case below.
    { upTo: Infinity, base: 0, rate: 0.0454, floor: 0 },
  ],
  // 9-bracket schedule, unchanged since 2012 per the source -- fully
  // marginal (no flat-rate special-case bands like VIC/ACT/NT).
  SA: [
    { upTo: 12_000, base: 0, rate: 0.01, floor: 0 },
    { upTo: 30_000, base: 120, rate: 0.02, floor: 12_000 },
    { upTo: 50_000, base: 480, rate: 0.03, floor: 30_000 },
    { upTo: 100_000, base: 1_080, rate: 0.035, floor: 50_000 },
    { upTo: 200_000, base: 2_830, rate: 0.04, floor: 100_000 },
    { upTo: 250_000, base: 6_830, rate: 0.0425, floor: 200_000 },
    { upTo: 300_000, base: 8_955, rate: 0.0475, floor: 250_000 },
    { upTo: 500_000, base: 11_330, rate: 0.05, floor: 300_000 },
    { upTo: Infinity, base: 21_330, rate: 0.055, floor: 500_000 },
  ],
};

// NT doesn't use a marginal bracket table at all -- values up to $525,000
// use a quadratic formula (D = 0.06571441×V² + 15×V, V = value/1000), and
// values above that use a flat rate (not marginal) on the whole value in
// three bands. Kept as its own function rather than forced into the
// Bracket/RATE_TABLES shape every other state uses.
function ntStampDuty(dutiableValue: number): number {
  if (dutiableValue <= 525_000) {
    const v = dutiableValue / 1000;
    return Math.round((0.06571441 * v * v + 15 * v) * 100) / 100;
  }
  const rate = dutiableValue < 3_000_000 ? 0.0495 : dutiableValue < 5_000_000 ? 0.0575 : 0.0595;
  return Math.round(dutiableValue * rate * 100) / 100;
}

// Duty rounds to the nearest dollar/cent the same way every state's own
// calculator does -- $X.XX per $100 "or part thereof" means the bracket
// portion is rounded UP to the next whole $100 before applying the rate.
function marginalDuty(dutiableValue: number, bracket: Bracket): number {
  const excess = Math.max(0, dutiableValue - bracket.floor);
  const roundedExcess = Math.ceil(excess / 100) * 100;
  return bracket.base + roundedExcess * bracket.rate;
}

export function calculateStampDuty(state: AuState, dutiableValue: number): number {
  if (dutiableValue <= 0) return 0;

  if (state === "NT") return ntStampDuty(dutiableValue);

  // VIC's 960k-2m band and ACT's over-$1.455m band are flat rates on the
  // WHOLE dutiable value, not marginal like every other bracket -- handled
  // as special cases rather than forcing the generic bracket walk to
  // support two different duty models.
  if (state === "VIC" && dutiableValue > 960_000 && dutiableValue <= 2_000_000) {
    return Math.round(dutiableValue * 0.055 * 100) / 100;
  }
  if (state === "ACT" && dutiableValue > 1_455_000) {
    return Math.round(dutiableValue * 0.0454 * 100) / 100;
  }

  const table = RATE_TABLES[state];
  if (!table) throw new Error(`No stamp duty rate table for ${state}`);

  const bracket = table.find(b => dutiableValue <= b.upTo) ?? table[table.length - 1];
  return Math.round(marginalDuty(dutiableValue, bracket) * 100) / 100;
}

export const AU_STATES: AuState[] = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "NT", "ACT"];

// A step-by-step explanation of how calculateStampDuty arrived at its
// number -- used by the Duty & Fees subtab to show the working, not just
// the total, per the "clear calculation" ask. `explanation` is a plain-
// English sentence; `duty` always equals what calculateStampDuty(state,
// dutiableValue) returns for the same inputs (computed via the exact same
// code paths, not re-derived).
export interface StampDutyBreakdown {
  duty: number;
  explanation: string;
}

export function explainStampDuty(state: AuState, dutiableValue: number): StampDutyBreakdown {
  const duty = calculateStampDuty(state, dutiableValue);
  const money = (n: number) => n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });

  if (dutiableValue <= 0) return { duty: 0, explanation: "No duty payable on a nil or negative value." };

  if (state === "NT") {
    if (dutiableValue <= 525_000) {
      return { duty, explanation: `NT uses a formula, not brackets, for values up to $525,000: 0.06571441 × (value ÷ 1000)² + 15 × (value ÷ 1000) = ${money(duty)}.` };
    }
    const rate = dutiableValue < 3_000_000 ? 4.95 : dutiableValue < 5_000_000 ? 5.75 : 5.95;
    return { duty, explanation: `Above $525,000, NT charges a flat ${rate}% of the whole value: ${rate}% × ${money(dutiableValue)} = ${money(duty)}.` };
  }
  if (state === "VIC" && dutiableValue > 960_000 && dutiableValue <= 2_000_000) {
    return { duty, explanation: `Between $960,000 and $2,000,000, VIC charges a flat 5.5% of the whole value: 5.5% × ${money(dutiableValue)} = ${money(duty)}.` };
  }
  if (state === "ACT" && dutiableValue > 1_455_000) {
    return { duty, explanation: `Above $1,455,000, ACT charges a flat 4.54% of the whole value: 4.54% × ${money(dutiableValue)} = ${money(duty)}.` };
  }

  const table = RATE_TABLES[state];
  if (!table) return { duty, explanation: "No rate table available." };
  const bracket = table.find(b => dutiableValue <= b.upTo) ?? table[table.length - 1];
  const excess = Math.max(0, dutiableValue - bracket.floor);
  const roundedExcess = Math.ceil(excess / 100) * 100;
  const rangeLabel = bracket.upTo === Infinity ? `over ${money(bracket.floor)}` : `${money(bracket.floor)}–${money(bracket.upTo)}`;
  return {
    duty,
    explanation: `${money(dutiableValue)} falls in the ${rangeLabel} bracket: ${money(bracket.base)} base + ${(bracket.rate * 100).toFixed(2)}% × ${money(roundedExcess)} (the excess over ${money(bracket.floor)}, rounded up to the next $100) = ${money(duty)}.`,
  };
}
