"use client";

// Residual Land Value Solver -- "what is the most I can pay for this site
// and still hit my target margin?" (lib/residualLandValue.ts, which
// re-derives stamp duty/title fees at every candidate price rather than
// holding them fixed). Two call sites, same "one rendering, two call
// sites" pattern as PublicFinanceModelContent:
//   1. components/dashboard/tabs/ResidualLandSolverTab.tsx (projectId
//      set, authenticated) -- prefills from, and saves back to, the SAME
//      feasibility-inputs row the Finance Model's Feasibility subtab uses,
//      so the two never disagree about assumptions. State prefills from
//      the linked property; GST method from the project's Finance Model
//      settings.
//   2. app/public/residual-land-solver/page.tsx (no projectId, GENUINELY
//      UNAUTHENTICATED) -- a pure client-side calculator: nothing is
//      fetched and nothing is saved, which is exactly why it needs no
//      access-code gate (unlike /public/finance-model/[pageId], which
//      exposes real project data).
import { useEffect, useState } from "react";
import { Loader2, Landmark } from "lucide-react";
import { money } from "./financeModel/BudgetVsActualTable";
import { GST_METHODS, type GstMethod, type FeasibilityInputs } from "@/lib/feasibilityCalculator";
import { AU_STATES, explainStampDuty, type AuState } from "@/lib/stampDuty";
import {
  solveResidualLandValue, runResidualLandGrid, GRID_SALE_PRICE_DELTAS,
} from "@/lib/residualLandValue";

const EMPTY_INPUTS: FeasibilityInputs = {
  dwellingsCount: null, avgDwellingSizeSqm: null, siteAreaSqm: null, expectedSalePricePerDwelling: null,
  constructionRatePerSqm: null, professionalFeesPct: null, contingencyPct: null, marketingSellingPct: null,
  otherAcquisitionCosts: null, holdingCostsAnnual: null, projectDurationMonths: null, interestRatePct: null,
  loanToCostPct: null, targetMarginPct: null, facilityLimit: null, facilityInterestRatePct: null, maxLvrPct: null,
  preferredReturnPct: null, promotePct: null,
};

// Only the fields the solver actually reads -- the facility/waterfall
// fields in FeasibilityInputs exist for other panels and aren't shown or
// saved here.
const INPUT_FIELDS: { key: keyof FeasibilityInputs; label: string; suffix?: string }[][] = [
  [
    { key: "dwellingsCount", label: "Number of dwellings" },
    { key: "avgDwellingSizeSqm", label: "Avg dwelling size", suffix: "sqm" },
    { key: "expectedSalePricePerDwelling", label: "Expected sale price / dwelling", suffix: "$" },
    { key: "projectDurationMonths", label: "Project duration", suffix: "months" },
  ],
  [
    { key: "constructionRatePerSqm", label: "Construction rate", suffix: "$/sqm" },
    { key: "professionalFeesPct", label: "Professional fees", suffix: "% of construction" },
    { key: "contingencyPct", label: "Contingency", suffix: "% of construction" },
    { key: "marketingSellingPct", label: "Marketing & selling", suffix: "% of revenue" },
    { key: "otherAcquisitionCosts", label: "Other acquisition costs", suffix: "$" },
    { key: "holdingCostsAnnual", label: "Holding costs", suffix: "$/year" },
  ],
  [
    { key: "interestRatePct", label: "Interest rate", suffix: "% p.a." },
    { key: "loanToCostPct", label: "Loan to cost", suffix: "%" },
    { key: "targetMarginPct", label: "Target margin on cost", suffix: "%" },
  ],
];

function Row({ label, value, bold, indent }: { label: string; value: string; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "font-bold text-slate-800" : "text-slate-600"} ${indent ? "pl-4 text-[11px]" : "text-[12px]"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

export default function ResidualLandSolverContent({ projectId }: { projectId?: string }) {
  const [loading, setLoading] = useState(!!projectId);
  const [inputs, setInputs] = useState<FeasibilityInputs>(EMPTY_INPUTS);
  const [state, setState] = useState<AuState | "">("");
  const [gstMethod, setGstMethod] = useState<GstMethod | "">("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      try {
        const [inputsRes, overviewRes, settingsRes] = await Promise.all([
          fetch(`/api/finance-model/feasibility-inputs?projectId=${projectId}`),
          fetch(`/api/finance-model/overview?projectId=${projectId}`),
          fetch(`/api/finance-model/settings?projectId=${projectId}`),
        ]);
        const inputsJson = await inputsRes.json();
        const overviewJson = await overviewRes.json();
        const settingsJson = await settingsRes.json();
        if (cancelled) return;
        setInputs({ ...EMPTY_INPUTS, ...(inputsJson.inputs || {}) });
        setState((overviewJson.property?.state as AuState) || "");
        setGstMethod((settingsJson.gstMethod as GstMethod) || "");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // Shared-assumptions contract: edits here land in the same
  // feasibility-inputs row the Feasibility subtab reads. Public mode
  // (no projectId) never persists anything.
  const saveInputs = async (next: FeasibilityInputs) => {
    if (!projectId) return;
    setSaving(true);
    await fetch("/api/finance-model/feasibility-inputs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...next }),
    });
    setSaving(false);
  };

  const changeGstMethod = async (value: GstMethod) => {
    setGstMethod(value);
    if (!projectId) return;
    await fetch("/api/finance-model/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, gstMethod: value }),
    });
  };

  const setField = (key: keyof FeasibilityInputs, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value === "" ? null : Number(value) }));
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center"><Loader2 size={14} className="animate-spin" /> Loading...</div>;
  }

  const solved = solveResidualLandValue(inputs, state || null, gstMethod || null);
  const grid = runResidualLandGrid(inputs, state || null, gstMethod || null);
  const dutyWorking = solved && state ? explainStampDuty(state, solved.landPrice) : null;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Residual Land Value Solver</p>
          {saving && <Loader2 size={12} className="animate-spin text-slate-300" />}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-[9px] text-slate-400 mb-1 block">State (drives stamp duty & title fees{projectId ? "; prefilled from the linked property" : ""})</label>
            <select value={state} onChange={e => setState(e.target.value as AuState | "")} className="w-full text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              <option value="">Select...</option>
              {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] text-slate-400 mb-1 block">GST method</label>
            <select value={gstMethod} onChange={e => changeGstMethod(e.target.value as GstMethod)} className="w-full text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              <option value="">Select...</option>
              {GST_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        {INPUT_FIELDS.map((group, gi) => (
          <div key={gi} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {group.map(f => (
              <div key={f.key}>
                <label className="text-[9px] text-slate-400 mb-1 block">{f.label}{f.suffix ? ` (${f.suffix})` : ""}</label>
                <input
                  type="number"
                  value={inputs[f.key] ?? ""}
                  onChange={e => setField(f.key, e.target.value)}
                  onBlur={() => saveInputs(inputs)}
                  placeholder="—"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-[12px] outline-none focus:border-indigo-400 bg-white"
                />
              </div>
            ))}
          </div>
        ))}

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Residual Land Value (max site bid at target margin)</p>
          <p className={`text-[26px] font-bold ${solved ? "text-emerald-600" : "text-slate-300"}`}>
            {solved ? money(solved.landPrice) : inputs.targetMarginPct == null ? "— set a target margin" : "— not achievable at any price"}
          </p>
        </div>

        {solved && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">At That Price</p>
            <Row label="Land price" value={money(solved.landPrice)} indent />
            <Row label="Stamp duty (re-derived at the solved price)" value={money(solved.stampDuty)} indent />
            <Row label="Title transfer fee" value={solved.titleTransferFee != null ? money(solved.titleTransferFee) : state ? "— unverified for this state, enter manually" : "—"} indent />
            <Row label="Other acquisition costs" value={money(inputs.otherAcquisitionCosts ?? 0)} indent />
            <Row label="Total acquisition" value={money(solved.result.acquisition)} bold />
            <Row label="Total development cost" value={money(solved.result.totalDevelopmentCost)} indent />
            <Row label="Net profit" value={money(solved.result.netProfit)} indent />
            <Row label="Margin on cost" value={solved.result.marginOnCostPct != null ? `${solved.result.marginOnCostPct.toFixed(1)}%` : "—"} indent />
            <Row label="Required equity" value={money(solved.result.requiredEquity)} indent />
            <Row label="Return on equity" value={solved.result.returnOnEquityPct != null ? `${solved.result.returnOnEquityPct.toFixed(1)}%` : "—"} indent />
            {dutyWorking && <p className="text-[10px] text-slate-400 mt-2">{dutyWorking.explanation}</p>}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 overflow-x-auto">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Residual Land Value Grid</p>
        <p className="text-[10px] text-slate-400 mb-3">Rows: target margin on cost. Columns: sale price change. Each cell is the max supportable land price for that combination.</p>
        <table className="w-full text-[11px] min-w-[480px] text-center">
          <thead>
            <tr className="text-slate-400 text-[9px] font-bold">
              <th></th>
              {GRID_SALE_PRICE_DELTAS.map(d => <th key={d} className="py-1">{d > 0 ? "+" : ""}{d}%</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map(row => (
              <tr key={row.targetMarginPct} className={row.targetMarginPct === inputs.targetMarginPct ? "bg-indigo-50/50" : ""}>
                <td className="text-slate-400 font-bold pr-2 whitespace-nowrap">{row.targetMarginPct}%</td>
                {row.cells.map(c => (
                  <td key={c.salePriceDeltaPct} className={`py-1 ${c.landPrice == null ? "text-slate-300" : "text-slate-700"}`}>
                    {c.landPrice != null ? money(c.landPrice) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[11px] text-slate-400 flex items-start gap-2">
        <Landmark size={13} className="mt-0.5 shrink-0" />
        <span>
          Solved by bisection with stamp duty and title fees re-derived at every candidate price (the land-price → duty → cost → margin circularity is resolved, not approximated). Finance cost still uses the standard feasibility shorthand -- a progressively-drawn loan&apos;s average balance ≈ 50% of peak debt -- not a dated monthly drawdown schedule. Duty rates are general (non-PPR, no concessions or foreign surcharges); treat the result as a bid ceiling to test, not a quote.
          {projectId ? " Assumptions are shared with the Finance Model's Feasibility subtab -- editing them here updates there, and vice versa." : ""}
        </span>
      </div>
    </div>
  );
}
