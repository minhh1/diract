// lib/sensitivityEngine.ts
// Tornado sensitivity: how much leveraged IRR swings when GDV, cost,
// facility interest rate, or the completion schedule each move independently,
// holding everything else at its base case. Distinct from
// lib/feasibilityCalculator.ts's runSensitivity (a 5x5 sale-price ×
// construction-cost grid over Margin on Cost %, computed instantly/
// non-dated) -- this reuses the SAME dated pipeline as the Cash Flow/Debt
// Schedule/Returns panels (lib/cashFlowEngine.ts + lib/returnsEngine.ts),
// so the swings shown here are consistent with the headline leveraged IRR.
import { buildMonthlyCashFlow, simulateFacility, type FacilityConfig, type TaskDatesRef, type TimedBudgetLine } from "./cashFlowEngine";
import { leveragedCashFlow, xirr } from "./returnsEngine";

function shiftDate(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

// Models a genuine construction schedule slip (or pull-forward), not a
// pure calendar shift of every date (which would leave XIRR completely
// unchanged, since it only depends on relative spacing between flows).
// Acquisition stays fixed -- land settlement is contractual, not subject
// to a construction schedule. Revenue's whole settlement window (start
// AND end) moves together -- shifting only its end could push it earlier
// than its own start on a pull-forward, which resolveLineDates silently
// clamps back to start, making the shift a no-op. Every other cost
// category (Construction/Professional Fees/Contingency/Other) shifts only
// its END date -- extending or compressing the spend curve while
// mobilisation stays put, i.e. exactly "the build finishes N months late."
function shiftCompletion(tasksById: Map<string, TaskDatesRef>, lines: TimedBudgetLine[], months: number): { tasksById: Map<string, TaskDatesRef>; lines: TimedBudgetLine[] } {
  const shiftedTasks = new Map<string, TaskDatesRef>(tasksById);
  const shiftedLines = lines.map(l => {
    if (l.category === "Acquisition") return l;
    const shiftWholeWindow = l.category === "Revenue";
    if (l.linkedTaskId) {
      const t = tasksById.get(l.linkedTaskId);
      if (t) {
        shiftedTasks.set(l.linkedTaskId, {
          start_date: shiftWholeWindow && t.start_date ? shiftDate(t.start_date, months) : t.start_date,
          due_date: t.due_date ? shiftDate(t.due_date, months) : t.due_date,
        });
      }
      return l;
    }
    return {
      ...l,
      timingStartDate: shiftWholeWindow && l.timingStartDate ? shiftDate(l.timingStartDate, months) : l.timingStartDate,
      timingEndDate: l.timingEndDate ? shiftDate(l.timingEndDate, months) : l.timingEndDate,
    };
  });
  return { tasksById: shiftedTasks, lines: shiftedLines };
}

function leveragedIrrPct(lines: TimedBudgetLine[], tasksById: Map<string, TaskDatesRef>, facility: FacilityConfig): number | null {
  const { rows } = buildMonthlyCashFlow(lines, tasksById);
  if (rows.length === 0) return null;
  const gdv = lines.filter(l => l.category === "Revenue").reduce((s, l) => s + l.budgetedAmount, 0);
  const sim = simulateFacility(rows, facility, gdv > 0 ? gdv : null);
  const irr = xirr(leveragedCashFlow(sim.rows));
  return irr != null ? irr * 100 : null;
}

export interface TornadoRow {
  label: string;
  lowIrrPct: number | null; // the adverse end
  highIrrPct: number | null; // the favorable end
}

export interface TornadoResult {
  baselineIrrPct: number | null;
  rows: TornadoRow[]; // sorted by swing (|high - low|) descending
}

export interface TornadoParams {
  lines: TimedBudgetLine[];
  tasksById: Map<string, TaskDatesRef>;
  facility: FacilityConfig;
  gdvDeltaPct?: number; // default 10
  costDeltaPct?: number; // default 10
  rateDeltaBps?: number; // default 100
  delayMonths?: number; // default 3
}

export function runTornadoSensitivity(params: TornadoParams): TornadoResult {
  const { lines, tasksById, facility, gdvDeltaPct = 10, costDeltaPct = 10, rateDeltaBps = 100, delayMonths = 3 } = params;

  const baselineIrrPct = leveragedIrrPct(lines, tasksById, facility);

  const scaleCategory = (pct: number, isRevenue: boolean) =>
    lines.map(l => ((l.category === "Revenue") === isRevenue ? { ...l, budgetedAmount: l.budgetedAmount * (1 + pct / 100) } : l));

  const gdvLow = leveragedIrrPct(scaleCategory(-gdvDeltaPct, true), tasksById, facility);
  const gdvHigh = leveragedIrrPct(scaleCategory(gdvDeltaPct, true), tasksById, facility);

  const costLow = leveragedIrrPct(scaleCategory(-costDeltaPct, false), tasksById, facility);
  const costHigh = leveragedIrrPct(scaleCategory(costDeltaPct, false), tasksById, facility);

  const rateDeltaPct = rateDeltaBps / 100;
  const rateLow = leveragedIrrPct(lines, tasksById, { ...facility, interestRatePct: Math.max(0, facility.interestRatePct - rateDeltaPct) });
  const rateHigh = leveragedIrrPct(lines, tasksById, { ...facility, interestRatePct: facility.interestRatePct + rateDeltaPct });

  const early = shiftCompletion(tasksById, lines, -delayMonths);
  const late = shiftCompletion(tasksById, lines, delayMonths);
  const delayLow = leveragedIrrPct(late.lines, late.tasksById, facility); // later completion -- adverse
  const delayHigh = leveragedIrrPct(early.lines, early.tasksById, facility); // earlier completion -- favorable

  const rows: TornadoRow[] = [
    { label: `GDV ±${gdvDeltaPct}%`, lowIrrPct: gdvLow, highIrrPct: gdvHigh },
    { label: `Cost ±${costDeltaPct}%`, lowIrrPct: costLow, highIrrPct: costHigh },
    { label: `Facility rate ±${rateDeltaBps}bps`, lowIrrPct: rateLow, highIrrPct: rateHigh },
    { label: `Completion ±${delayMonths}mo`, lowIrrPct: delayLow, highIrrPct: delayHigh },
  ];

  rows.sort((a, b) => {
    const swingA = a.lowIrrPct != null && a.highIrrPct != null ? Math.abs(a.highIrrPct - a.lowIrrPct) : -1;
    const swingB = b.lowIrrPct != null && b.highIrrPct != null ? Math.abs(b.highIrrPct - b.lowIrrPct) : -1;
    return swingB - swingA;
  });

  return { baselineIrrPct, rows };
}
