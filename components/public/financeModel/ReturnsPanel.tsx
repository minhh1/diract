"use client";

// Real, dated cash-flow returns -- XIRR/NPV/equity multiple/payback for
// both the unleveraged (100%-equity) and leveraged (post-facility-draw)
// cash flow, plus a residual land value back-solve. Built on
// lib/returnsEngine.ts, which reuses the SAME monthly cash flow (Cash Flow
// section above) and facility simulation (Debt Schedule above) -- distinct
// from the calculator's "Simplified IRR" card, which stays a labeled
// single-injection/single-return approximation.
import { useState } from "react";
import { Info } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import {
  computeReturns, solveResidualLandValue,
  type ReturnsMetrics,
} from "@/lib/returnsEngine";
import type { FacilityConfig, MonthlyCashFlow, MonthlyDebtRow, TaskDatesRef, TimedBudgetLine } from "@/lib/cashFlowEngine";

function formatPct(v: number | null): string {
  return v != null ? `${v.toFixed(1)}%` : "—";
}

function formatMultiple(v: number | null): string {
  return v != null ? `${v.toFixed(2)}x` : "—";
}

function formatPayback(months: number | null): string {
  return months != null ? `${months} mo` : "— (doesn't recover)";
}

function MetricsColumn({ title, metrics }: { title: string; metrics: ReturnsMetrics }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold text-slate-500">{title}</p>
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">IRR (XIRR)</p>
        <p className={`text-[18px] font-bold ${metrics.irrPct != null && metrics.irrPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{formatPct(metrics.irrPct)}</p>
      </div>
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">NPV</p>
        <p className="text-[14px] font-bold text-slate-800">{metrics.npv != null ? money(metrics.npv) : "—"}</p>
      </div>
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Equity Multiple</p>
        <p className="text-[14px] font-bold text-slate-800">{formatMultiple(metrics.equityMultiple)}</p>
      </div>
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Payback</p>
        <p className="text-[14px] font-bold text-slate-800">{formatPayback(metrics.paybackMonths)}</p>
      </div>
    </div>
  );
}

export default function ReturnsPanel({
  cashFlowRows, debtRows, lines, tasksById, facility, gdv, hasCashFlow,
}: {
  cashFlowRows: MonthlyCashFlow[];
  debtRows: MonthlyDebtRow[];
  lines: TimedBudgetLine[];
  tasksById: Map<string, TaskDatesRef>;
  facility: FacilityConfig;
  gdv: number | null;
  hasCashFlow: boolean;
}) {
  const [discountRatePct, setDiscountRatePct] = useState(10);
  const [targetIrrPct, setTargetIrrPct] = useState(20);
  const [acquisitionLineId, setAcquisitionLineId] = useState<string>("");

  const acquisitionLines = lines.filter(l => l.category === "Acquisition");

  if (!hasCashFlow) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-6">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Returns</p>
        <p className="text-[12px] text-slate-400">No timed cash flow yet -- set a linked task or timing dates on your budget lines above to see XIRR, NPV, equity multiple, and payback.</p>
      </div>
    );
  }

  const returns = computeReturns(cashFlowRows, debtRows, discountRatePct);

  const effectiveLineId = acquisitionLineId || acquisitionLines[0]?.id || "";
  const residualLandValue = effectiveLineId
    ? solveResidualLandValue({ lines, acquisitionLineId: effectiveLineId, tasksById, facility, gdv, targetLeveragedIrrPct: targetIrrPct })
    : null;

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Returns</p>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-slate-400">Discount rate</label>
          <input
            type="number"
            value={discountRatePct}
            onChange={e => setDiscountRatePct(Number(e.target.value) || 0)}
            className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-[11px] outline-none focus:border-indigo-400"
          />
          <span className="text-[10px] text-slate-400">% p.a.</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 border-t border-slate-100 pt-4">
        <MetricsColumn title="Unleveraged (100% equity)" metrics={returns.unleveraged} />
        <MetricsColumn title="Leveraged (with facility)" metrics={returns.leveraged} />
      </div>

      {acquisitionLines.length > 0 && (
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residual Land Value</p>
          <p className="text-[11px] text-slate-500">Back-solves what an Acquisition line could be, holding every other line fixed, so leveraged IRR hits a target.</p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[9px] text-slate-400 mb-1 block">Line to solve</label>
              <select
                value={effectiveLineId}
                onChange={e => setAcquisitionLineId(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400 bg-white"
              >
                {acquisitionLines.map(l => <option key={l.id} value={l.id}>{l.label || "(untitled)"}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] text-slate-400 mb-1 block">Target leveraged IRR (%)</label>
              <input
                type="number"
                value={targetIrrPct}
                onChange={e => setTargetIrrPct(Number(e.target.value) || 0)}
                className="w-24 px-3 py-1.5 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Residual Value</p>
              <p className="text-[18px] font-bold text-slate-800">{residualLandValue != null ? money(residualLandValue) : "— (not achievable)"}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-2.5 text-[11px] text-slate-500 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>Leveraged returns assume debt is drawn first against every month&apos;s shortfall (Debt Schedule above); equity only funds what the facility limit can&apos;t cover, and only receives a distribution once that month&apos;s surplus has repaid any outstanding balance.</span>
      </div>
    </div>
  );
}
