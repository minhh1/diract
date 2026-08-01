"use client";

// An interactive budget + feasibility calculator for the public demo link.
//
// Runs ENTIRELY in the browser: lib/feasibilityCalculator.ts and
// lib/stampDuty.ts are pure functions, so every keystroke recomputes
// locally and nothing is ever sent to the server. That is what makes this
// safe to hand to a prospect with no login -- there is no write endpoint
// involved, nothing to persist, and no way for anything typed here to
// touch real project data.
//
// Seeded with EXAMPLE figures, not the company's own. The real budget is
// redacted on this link, so there would be nothing to drive the maths
// with; illustrative numbers also mean the visitor can change anything
// without wondering whether they are editing something real. Reset puts
// them back.
import { useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import {
  calculateFeasibility, solveBreakEvenSalePricePerDwelling, solveMaxSupportableLandPrice,
  runScenarios, runSensitivity, simplifiedIRR,
  GST_METHODS, type GstMethod, type FeasibilityInputs, type FeasibilityContext,
} from "@/lib/feasibilityCalculator";
import { calculateStampDuty, AU_STATES, type AuState } from "@/lib/stampDuty";

// A plausible small townhouse development -- round, obviously illustrative
// numbers rather than anything resembling a real deal. Tuned so the
// opening state is a HEALTHY deal (~22% margin on cost, just above the 20%
// target): the first thing a prospect sees shouldn't be a red "below
// target" verdict on a loss-making example. Nudging the sale price or
// build rate from here tips it either way, which is the point.
const EXAMPLE_INPUTS: FeasibilityInputs = {
  dwellingsCount: 4, avgDwellingSizeSqm: 180, siteAreaSqm: 800,
  expectedSalePricePerDwelling: 1_150_000, constructionRatePerSqm: 3_000,
  professionalFeesPct: 8, contingencyPct: 5, marketingSellingPct: 2.5,
  otherAcquisitionCosts: 30_000, holdingCostsAnnual: 15_000,
  projectDurationMonths: 20, interestRatePct: 7.5, loanToCostPct: 80,
  targetMarginPct: 20,
  facilityLimit: null, facilityInterestRatePct: null, maxLvrPct: null,
  preferredReturnPct: null, promotePct: null,
};
const EXAMPLE_LAND_PRICE = 900_000;

const FIELD_GROUPS: { title: string; fields: { key: keyof FeasibilityInputs; label: string; suffix?: string }[] }[] = [
  {
    title: "The project",
    fields: [
      { key: "dwellingsCount", label: "Number of dwellings" },
      { key: "avgDwellingSizeSqm", label: "Avg dwelling size", suffix: "sqm" },
      { key: "expectedSalePricePerDwelling", label: "Expected sale price each", suffix: "$" },
      { key: "projectDurationMonths", label: "Project duration", suffix: "months" },
    ],
  },
  {
    title: "The budget",
    fields: [
      { key: "constructionRatePerSqm", label: "Construction rate", suffix: "$/sqm" },
      { key: "professionalFeesPct", label: "Professional fees", suffix: "% of construction" },
      { key: "contingencyPct", label: "Contingency", suffix: "% of construction" },
      { key: "marketingSellingPct", label: "Marketing & selling", suffix: "% of revenue" },
      { key: "otherAcquisitionCosts", label: "Other acquisition costs", suffix: "$" },
      { key: "holdingCostsAnnual", label: "Holding costs", suffix: "$/year" },
    ],
  },
  {
    title: "Funding",
    fields: [
      { key: "interestRatePct", label: "Interest rate", suffix: "% p.a." },
      { key: "loanToCostPct", label: "Loan to cost", suffix: "%" },
      { key: "targetMarginPct", label: "Target margin on cost", suffix: "%" },
    ],
  },
];

function Line({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "font-bold text-slate-800" : "text-slate-600"} ${indent ? "pl-4 text-[11px]" : "text-[12px]"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function Tile({ label, value, tone, big }: { label: string; value: string; tone?: "good" | "bad"; big?: boolean }) {
  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`${big ? "text-[24px]" : "text-[15px]"} font-bold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

export default function PublicFeasibilitySandbox() {
  const [inputs, setInputs] = useState<FeasibilityInputs>(EXAMPLE_INPUTS);
  const [landPrice, setLandPrice] = useState<number>(EXAMPLE_LAND_PRICE);
  const [state, setState] = useState<AuState>("VIC");
  const [gstMethod, setGstMethod] = useState<GstMethod>("Margin Scheme");

  const reset = () => { setInputs(EXAMPLE_INPUTS); setLandPrice(EXAMPLE_LAND_PRICE); setState("VIC"); setGstMethod("Margin Scheme"); };

  let stampDuty = 0;
  try { stampDuty = calculateStampDuty(state, landPrice); } catch { /* leave at 0 */ }
  const ctx: FeasibilityContext = { purchasePrice: landPrice, stampDuty, titleFees: null, gstMethod };

  const r = calculateFeasibility(inputs, ctx);
  const irr = simplifiedIRR(r.requiredEquity, r.netProfit, inputs.projectDurationMonths ?? 0);
  const breakEven = solveBreakEvenSalePricePerDwelling(inputs, ctx);
  const maxLand = solveMaxSupportableLandPrice(inputs, ctx);
  const scenarios = runScenarios(inputs, ctx);
  const sensitivity = runSensitivity(inputs, ctx);

  const setField = (key: keyof FeasibilityInputs, v: string) =>
    setInputs(prev => ({ ...prev, [key]: v === "" ? null : Number(v) }));

  return (
    <div className="space-y-4">
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-4 py-3 text-[11px] text-indigo-700 flex items-start gap-2">
        <Calculator size={13} className="mt-0.5 shrink-0" />
        <span>
          Try it: every figure below is editable and the whole model recalculates as you type. These are
          <strong> example numbers</strong>, not this company&apos;s, and nothing you change here is saved or sent anywhere &mdash;
          it all runs in your browser.
        </span>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Budget &amp; Feasibility Calculator</p>
          <button onClick={reset} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
            <RotateCcw size={11} /> Reset to example
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] text-slate-400 mb-1 block">Land price ($)</label>
            <input type="number" value={landPrice} onChange={e => setLandPrice(Number(e.target.value) || 0)}
              className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400 bg-white" />
          </div>
          <div>
            <label className="text-[9px] text-slate-400 mb-1 block">State (drives stamp duty)</label>
            <select value={state} onChange={e => setState(e.target.value as AuState)}
              className="w-full text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-slate-400 mb-1 block">GST method</label>
            <select value={gstMethod} onChange={e => setGstMethod(e.target.value as GstMethod)}
              className="w-full text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              {GST_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {FIELD_GROUPS.map(g => (
          <div key={g.title}>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{g.title}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {g.fields.map(f => (
                <div key={f.key}>
                  <label className="text-[9px] text-slate-400 mb-1 block">{f.label}{f.suffix ? ` (${f.suffix})` : ""}</label>
                  <input type="number" value={inputs[f.key] ?? ""} onChange={e => setField(f.key, e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400 bg-white" />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
          <Tile big label="Return on Equity" value={r.returnOnEquityPct != null ? `${r.returnOnEquityPct.toFixed(1)}%` : "—"} tone={r.returnOnEquityPct != null ? (r.returnOnEquityPct >= 0 ? "good" : "bad") : undefined} />
          <Tile big label="Net Profit" value={money(r.netProfit)} tone={r.netProfit >= 0 ? "good" : "bad"} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Tile label="Verdict" value={r.feasible == null ? "—" : r.feasible ? "Feasible" : "Below target"} tone={r.feasible == null ? undefined : r.feasible ? "good" : "bad"} />
          <Tile label="Margin on Cost" value={r.marginOnCostPct != null ? `${r.marginOnCostPct.toFixed(1)}%` : "—"} />
          <Tile label="Gross Revenue" value={money(r.revenue)} />
          <Tile label="Total Dev. Cost" value={money(r.totalDevelopmentCost)} />
          <Tile label="Required Equity" value={money(r.requiredEquity)} />
          <Tile label="Peak Debt" value={money(r.peakDebt)} />
          <Tile label="Break-even Price Each" value={breakEven != null ? money(breakEven) : "—"} />
          <Tile label="Max Land Price" value={maxLand != null ? money(maxLand) : "— not achievable"} />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Budget breakdown</p>
          <Line label="Acquisition (land + stamp duty + costs)" value={money(r.acquisition)} indent />
          <Line label="Construction" value={money(r.construction)} indent />
          <Line label="Professional fees" value={money(r.professionalFees)} indent />
          <Line label="Contingency" value={money(r.contingency)} indent />
          <Line label="Marketing &amp; selling" value={money(r.marketingSelling)} indent />
          <Line label="Holding costs" value={money(r.holding)} indent />
          <Line label="Finance costs (interest)" value={money(r.interest)} indent />
          <Line label="Less: GST input tax credits" value={`-${money(r.gstInputCredits)}`} indent />
          <Line label="Total development cost" value={money(r.totalDevelopmentCost)} bold />
          <p className="text-[10px] text-slate-400 mt-1">Stamp duty on {money(landPrice)} in {state}: {money(stampDuty)}, recalculated from that state&apos;s real rate schedule as you change the land price.</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 overflow-x-auto">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Scenarios</p>
        <table className="w-full text-[12px] min-w-[420px]">
          <thead><tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
            <th className="py-1"></th>{scenarios.map(s => <th key={s.label} className="py-1 text-right px-3">{s.label}</th>)}
          </tr></thead>
          <tbody>
            <tr><td className="py-1 text-slate-500">Net profit</td>{scenarios.map(s => <td key={s.label} className="py-1 text-right px-3">{money(s.result.netProfit)}</td>)}</tr>
            <tr><td className="py-1 text-slate-500">Margin on cost</td>{scenarios.map(s => <td key={s.label} className="py-1 text-right px-3">{s.result.marginOnCostPct != null ? `${s.result.marginOnCostPct.toFixed(1)}%` : "—"}</td>)}</tr>
            <tr><td className="py-1 text-slate-500">Return on equity</td>{scenarios.map(s => <td key={s.label} className="py-1 text-right px-3">{s.result.returnOnEquityPct != null ? `${s.result.returnOnEquityPct.toFixed(1)}%` : "—"}</td>)}</tr>
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 overflow-x-auto">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sensitivity &mdash; margin on cost %</p>
        <p className="text-[10px] text-slate-400 mb-3">Rows: sale price change. Columns: construction cost change.</p>
        <table className="w-full text-[11px] min-w-[420px] text-center">
          <thead><tr className="text-slate-400 text-[9px] font-bold">
            <th></th>{sensitivity[0].cells.map(c => <th key={c.constructionDeltaPct} className="py-1">{c.constructionDeltaPct > 0 ? "+" : ""}{c.constructionDeltaPct}%</th>)}
          </tr></thead>
          <tbody>
            {sensitivity.map(row => (
              <tr key={row.salePriceDeltaPct}>
                <td className="text-slate-400 font-bold pr-2">{row.salePriceDeltaPct > 0 ? "+" : ""}{row.salePriceDeltaPct}%</td>
                {row.cells.map(c => (
                  <td key={c.constructionDeltaPct} className={`py-1 ${c.marginOnCostPct == null ? "text-slate-300" : c.marginOnCostPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {c.marginOnCostPct != null ? c.marginOnCostPct.toFixed(1) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[11px] text-slate-400">
        Simplified IRR at these inputs: {irr != null ? `${irr.toFixed(1)}%` : "—"} &mdash; a single equity injection at the
        start and a single return at completion, not a dated cash-flow IRR. Finance cost assumes a progressively drawn
        loan averaging ~50% of peak debt. The full version adds a dated monthly cash flow, a real drawdown and
        capitalised-interest schedule, leveraged IRR, equity waterfall and an IC memo.
      </div>
    </div>
  );
}
