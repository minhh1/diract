"use client";

// The Finance Model's Feasibility subtab -- two parts:
//
// 1. A scoped-down PropDEV-style calculator (varloch.com.au/construction/
//    propdev) -- parametric inputs (dwellings/size/rates/percentages) drive
//    a cost breakdown and profit/margin/ROE/peak-debt/break-even/simplified-
//    IRR outputs (lib/feasibilityCalculator.ts), with saved named scenarios
//    and a "Sync to Budget Lines" action. Owner's equity/Return on Equity
//    leads the output grid -- a developer leverages the construction loan
//    and typically funds ~20% equity, so ROE (not raw profit) is the number
//    that actually tells you whether the deal is worth doing.
// 2. The itemised P&L (unchanged from the previous pass) computed straight
//    from the project's Budget Lines + Loans -- the calculator's "Sync to
//    Budget Lines" button, and the inline "Add budget line" affordance
//    further down, both feed this section automatically since it's just
//    reading the same Budget Lines everything else does.
//
// Scope cut, stated plainly: no monthly cash-flow draw schedule/graph, no
// PDF/CSV/shareable-link export, no trade-by-trade bill of quantities, no
// "scale recommender" heat map, no jurisdiction compliance alerts (e.g.
// NSW DBP Act) -- see the info panel at the bottom of the calculator
// section for the full list.
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Plus, X, TrendingUp } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import { calculateLoanSchedule, type LoanInterestRateEntry, type LoanPhaseInput } from "@/lib/loanCalculator";
import { calculateStampDuty, type AuState } from "@/lib/stampDuty";
import { calculateTitleFees } from "@/lib/titleFees";
import {
  GST_METHODS, type GstMethod, type FeasibilityInputs, type FeasibilityContext,
  calculateFeasibility, solveBreakEvenSalePricePerDwelling, solveMaxSupportableLandPrice,
  runScenarios, runSensitivity, simplifiedIRR,
} from "@/lib/feasibilityCalculator";
import { buildMonthlyCashFlow, simulateFacility, type TaskDatesRef, type TimingProfile } from "@/lib/cashFlowEngine";
import CashFlowPanel from "./CashFlowPanel";
import DebtSchedulePanel from "./DebtSchedulePanel";

interface BudgetLine {
  id: string;
  category: string | null;
  label: string | null;
  budgeted_amount: number | null;
  linked_task_id: string | null;
  timing_profile: TimingProfile | null;
  timing_start_date: string | null;
  timing_end_date: string | null;
}

interface TimelineTask {
  id: string;
  name: string;
  start_date: string | null;
  due_date: string | null;
}

interface Loan {
  id: string;
  name: string | null;
  principal_amount: number | null;
}

interface SavedScenario {
  id: string;
  name: string;
  sale_price_delta_pct: number | null;
  sale_price_override: number | null;
  construction_cost_delta_pct: number | null;
  notes: string | null;
}

const COST_CATEGORIES = ["Acquisition", "Construction", "Professional Fees", "Contingency", "Other"];
const CREDITABLE_CATEGORIES = ["Construction", "Professional Fees", "Contingency", "Other"];

const EMPTY_INPUTS: FeasibilityInputs = {
  dwellingsCount: null, avgDwellingSizeSqm: null, siteAreaSqm: null, expectedSalePricePerDwelling: null,
  constructionRatePerSqm: null, professionalFeesPct: null, contingencyPct: null, marketingSellingPct: null,
  otherAcquisitionCosts: null, holdingCostsAnnual: null, projectDurationMonths: null, interestRatePct: null,
  loanToCostPct: null, targetMarginPct: null, facilityLimit: null, facilityInterestRatePct: null, maxLvrPct: null,
};

const INPUT_FIELDS: { key: keyof FeasibilityInputs; label: string; suffix?: string }[][] = [
  [
    { key: "dwellingsCount", label: "Number of dwellings" },
    { key: "avgDwellingSizeSqm", label: "Avg dwelling size", suffix: "sqm" },
    { key: "siteAreaSqm", label: "Site area", suffix: "sqm" },
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
    { key: "loanToCostPct", label: "Loan to cost", suffix: "% (developers typically target ~80%)" },
    { key: "targetMarginPct", label: "Target margin on cost", suffix: "%" },
  ],
  // Construction facility -- drives the dated debt-drawdown simulation
  // (Debt Schedule panel below), separate from the "Loan to cost"
  // parametric estimate above.
  [
    { key: "facilityLimit", label: "Facility limit", suffix: "$" },
    { key: "facilityInterestRatePct", label: "Facility interest rate", suffix: "% p.a." },
    { key: "maxLvrPct", label: "Max LVR covenant", suffix: "% (flagged if breached, not enforced)" },
  ],
];

function Row({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "font-bold text-slate-800" : "text-slate-600"} ${indent ? "pl-4 text-[11px]" : "text-[12px]"}`}>
      <span>{label}</span>
      <span>{money(value)}</span>
    </div>
  );
}

function OutputCard({ label, value, big, tone }: { label: string; value: string; big?: boolean; tone?: "good" | "bad" }) {
  return (
    <div className={big ? "col-span-2" : ""}>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`${big ? "text-[26px]" : "text-[16px]"} font-bold ${tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-rose-600" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

export default function FeasibilitySubtab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [tasks, setTasks] = useState<TimelineTask[]>([]);
  const [totalInterest, setTotalInterest] = useState(0);
  const [totalLoanPrincipal, setTotalLoanPrincipal] = useState(0);
  const [gstMethod, setGstMethod] = useState<GstMethod | "">("");
  const [savingMethod, setSavingMethod] = useState(false);

  const [propertyState, setPropertyState] = useState<AuState | null>(null);
  const [purchasePrice, setPurchasePrice] = useState(0);

  const [inputs, setInputs] = useState<FeasibilityInputs>(EMPTY_INPUTS);
  const [inputsSaving, setInputsSaving] = useState(false);

  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [newScenario, setNewScenario] = useState({ name: "", salePriceDeltaPct: "", salePriceOverride: "", constructionCostDeltaPct: "" });
  const [savingScenario, setSavingScenario] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [showAddLine, setShowAddLine] = useState(false);
  const [newLine, setNewLine] = useState({ category: "Acquisition", label: "", budgetedAmount: "" });
  const [addingLine, setAddingLine] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [blRes, loansRes, settingsRes, overviewRes, inputsRes, scenariosRes, tasksRes] = await Promise.all([
        fetch(`/api/finance-model/budget-lines?projectId=${projectId}`),
        fetch(`/api/finance-model/loans?projectId=${projectId}`),
        fetch(`/api/finance-model/settings?projectId=${projectId}`),
        fetch(`/api/finance-model/overview?projectId=${projectId}`),
        fetch(`/api/finance-model/feasibility-inputs?projectId=${projectId}`),
        fetch(`/api/finance-model/feasibility-scenarios?projectId=${projectId}`),
        fetch(`/api/finance-model/tasks?projectId=${projectId}`),
      ]);
      const blJson = await blRes.json();
      const loansJson = await loansRes.json();
      const settingsJson = await settingsRes.json();
      const overviewJson = await overviewRes.json();
      const inputsJson = await inputsRes.json();
      const scenariosJson = await scenariosRes.json();
      const tasksJson = await tasksRes.json();
      if (!blRes.ok) { setError(blJson.error || "Failed to load"); return; }
      setBudgetLines(blJson.budgetLines || []);
      setTasks((tasksJson.tasks || []).map((t: any) => ({ id: t.id, name: t.name, start_date: t.start_date, due_date: t.due_date })));
      setGstMethod((settingsJson.gstMethod as GstMethod) || "");
      setPropertyState((overviewJson.property?.state as AuState) || null);
      setPurchasePrice(Number(overviewJson.property?.purchase_price) || 0);
      setInputs({ ...EMPTY_INPUTS, ...(inputsJson.inputs || {}) });
      setScenarios(scenariosJson.scenarios || []);

      const loans: Loan[] = loansJson.loans || [];
      setTotalLoanPrincipal(loans.reduce((s, l) => s + (l.principal_amount || 0), 0));

      const schedules = await Promise.all(loans.map(async loan => {
        const [phasesRes, ratesRes] = await Promise.all([
          fetch(`/api/finance-model/loan-phases?loanId=${loan.id}`),
          fetch(`/api/finance-model/loan-interest-rates?loanId=${loan.id}`),
        ]);
        const phasesJson = await phasesRes.json();
        const ratesJson = await ratesRes.json();
        const phases = (phasesJson.phases || []) as (LoanPhaseInput & { id: string })[];
        const rates = (ratesJson.rates || []) as LoanInterestRateEntry[];
        if (!loan.principal_amount || !phases.length) return 0;
        return calculateLoanSchedule(loan.principal_amount, phases, rates).totalInterest;
      }));
      setTotalInterest(schedules.reduce((s, n) => s + n, 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const changeGstMethod = async (value: GstMethod) => {
    setGstMethod(value);
    setSavingMethod(true);
    await fetch("/api/finance-model/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, gstMethod: value }),
    });
    setSavingMethod(false);
  };

  const saveInputs = async (next: FeasibilityInputs) => {
    setInputsSaving(true);
    await fetch("/api/finance-model/feasibility-inputs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...next }),
    });
    setInputsSaving(false);
  };

  const setField = (key: keyof FeasibilityInputs, value: string) => {
    setInputs(prev => ({ ...prev, [key]: value === "" ? null : Number(value) }));
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center"><Loader2 size={14} className="animate-spin" /> Loading...</div>;
  }
  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[13px] font-medium text-rose-600 mb-1">Couldn't load</p>
        <p className="text-[12px] text-slate-400 mb-4">{error}</p>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline"><RefreshCw size={11} /> Try again</button>
      </div>
    );
  }

  // -- Calculator (parametric inputs -> outputs) --------------------------
  let stampDuty = 0;
  if (propertyState && purchasePrice > 0) {
    try { stampDuty = calculateStampDuty(propertyState, purchasePrice); } catch { /* leave at 0 */ }
  }
  let titleFees: { transferFee: number; mortgageFee: number | null } | null = null;
  if (propertyState && purchasePrice > 0) {
    try { titleFees = calculateTitleFees(propertyState, purchasePrice, null); } catch { titleFees = null; }
  }
  const ctx: FeasibilityContext = { purchasePrice, stampDuty, titleFees, gstMethod: gstMethod || null };
  const result = calculateFeasibility(inputs, ctx);
  const irr = simplifiedIRR(result.requiredEquity, result.netProfit, inputs.projectDurationMonths ?? 0);
  const breakEven = solveBreakEvenSalePricePerDwelling(inputs, ctx);
  const maxLand = solveMaxSupportableLandPrice(inputs, ctx);
  const autoScenarios = runScenarios(inputs, ctx);
  const sensitivity = runSensitivity(inputs, ctx);

  const applyScenarioOverride = (s: { sale_price_delta_pct: number | null; sale_price_override: number | null; construction_cost_delta_pct: number | null }) => {
    const overriddenInputs: FeasibilityInputs = {
      ...inputs,
      expectedSalePricePerDwelling: s.sale_price_override != null
        ? s.sale_price_override
        : inputs.expectedSalePricePerDwelling != null && s.sale_price_delta_pct != null
          ? inputs.expectedSalePricePerDwelling * (1 + s.sale_price_delta_pct / 100)
          : inputs.expectedSalePricePerDwelling,
      constructionRatePerSqm: inputs.constructionRatePerSqm != null && s.construction_cost_delta_pct != null
        ? inputs.constructionRatePerSqm * (1 + s.construction_cost_delta_pct / 100)
        : inputs.constructionRatePerSqm,
    };
    return calculateFeasibility(overriddenInputs, ctx);
  };

  const addScenario = async () => {
    if (!newScenario.name.trim()) return;
    setSavingScenario(true);
    const res = await fetch("/api/finance-model/feasibility-scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId, name: newScenario.name,
        salePriceDeltaPct: newScenario.salePriceDeltaPct || null,
        salePriceOverride: newScenario.salePriceOverride || null,
        constructionCostDeltaPct: newScenario.constructionCostDeltaPct || null,
      }),
    });
    const json = await res.json();
    if (res.ok) {
      setScenarios(prev => [...prev, {
        id: json.id, name: newScenario.name,
        sale_price_delta_pct: newScenario.salePriceDeltaPct ? Number(newScenario.salePriceDeltaPct) : null,
        sale_price_override: newScenario.salePriceOverride ? Number(newScenario.salePriceOverride) : null,
        construction_cost_delta_pct: newScenario.constructionCostDeltaPct ? Number(newScenario.constructionCostDeltaPct) : null,
        notes: null,
      }]);
      setNewScenario({ name: "", salePriceDeltaPct: "", salePriceOverride: "", constructionCostDeltaPct: "" });
    }
    setSavingScenario(false);
  };

  const deleteScenario = async (id: string) => {
    setScenarios(prev => prev.filter(s => s.id !== id));
    await fetch(`/api/finance-model/feasibility-scenarios?id=${id}`, { method: "DELETE" });
  };

  const syncToBudgetLines = async () => {
    setSyncing(true);
    setSyncMessage(null);
    const lines: { category: string; label: string; amount: number }[] = [
      { category: "Acquisition", label: "Acquisition (feasibility calc)", amount: result.acquisition },
      { category: "Construction", label: "Construction (feasibility calc)", amount: result.construction },
      { category: "Professional Fees", label: "Professional fees (feasibility calc)", amount: result.professionalFees },
      { category: "Contingency", label: "Contingency (feasibility calc)", amount: result.contingency },
      { category: "Other", label: "Marketing & selling (feasibility calc)", amount: result.marketingSelling },
      { category: "Other", label: "Holding costs (feasibility calc)", amount: result.holding },
      { category: "Revenue", label: "Revenue (feasibility calc)", amount: result.revenue },
    ];
    for (const line of lines) {
      const existing = budgetLines.find(b => b.category === line.category && b.label === line.label);
      if (existing) {
        await fetch("/api/finance-model/budget-lines", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: existing.id, budgetedAmount: line.amount }),
        });
      } else {
        await fetch("/api/finance-model/budget-lines", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, category: line.category, label: line.label, budgetedAmount: line.amount }),
        });
      }
    }
    setSyncMessage("Synced to Budget Lines.");
    setSyncing(false);
    load();
  };

  const addBudgetLine = async () => {
    const amount = parseFloat(newLine.budgetedAmount);
    if (!newLine.label.trim() || !Number.isFinite(amount)) return;
    setAddingLine(true);
    await fetch("/api/finance-model/budget-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, category: newLine.category, label: newLine.label.trim(), budgetedAmount: amount }),
    });
    setNewLine({ category: "Acquisition", label: "", budgetedAmount: "" });
    setShowAddLine(false);
    setAddingLine(false);
    load();
  };

  // -- Cash flow (time-phases every budget line into the months it lands in) --
  const updateLineTiming = async (lineId: string, updates: { linkedTaskId?: string | null; timingProfile?: TimingProfile | null; timingStartDate?: string | null; timingEndDate?: string | null }) => {
    setBudgetLines(prev => prev.map(l => l.id === lineId ? {
      ...l,
      linked_task_id: updates.linkedTaskId !== undefined ? updates.linkedTaskId : l.linked_task_id,
      timing_profile: updates.timingProfile !== undefined ? updates.timingProfile : l.timing_profile,
      timing_start_date: updates.timingStartDate !== undefined ? updates.timingStartDate : l.timing_start_date,
      timing_end_date: updates.timingEndDate !== undefined ? updates.timingEndDate : l.timing_end_date,
    } : l));
    await fetch("/api/finance-model/budget-lines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: lineId, ...updates }),
    });
  };

  const tasksById = new Map<string, TaskDatesRef>(tasks.map(t => [t.id, { start_date: t.start_date, due_date: t.due_date }]));
  const cashFlowLines = budgetLines.map(l => ({
    id: l.id, category: l.category, label: l.label, budgetedAmount: l.budgeted_amount || 0,
    linkedTaskId: l.linked_task_id, timingProfile: l.timing_profile,
    timingStartDate: l.timing_start_date, timingEndDate: l.timing_end_date,
  }));
  const { rows: monthlyCashFlow, unresolvedLines } = buildMonthlyCashFlow(cashFlowLines, tasksById);

  const hasFacilityConfig = inputs.facilityLimit != null && inputs.facilityInterestRatePct != null;
  const facilitySimulation = simulateFacility(
    monthlyCashFlow,
    { limit: inputs.facilityLimit ?? 0, interestRatePct: inputs.facilityInterestRatePct ?? 0, maxLvrPct: inputs.maxLvrPct },
    result.revenue > 0 ? result.revenue : null,
  );

  // -- Existing itemised P&L (unchanged -- reads Budget Lines directly) ---
  const revenueTotal = budgetLines.filter(l => l.category === "Revenue").reduce((s, l) => s + (l.budgeted_amount || 0), 0);
  const acquisitionTotal = budgetLines.filter(l => l.category === "Acquisition").reduce((s, l) => s + (l.budgeted_amount || 0), 0);
  const creditableCostTotal = budgetLines.filter(l => l.category && CREDITABLE_CATEGORIES.includes(l.category)).reduce((s, l) => s + (l.budgeted_amount || 0), 0);
  const grossCostTotal = budgetLines.filter(l => l.category && COST_CATEGORIES.includes(l.category)).reduce((s, l) => s + (l.budgeted_amount || 0), 0);

  const pnlGstCollected = !gstMethod ? 0
    : gstMethod === "Margin Scheme" ? Math.max(0, revenueTotal - acquisitionTotal) / 11
    : gstMethod === "Standard (1/11th)" ? revenueTotal / 11
    : 0;
  const pnlGstInputCredits = creditableCostTotal / 11;

  const pnlNetIncome = revenueTotal - pnlGstCollected;
  const pnlNetCosts = grossCostTotal - pnlGstInputCredits;
  const pnlMarginBeforeInterest = pnlNetIncome - pnlNetCosts;
  const pnlProfitMargin = pnlMarginBeforeInterest - totalInterest;
  const pnlTotalDevelopmentCost = pnlNetCosts + totalInterest;
  const pnlMarginOnCostPct = pnlTotalDevelopmentCost > 0 ? (pnlProfitMargin / pnlTotalDevelopmentCost) * 100 : null;
  const pnlEquity = pnlTotalDevelopmentCost - totalLoanPrincipal;
  const pnlMarginOnEquityPct = pnlEquity > 0 ? (pnlProfitMargin / pnlEquity) * 100 : null;

  return (
    <div className="space-y-4">
      {/* ── Calculator ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-5">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Feasibility Calculator</p>
          <div className="flex items-center gap-2">
            {inputsSaving && <Loader2 size={12} className="animate-spin text-slate-300" />}
            <label className="text-[10px] text-slate-400">GST method</label>
            <select value={gstMethod} onChange={e => changeGstMethod(e.target.value as GstMethod)} disabled={savingMethod} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700">
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

        {/* Owner's equity leads -- the number that actually tells you if a leveraged deal is worth doing */}
        <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4">
          <OutputCard big label="Return on Equity" value={result.returnOnEquityPct != null ? `${result.returnOnEquityPct.toFixed(1)}%` : "—"} tone={result.returnOnEquityPct != null ? (result.returnOnEquityPct >= 0 ? "good" : "bad") : undefined} />
          <OutputCard big label="Required Equity" value={money(result.requiredEquity)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <OutputCard label="Verdict" value={result.feasible == null ? "— (set a target margin)" : result.feasible ? "Feasible" : "Not feasible"} tone={result.feasible == null ? undefined : result.feasible ? "good" : "bad"} />
          <OutputCard label="Net Profit" value={money(result.netProfit)} tone={result.netProfit >= 0 ? "good" : "bad"} />
          <OutputCard label="Margin on Cost" value={result.marginOnCostPct != null ? `${result.marginOnCostPct.toFixed(1)}%` : "—"} />
          <OutputCard label="Total Development Cost" value={money(result.totalDevelopmentCost)} />
          <OutputCard label="Gross Revenue" value={money(result.revenue)} />
          <OutputCard label="Peak Debt" value={money(result.peakDebt)} />
          <OutputCard label="Break-even Price / Dwelling" value={breakEven != null ? money(breakEven) : "—"} />
          <OutputCard label="Max Supportable Land Price" value={maxLand != null ? money(maxLand) : "— (not achievable at any price)"} />
          <OutputCard label="Simplified IRR" value={irr != null ? `${irr.toFixed(1)}%` : "—"} />
        </div>

        {/* Cost breakdown */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Cost Breakdown</p>
          <Row label="Acquisition (incl. stamp duty + title fees)" value={result.acquisition} indent />
          <Row label="Construction" value={result.construction} indent />
          <Row label="Professional Fees" value={result.professionalFees} indent />
          <Row label="Contingency" value={result.contingency} indent />
          <Row label="Marketing & Selling" value={result.marketingSelling} indent />
          <Row label="Holding Costs" value={result.holding} indent />
          <Row label="Finance Costs (interest, ~50% avg-balance approx.)" value={result.interest} indent />
          <Row label="Less: GST Input Tax Credits" value={-result.gstInputCredits} indent />
          <Row label="Total Development Cost" value={result.totalDevelopmentCost} bold />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={syncToBudgetLines} disabled={syncing} className="px-4 py-2 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40">
            {syncing ? "Syncing..." : "Sync to Budget Lines"}
          </button>
          {syncMessage && <p className="text-[11px] text-emerald-600">{syncMessage}</p>}
        </div>
      </div>

      {/* ── Cash flow (the foundation debt mechanics/returns build on) ── */}
      <CashFlowPanel
        budgetLines={cashFlowLines}
        tasks={tasks}
        monthlyRows={monthlyCashFlow}
        unresolvedLines={unresolvedLines}
        onUpdateLineTiming={updateLineTiming}
      />

      {/* ── Debt schedule (real drawdown/capitalized-interest simulation) ── */}
      <DebtSchedulePanel simulation={facilitySimulation} hasFacilityConfig={hasFacilityConfig} />

      {/* ── Scenario comparison ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 overflow-x-auto">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">Scenario Comparison</p>
        <table className="w-full text-[12px] min-w-[480px]">
          <thead>
            <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
              <th className="py-1"></th>
              {autoScenarios.map(s => <th key={s.label} className="py-1 text-right px-3">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><td className="py-1 text-slate-500">Net Profit</td>{autoScenarios.map(s => <td key={s.label} className="py-1 text-right px-3">{money(s.result.netProfit)}</td>)}</tr>
            <tr><td className="py-1 text-slate-500">Margin on Cost</td>{autoScenarios.map(s => <td key={s.label} className="py-1 text-right px-3">{s.result.marginOnCostPct != null ? `${s.result.marginOnCostPct.toFixed(1)}%` : "—"}</td>)}</tr>
            <tr><td className="py-1 text-slate-500">Return on Equity</td>{autoScenarios.map(s => <td key={s.label} className="py-1 text-right px-3">{s.result.returnOnEquityPct != null ? `${s.result.returnOnEquityPct.toFixed(1)}%` : "—"}</td>)}</tr>
          </tbody>
        </table>
      </div>

      {/* ── Sensitivity grid ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 overflow-x-auto">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Sensitivity -- Margin on Cost %</p>
        <p className="text-[10px] text-slate-400 mb-3">Rows: sale price change. Columns: construction cost change.</p>
        <table className="w-full text-[11px] min-w-[420px] text-center">
          <thead>
            <tr className="text-slate-400 text-[9px] font-bold">
              <th></th>
              {sensitivity[0].cells.map(c => <th key={c.constructionDeltaPct} className="py-1">{c.constructionDeltaPct > 0 ? "+" : ""}{c.constructionDeltaPct}%</th>)}
            </tr>
          </thead>
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

      {/* ── Saved scenarios ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Saved Scenarios</p>
        {scenarios.map(s => {
          const r = applyScenarioOverride(s);
          return (
            <div key={s.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-50 rounded-2xl">
              <div>
                <p className="text-[12px] font-bold text-slate-700">{s.name}</p>
                <p className="text-[10px] text-slate-400">
                  {s.sale_price_override != null ? `Sale price -> ${money(s.sale_price_override)}` : s.sale_price_delta_pct != null ? `Sale price ${s.sale_price_delta_pct > 0 ? "+" : ""}${s.sale_price_delta_pct}%` : ""}
                  {s.construction_cost_delta_pct != null ? ` · Construction ${s.construction_cost_delta_pct > 0 ? "+" : ""}${s.construction_cost_delta_pct}%` : ""}
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="text-slate-500">Net Profit: <span className="font-bold text-slate-800">{money(r.netProfit)}</span></span>
                <span className="text-slate-500">ROE: <span className="font-bold text-slate-800">{r.returnOnEquityPct != null ? `${r.returnOnEquityPct.toFixed(1)}%` : "—"}</span></span>
                <button onClick={() => deleteScenario(s.id)} className="text-slate-300 hover:text-rose-500"><X size={13} /></button>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-slate-100">
          <input placeholder="Scenario name" value={newScenario.name} onChange={e => setNewScenario(p => ({ ...p, name: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-40" />
          <input placeholder="Sale price change %" type="number" value={newScenario.salePriceDeltaPct} onChange={e => setNewScenario(p => ({ ...p, salePriceDeltaPct: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36" />
          <input placeholder="Or set sale price to $" type="number" value={newScenario.salePriceOverride} onChange={e => setNewScenario(p => ({ ...p, salePriceOverride: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36" />
          <input placeholder="Construction cost change %" type="number" value={newScenario.constructionCostDeltaPct} onChange={e => setNewScenario(p => ({ ...p, constructionCostDeltaPct: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36" />
          <button onClick={addScenario} disabled={savingScenario || !newScenario.name.trim()} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">
            <Plus size={12} /> Add scenario
          </button>
        </div>
      </div>

      {/* ── Itemised P&L (unchanged, reads Budget Lines) ── */}
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Itemised Profit & Loss (from Budget Lines)</p>
          <button onClick={() => setShowAddLine(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
            <Plus size={12} /> Add budget line
          </button>
        </div>

        {showAddLine && (
          <div className="flex flex-wrap items-end gap-2 pb-3 mb-2 border-b border-slate-100">
            <select value={newLine.category} onChange={e => setNewLine(p => ({ ...p, category: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white">
              {["Acquisition", "Construction", "Professional Fees", "Finance Costs", "Contingency", "Revenue", "Other"].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input placeholder="Label" value={newLine.label} onChange={e => setNewLine(p => ({ ...p, label: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-40" />
            <input placeholder="Amount" type="number" value={newLine.budgetedAmount} onChange={e => setNewLine(p => ({ ...p, budgetedAmount: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-32" />
            <button onClick={addBudgetLine} disabled={addingLine} className="px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-full disabled:opacity-40">{addingLine ? "Adding..." : "Add"}</button>
          </div>
        )}

        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2">Income</p>
        <Row label="Gross Sale Price (Revenue budget lines)" value={revenueTotal} indent />
        <Row label="Less: GST Collected" value={-pnlGstCollected} indent />
        <Row label="Net Income" value={pnlNetIncome} bold />

        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-3">Development Costs</p>
        {COST_CATEGORIES.map(cat => {
          const total = budgetLines.filter(l => l.category === cat).reduce((s, l) => s + (l.budgeted_amount || 0), 0);
          return total > 0 ? <Row key={cat} label={cat} value={total} indent /> : null;
        })}
        <Row label="Less: GST Input Tax Credits" value={-pnlGstInputCredits} indent />
        <Row label="Net Costs" value={pnlNetCosts} bold />

        <div className="border-t border-slate-200 mt-2 pt-2">
          <Row label="Margin Before Interest" value={pnlMarginBeforeInterest} bold />
          <Row label="Less: Finance Costs (loan interest)" value={-totalInterest} indent />
          <Row label="Profit Margin" value={pnlProfitMargin} bold />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Development Cost</p>
          <p className="text-[18px] font-bold text-slate-800">{money(pnlTotalDevelopmentCost)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Margin on Development Cost</p>
          <p className="text-[18px] font-bold text-slate-800">{pnlMarginOnCostPct != null ? `${pnlMarginOnCostPct.toFixed(2)}%` : "—"}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Equity (Total Dev. Cost − Loan Principal)</p>
          <p className="text-[18px] font-bold text-slate-800">{money(pnlEquity)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Margin on Equity</p>
          <p className="text-[18px] font-bold text-slate-800">{pnlMarginOnEquityPct != null ? `${pnlMarginOnEquityPct.toFixed(2)}%` : "—"}</p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[11px] text-slate-400 flex items-start gap-2">
        <TrendingUp size={13} className="mt-0.5 shrink-0" />
        <span>
          The calculator above is a scoped-down PropDEV-style tool -- deliberately not the full commercial version: no monthly cash-flow draw schedule/graph, no PDF/CSV/shareable-link export, no trade-by-trade bill of quantities, no &quot;scale recommender&quot; heat map, and no jurisdiction-specific compliance alerts (e.g. NSW DBP Act). Finance cost assumes a construction loan drawn progressively to peak debt (average balance ≈ 50% of peak) -- not a full monthly amortisation schedule. Simplified IRR assumes a single equity injection at the start and a single return at completion, not a dated cash-flow IRR.
          <br /><br />
          The itemised P&L below reads Budget Lines directly (GST Input Tax Credits assume Construction/Professional Fees/Contingency/Other lines are GST-inclusive; Acquisition and Finance Costs are excluded) -- use &quot;Sync to Budget Lines&quot; above, or &quot;Add budget line&quot; here, to keep the two in step.
        </span>
      </div>
    </div>
  );
}
