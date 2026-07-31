"use client";

// The Finance Model's Feasibility subtab -- a Feastudy-style itemised P&L
// computed entirely from the project's existing Budget Lines and Loans
// (no separate data entry -- see the shell's plan doc for why). GST
// treatment follows the selected method (lib/financeModel's Finance Model
// Settings custom table):
//   Margin Scheme: GST Collected = (Gross Sale Price - Acquisition costs) / 11
//   Standard (1/11th): GST Collected = Gross Sale Price / 11
//   GST-free: GST Collected = $0
// GST Input Tax Credits are claimed on GST-inclusive cost invoices --
// Construction/Professional Fees/Contingency/Other, NOT Acquisition (a
// margin-scheme land purchase typically carries no claimable input credit
// for the purchaser) and NOT Finance Costs (interest is input-taxed, no
// GST). This mirrors the real worked example provided (NKD Project One
// Duo's itemised P&L): Total Development Cost = (gross costs - input
// credits) + interest, and Margin on Development Cost = Profit Margin /
// Total Development Cost, both reproduce that document's own arithmetic
// exactly when the same inputs are used.
//
// Scope cut, stated plainly in the UI: no Peak Level of Debt or true IRR
// here -- both need a full dated cash-flow schedule across the project
// timeline, a bigger follow-on piece. Margin on Equity is a simpler
// point-in-time approximation (Equity = Total Development Cost - total
// loan principal), not a real return-on-equity-over-time calculation.
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Info } from "lucide-react";
import { money } from "./BudgetVsActualTable";
import { calculateLoanSchedule, type LoanInterestRateEntry, type LoanPhaseInput } from "@/lib/loanCalculator";

const GST_METHODS = ["Margin Scheme", "Standard (1/11th)", "GST-free"] as const;
type GstMethod = (typeof GST_METHODS)[number];

interface BudgetLine {
  id: string;
  category: string | null;
  label: string | null;
  budgeted_amount: number | null;
}

interface Loan {
  id: string;
  name: string | null;
  principal_amount: number | null;
}

const COST_CATEGORIES = ["Acquisition", "Construction", "Professional Fees", "Contingency", "Other"];
const CREDITABLE_CATEGORIES = ["Construction", "Professional Fees", "Contingency", "Other"];

export default function FeasibilitySubtab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [totalInterest, setTotalInterest] = useState(0);
  const [totalLoanPrincipal, setTotalLoanPrincipal] = useState(0);
  const [gstMethod, setGstMethod] = useState<GstMethod | "">("");
  const [savingMethod, setSavingMethod] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [blRes, loansRes, settingsRes] = await Promise.all([
        fetch(`/api/finance-model/budget-lines?projectId=${projectId}`),
        fetch(`/api/finance-model/loans?projectId=${projectId}`),
        fetch(`/api/finance-model/settings?projectId=${projectId}`),
      ]);
      const blJson = await blRes.json();
      const loansJson = await loansRes.json();
      const settingsJson = await settingsRes.json();
      if (!blRes.ok) { setError(blJson.error || "Failed to load"); return; }
      setBudgetLines(blJson.budgetLines || []);
      setGstMethod((settingsJson.gstMethod as GstMethod) || "");

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

  const revenueTotal = budgetLines.filter(l => l.category === "Revenue").reduce((s, l) => s + (l.budgeted_amount || 0), 0);
  const acquisitionTotal = budgetLines.filter(l => l.category === "Acquisition").reduce((s, l) => s + (l.budgeted_amount || 0), 0);
  const creditableCostTotal = budgetLines.filter(l => l.category && CREDITABLE_CATEGORIES.includes(l.category)).reduce((s, l) => s + (l.budgeted_amount || 0), 0);
  const grossCostTotal = budgetLines.filter(l => l.category && COST_CATEGORIES.includes(l.category)).reduce((s, l) => s + (l.budgeted_amount || 0), 0);

  const gstCollected = !gstMethod ? 0
    : gstMethod === "Margin Scheme" ? Math.max(0, revenueTotal - acquisitionTotal) / 11
    : gstMethod === "Standard (1/11th)" ? revenueTotal / 11
    : 0;
  const gstInputCredits = creditableCostTotal / 11;

  const netIncome = revenueTotal - gstCollected;
  const netCosts = grossCostTotal - gstInputCredits;
  const marginBeforeInterest = netIncome - netCosts;
  const profitMargin = marginBeforeInterest - totalInterest;
  const totalDevelopmentCost = netCosts + totalInterest;
  const marginOnCostPct = totalDevelopmentCost > 0 ? (profitMargin / totalDevelopmentCost) * 100 : null;
  const equity = totalDevelopmentCost - totalLoanPrincipal;
  const marginOnEquityPct = equity > 0 ? (profitMargin / equity) * 100 : null;

  const Row = ({ label, value, bold, indent }: { label: string; value: number; bold?: boolean; indent?: boolean }) => (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "font-bold text-slate-800" : "text-slate-600"} ${indent ? "pl-4 text-[11px]" : "text-[12px]"}`}>
      <span>{label}</span>
      <span>{money(value)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Itemised Profit & Loss</p>
          <div className="flex items-center gap-2">
            <label className="text-[10px] text-slate-400">GST method</label>
            <select value={gstMethod} onChange={e => changeGstMethod(e.target.value as GstMethod)} disabled={savingMethod} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700">
              <option value="">Select...</option>
              {GST_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-2">Income</p>
        <Row label="Gross Sale Price (Revenue budget lines)" value={revenueTotal} indent />
        <Row label="Less: GST Collected" value={-gstCollected} indent />
        <Row label="Net Income" value={netIncome} bold />

        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pt-3">Development Costs</p>
        {COST_CATEGORIES.map(cat => {
          const total = budgetLines.filter(l => l.category === cat).reduce((s, l) => s + (l.budgeted_amount || 0), 0);
          return total > 0 ? <Row key={cat} label={cat} value={total} indent /> : null;
        })}
        <Row label="Less: GST Input Tax Credits" value={-gstInputCredits} indent />
        <Row label="Net Costs" value={netCosts} bold />

        <div className="border-t border-slate-200 mt-2 pt-2">
          <Row label="Margin Before Interest" value={marginBeforeInterest} bold />
          <Row label="Less: Finance Costs (loan interest)" value={-totalInterest} indent />
          <Row label="Profit Margin" value={profitMargin} bold />
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Development Cost</p>
          <p className="text-[18px] font-bold text-slate-800">{money(totalDevelopmentCost)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Margin on Development Cost</p>
          <p className="text-[18px] font-bold text-slate-800">{marginOnCostPct != null ? `${marginOnCostPct.toFixed(2)}%` : "—"}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Equity (Total Dev. Cost − Loan Principal)</p>
          <p className="text-[18px] font-bold text-slate-800">{money(equity)}</p>
        </div>
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Margin on Equity</p>
          <p className="text-[18px] font-bold text-slate-800">{marginOnEquityPct != null ? `${marginOnEquityPct.toFixed(2)}%` : "—"}</p>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[11px] text-slate-400 flex items-start gap-2">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          GST Input Tax Credits assume Construction/Professional Fees/Contingency/Other budget lines are GST-inclusive (Acquisition and Finance Costs are excluded -- a margin-scheme land purchase typically carries no claimable input credit, and interest is input-taxed).
          Margin on Equity is a point-in-time approximation, not a true return over time -- and there's no Peak Level of Debt or IRR here yet, both need a full dated cash-flow schedule.
        </span>
      </div>
    </div>
  );
}
