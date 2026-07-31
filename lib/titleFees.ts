// lib/titleFees.ts
// Land titles office lodgement fees on a property acquisition -- separate
// from, and much simpler than, stamp duty (lib/stampDuty.ts): a transfer
// registration fee (flat or value-tiered depending on the state) and a
// mortgage registration fee (only relevant if the acquisition is financed
// -- see lib/loanCalculator.ts for the linked loan's principal). Shown
// alongside stamp duty in the Duty & Fees subtab.
//
// See TITLE_FEES_UPDATED_AT below for when these were last verified.
// NSW/VIC/TAS/ACT were fetched directly from that jurisdiction's own land
// titles authority (each state republishes these every 1 July, so the
// exact dollar figure below is FY2026-27's):
//   NSW: nswlrs.com.au (2026/27 Fees Update)
//   VIC: land.vic.gov.au/land-registration/fees-guides-and-forms/2026-27-fees
//   TAS: nre.tas.gov.au/Documents/2026-2027%20Brief%20Fee%20Schedule.pdf
//   ACT: accesscanberra.act.gov.au/building-and-property/land-title-lodgement-registration-and-search-forms-related-fees
// QLD/WA/SA's own titles offices only publish these as fee-calculator
// tools or PDFs that didn't yield a clean number after several fetch
// attempts -- rather than guess a dollar figure, those three throw a
// clear error (same "don't fabricate a financial number" rule
// lib/stampDuty.ts already follows for exactly this reason) until
// re-verified.
export const TITLE_FEES_UPDATED_AT = "2026-08-01";

import type { AuState } from "./stampDuty";

export interface TitleFeeResult {
  transferFee: number;
  mortgageFee: number | null; // null if no loan/mortgage on this acquisition
}

// QLD/WA/SA: fee-calculator tools or PDFs that didn't yield a clean number.
// NT: confirmed only that the fee is "in proportion to the value of the
// affected land" with no actual rate found -- not enough to compute
// anything, so it's unverified too rather than guessing a rate.
const UNVERIFIED: Set<AuState> = new Set(["QLD", "WA", "SA", "NT"]);

// Flat, or value-tiered where the source publishes it that way.
function transferFee(state: AuState, dutiableValue: number): number {
  switch (state) {
    case "NSW": return 182.73; // incl. GST, s46 Real Property Act transfer, FY2026-27
    case "VIC": return Math.min(104.30 + Math.ceil(dutiableValue / 1000) * 2.34, 104.30 + 3_614.00); // capped, FY2026-27
    case "TAS": return 256.76; // FY2026-27
    case "ACT": return 496.00; // Form 052-T, FY2026-27
    default:
      throw new Error(`Title transfer fee for ${state} hasn't been verified against an official source yet -- enter the amount manually.`);
  }
}

function mortgageFee(state: AuState): number {
  switch (state) {
    case "NSW": return 182.73; // incl. GST, FY2026-27
    case "VIC": return 129.20; // flat, electronic lodgement, FY2026-27
    case "TAS": return 167.58; // FY2026-27
    case "ACT": return 184.00; // Form 026-M, FY2026-27
    default:
      throw new Error(`Mortgage registration fee for ${state} hasn't been verified against an official source yet -- enter the amount manually.`);
  }
}

export function calculateTitleFees(state: AuState, dutiableValue: number, loanPrincipal: number | null): TitleFeeResult {
  if (UNVERIFIED.has(state)) {
    throw new Error(`Title/registration fees for ${state} haven't been verified against an official source yet -- enter the amounts manually.`);
  }
  return {
    transferFee: Math.round(transferFee(state, dutiableValue) * 100) / 100,
    mortgageFee: loanPrincipal && loanPrincipal > 0 ? Math.round(mortgageFee(state) * 100) / 100 : null,
  };
}
