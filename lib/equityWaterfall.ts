// lib/equityWaterfall.ts
// A single-contribution/single-exit JV equity waterfall for "Money
// Partner" (Loans table lender_type = "Money Partner") capital: return of
// capital, then a compounding preferred return, then residual profit
// split at a configurable GP promote %. Standard tier priority -- each
// tier is fully funded across ALL loans before the next tier gets
// anything; a tier that can't be fully funded is paid pro-rata by each
// loan's own claim in that tier.
//
// Deliberately NOT a dated, multi-draw/multi-distribution waterfall (that
// needs the LP's contribution AND distribution schedule modeled
// month-by-month against the project's own cash flow -- a materially
// bigger model) -- same "simplified, single injection/single return"
// scope cut as lib/feasibilityCalculator.ts's simplifiedIRR, and
// explicitly labeled as such wherever it's shown. No GP "catch-up" tier
// in v1 -- residual splits straight to the promote % once the preferred
// return is met. The distributable pool passed in is assumed to already
// cover BOTH the Money Partner's capital+return AND the developer's own
// equity/return combined -- this waterfall only itemises the Money
// Partner's slice; the developer's own capital isn't separately
// return-of-capital'd out of the residual, it's implicitly whatever's
// left after the Money Partner's tiers, plus the promote.
export interface MoneyPartnerLoan {
  id: string;
  name: string | null;
  principalAmount: number;
  contributionDate: string; // ISO date -- when the LP capital goes in
}

export interface WaterfallParams {
  loans: MoneyPartnerLoan[];
  exitDate: string; // ISO date -- when the distributable pool is realized
  totalDistributableProfit: number; // total cash available to split between the Money Partner(s) and the developer at exit
  preferredReturnPct: number; // annual, compounding
  promotePct: number; // developer's (GP) share of residual profit after return of capital + preferred return
}

export interface LoanWaterfallRow {
  loanId: string;
  name: string | null;
  principalAmount: number;
  yearsOutstanding: number;
  preferredReturnAccrued: number;
  returnOfCapital: number;
  preferredReturnPaid: number;
  residualShare: number;
  totalDistribution: number;
  equityMultiple: number | null;
  irrPct: number | null; // annualised CAGR on this loan's own contribution/distribution, same convention as feasibilityCalculator's simplifiedIRR
}

export interface WaterfallResult {
  rows: LoanWaterfallRow[];
  totalLpCapital: number;
  totalLpDistribution: number;
  totalPreferredReturnAccrued: number;
  totalReturnOfCapital: number;
  totalResidualToLp: number;
  gpResidual: number;
  shortfall: number; // > 0 if the pool couldn't even cover return of capital + full preferred return
}

function yearsBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / (365 * 24 * 60 * 60 * 1000));
}

export function calculateEquityWaterfall(params: WaterfallParams): WaterfallResult {
  const { loans, exitDate, totalDistributableProfit, preferredReturnPct, promotePct } = params;

  const totalLpCapital = loans.reduce((s, l) => s + l.principalAmount, 0);
  const accruals = loans.map(l => {
    const years = yearsBetween(l.contributionDate, exitDate);
    const preferredReturnAccrued = l.principalAmount * (Math.pow(1 + preferredReturnPct / 100, years) - 1);
    return { loan: l, years, preferredReturnAccrued };
  });
  const totalPreferredReturnAccrued = accruals.reduce((s, a) => s + a.preferredReturnAccrued, 0);

  let pool = Math.max(0, totalDistributableProfit);

  // Tier 1: return of capital, pro-rata by principal if underfunded.
  const tier1Available = Math.min(pool, totalLpCapital);
  pool -= tier1Available;
  const tier1Ratio = totalLpCapital > 0 ? tier1Available / totalLpCapital : 0;

  // Tier 2: compounding preferred return, pro-rata by each loan's own accrual if underfunded.
  const tier2Available = Math.min(pool, totalPreferredReturnAccrued);
  pool -= tier2Available;
  const tier2Ratio = totalPreferredReturnAccrued > 0 ? tier2Available / totalPreferredReturnAccrued : 0;

  // Tier 3: residual, split developer/LP at the promote %, LP side pro-rata by principal.
  const gpResidual = pool * (promotePct / 100);
  const totalResidualToLp = pool - gpResidual;

  const rows: LoanWaterfallRow[] = accruals.map(a => {
    const returnOfCapital = a.loan.principalAmount * tier1Ratio;
    const preferredReturnPaid = a.preferredReturnAccrued * tier2Ratio;
    const residualShare = totalLpCapital > 0 ? totalResidualToLp * (a.loan.principalAmount / totalLpCapital) : 0;
    const totalDistribution = returnOfCapital + preferredReturnPaid + residualShare;
    const equityMultiple = a.loan.principalAmount > 0 ? totalDistribution / a.loan.principalAmount : null;
    const irrPct = a.loan.principalAmount > 0 && a.years > 0 && totalDistribution > 0
      ? (Math.pow(totalDistribution / a.loan.principalAmount, 1 / a.years) - 1) * 100
      : null;
    return {
      loanId: a.loan.id, name: a.loan.name, principalAmount: a.loan.principalAmount, yearsOutstanding: a.years,
      preferredReturnAccrued: a.preferredReturnAccrued, returnOfCapital, preferredReturnPaid, residualShare,
      totalDistribution, equityMultiple, irrPct,
    };
  });

  const totalLpDistribution = rows.reduce((s, r) => s + r.totalDistribution, 0);
  const totalReturnOfCapital = rows.reduce((s, r) => s + r.returnOfCapital, 0);
  const shortfall = Math.max(0, totalLpCapital + totalPreferredReturnAccrued - totalDistributableProfit);

  return { rows, totalLpCapital, totalLpDistribution, totalPreferredReturnAccrued, totalReturnOfCapital, totalResidualToLp, gpResidual, shortfall };
}
