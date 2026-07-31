"use client";

// A one-page printable Investment Committee memo -- headline KPIs, the
// cumulative cash-flow chart, and the tornado sensitivity chart, all
// reused straight from the panels already on this page so the memo can
// never show a number that disagrees with what's on screen. Print-
// optimized HTML (@media print CSS + window.print()) rather than a new
// PDF dependency -- pdf-lib exists in this codebase for invoice/trust
// documents, but isn't suited to this chart-heavy, one-page layout.
import { X, Printer } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import type { FeasibilityInputs, FeasibilityResult } from "@/lib/feasibilityCalculator";
import type { MonthlyCashFlow, FacilitySimulationResult } from "@/lib/cashFlowEngine";
import { computeReturns } from "@/lib/returnsEngine";
import type { TornadoResult } from "@/lib/sensitivityEngine";
import CashFlowChart from "./CashFlowChart";
import TornadoChart from "./TornadoChart";

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-[16px] font-bold text-slate-800">{value}</p>
    </div>
  );
}

export default function ICMemoView({
  projectName, onClose, result, inputs, monthlyCashFlow, facilitySimulation, tornado,
}: {
  projectName: string;
  onClose: () => void;
  result: FeasibilityResult;
  inputs: FeasibilityInputs;
  monthlyCashFlow: MonthlyCashFlow[];
  facilitySimulation: FacilitySimulationResult;
  tornado: TornadoResult;
}) {
  const returns = computeReturns(monthlyCashFlow, facilitySimulation.rows, 10);
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="ic-memo-overlay fixed inset-0 z-50 bg-slate-900/40 overflow-y-auto py-8 px-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .ic-memo-overlay, .ic-memo-overlay * { visibility: visible; }
          .ic-memo-overlay { position: fixed; inset: 0; background: white; padding: 0; }
        }
      `}</style>

      <div className="print:hidden flex items-center justify-end gap-2 max-w-[820px] mx-auto mb-3">
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700">
          <Printer size={13} /> Print / Save PDF
        </button>
        <button onClick={onClose} className="flex items-center gap-1.5 px-4 py-2 bg-white text-slate-600 text-[12px] font-bold rounded-full border border-slate-200 hover:bg-slate-50">
          <X size={13} /> Close
        </button>
      </div>

      <div className="bg-white rounded-[24px] max-w-[820px] mx-auto p-10 space-y-5">
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Investment Committee Memo</p>
            <h1 className="text-[22px] font-bold text-slate-800">{projectName || "Untitled Project"}</h1>
          </div>
          <p className="text-[10px] text-slate-400">{today}</p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Kpi label="Return on Equity" value={result.returnOnEquityPct != null ? `${result.returnOnEquityPct.toFixed(1)}%` : "—"} />
          <Kpi label="Required Equity" value={money(result.requiredEquity)} />
          <Kpi label="Net Profit" value={money(result.netProfit)} />
          <Kpi label="Margin on Cost" value={result.marginOnCostPct != null ? `${result.marginOnCostPct.toFixed(1)}%` : "—"} />
          <Kpi label="Leveraged IRR (XIRR)" value={returns.leveraged.irrPct != null ? `${returns.leveraged.irrPct.toFixed(1)}%` : "—"} />
          <Kpi label="Unleveraged IRR (XIRR)" value={returns.unleveraged.irrPct != null ? `${returns.unleveraged.irrPct.toFixed(1)}%` : "—"} />
          <Kpi label="Equity Multiple" value={returns.leveraged.equityMultiple != null ? `${returns.leveraged.equityMultiple.toFixed(2)}x` : "—"} />
          <Kpi label="Peak Debt" value={money(facilitySimulation.peakDebt)} />
          <Kpi label="NPV @ 10% (Leveraged)" value={returns.leveraged.npv != null ? money(returns.leveraged.npv) : "—"} />
          <Kpi label="Payback (Leveraged)" value={returns.leveraged.paybackMonths != null ? `${returns.leveraged.paybackMonths} mo` : "—"} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Assumptions</p>
          <div className="grid grid-cols-4 gap-3 text-[11px] text-slate-600">
            <div><span className="text-slate-400">Dwellings: </span>{inputs.dwellingsCount ?? "—"}</div>
            <div><span className="text-slate-400">Avg size: </span>{inputs.avgDwellingSizeSqm ?? "—"} sqm</div>
            <div><span className="text-slate-400">Sale price/dwelling: </span>{inputs.expectedSalePricePerDwelling != null ? money(inputs.expectedSalePricePerDwelling) : "—"}</div>
            <div><span className="text-slate-400">Construction rate: </span>{inputs.constructionRatePerSqm != null ? `${money(inputs.constructionRatePerSqm)}/sqm` : "—"}</div>
            <div><span className="text-slate-400">Duration: </span>{inputs.projectDurationMonths ?? "—"} months</div>
            <div><span className="text-slate-400">Facility limit: </span>{inputs.facilityLimit != null ? money(inputs.facilityLimit) : "—"}</div>
            <div><span className="text-slate-400">Facility rate: </span>{inputs.facilityInterestRatePct != null ? `${inputs.facilityInterestRatePct}% p.a.` : "—"}</div>
            <div><span className="text-slate-400">Max LVR: </span>{inputs.maxLvrPct != null ? `${inputs.maxLvrPct}%` : "—"}</div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cumulative Net Cash Position</p>
          <CashFlowChart rows={monthlyCashFlow} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Sensitivity -- Leveraged IRR</p>
          <TornadoChart result={tornado} />
        </div>

        <div className="border-t border-slate-100 pt-3 text-[9px] text-slate-400">
          Generated from the Feasibility calculator&apos;s current inputs -- a scoped-down parametric model (not the full commercial PropDEV tool); NPV shown at a fixed 10% discount rate. See the Feasibility tab for full scope-cut notes.
        </div>
      </div>
    </div>
  );
}
