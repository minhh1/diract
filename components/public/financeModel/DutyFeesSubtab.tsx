"use client";

// The Finance Model's Duty & Fees subtab -- a transparent, working-shown
// stamp duty + title/mortgage registration fee calculator (see
// lib/stampDuty.ts / lib/titleFees.ts), with an "Add to budget" action
// that writes each figure as its own Acquisition budget line via the
// existing budget-lines route -- that's the "link the number back to the
// other tabs" part: once added, it shows up in Overview's Budget vs
// Actual and the Feasibility subtab's totals automatically, no extra
// plumbing.
import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Landmark, Plus, Info } from "lucide-react";
import { calculateStampDuty, explainStampDuty, AU_STATES, STAMP_DUTY_RATES_UPDATED_AT, type AuState } from "@/lib/stampDuty";
import { calculateTitleFees, TITLE_FEES_UPDATED_AT } from "@/lib/titleFees";
import { money } from "./BudgetVsActualTable";

interface PropertyInfo {
  street_address: string;
  state: string | null;
  purchase_price: number | null;
}

interface Loan {
  id: string;
  principal_amount: number | null;
}

export default function DutyFeesSubtab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [hasLoan, setHasLoan] = useState(false);

  const [state, setState] = useState<AuState | "">("");
  const [price, setPrice] = useState("");
  const [addingDuty, setAddingDuty] = useState(false);
  const [addingTransfer, setAddingTransfer] = useState(false);
  const [addingMortgage, setAddingMortgage] = useState(false);
  const [addedDuty, setAddedDuty] = useState(false);
  const [addedTransfer, setAddedTransfer] = useState(false);
  const [addedMortgage, setAddedMortgage] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, loansRes] = await Promise.all([
        fetch(`/api/finance-model/overview?projectId=${projectId}`),
        fetch(`/api/finance-model/loans?projectId=${projectId}`),
      ]);
      const overviewJson = await overviewRes.json();
      const loansJson = await loansRes.json();
      if (!overviewRes.ok) { setError(overviewJson.error || "Failed to load"); return; }
      setProperty(overviewJson.property || null);
      setHasLoan(((loansJson.loans || []) as Loan[]).some(l => (l.principal_amount ?? 0) > 0));
      if (overviewJson.property?.state) setState(overviewJson.property.state as AuState);
      if (overviewJson.property?.purchase_price) setPrice(String(overviewJson.property.purchase_price));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const priceNum = parseFloat(price);
  const validInputs = !!state && Number.isFinite(priceNum) && priceNum > 0;

  let dutyResult: { duty: number; explanation: string } | null = null;
  let dutyError: string | null = null;
  if (validInputs) {
    try { dutyResult = explainStampDuty(state as AuState, priceNum); }
    catch (err) { dutyError = err instanceof Error ? err.message : "Failed to calculate"; }
  }

  let feesResult: { transferFee: number; mortgageFee: number | null } | null = null;
  let feesError: string | null = null;
  if (validInputs) {
    try { feesResult = calculateTitleFees(state as AuState, priceNum, hasLoan ? 1 : null); }
    catch (err) { feesError = err instanceof Error ? err.message : "Failed to calculate"; }
  }

  const total = (dutyResult?.duty ?? 0) + (feesResult?.transferFee ?? 0) + (feesResult?.mortgageFee ?? 0);

  const addBudgetLine = async (label: string, amount: number) => {
    await fetch("/api/finance-model/budget-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, category: "Acquisition", label, budgetedAmount: amount }),
    });
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-slate-400">{property?.street_address || "Duty & Fees"}</p>
        <div className="flex items-center gap-3 text-[10px] text-slate-400">
          <span>Stamp duty rates verified: {STAMP_DUTY_RATES_UPDATED_AT}</span>
          <span>·</span>
          <span>Title fees verified: {TITLE_FEES_UPDATED_AT}</span>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">State</label>
            <select value={state} onChange={e => setState(e.target.value as AuState)} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              <option value="">Select...</option>
              {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Purchase price</label>
            <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36" />
          </div>
        </div>

        {!validInputs && <p className="text-[12px] text-slate-400">Select a state and enter a purchase price to see the working.</p>}

        {validInputs && (
          <div className="space-y-3">
            {/* Stamp duty */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Stamp (Transfer) Duty</p>
                {dutyResult && (
                  <button
                    onClick={async () => { setAddingDuty(true); await addBudgetLine(`Stamp duty (${state})`, dutyResult!.duty); setAddingDuty(false); setAddedDuty(true); }}
                    disabled={addingDuty || addedDuty}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40"
                  >
                    {addingDuty ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} {addedDuty ? "Added" : "Add to budget"}
                  </button>
                )}
              </div>
              {dutyError ? (
                <p className="text-[12px] text-amber-600 flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0" /> {dutyError}</p>
              ) : dutyResult && (
                <>
                  <p className="text-[18px] font-bold text-slate-800">{money(dutyResult.duty)}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{dutyResult.explanation}</p>
                </>
              )}
            </div>

            {/* Title transfer fee */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Title Transfer Fee</p>
                {feesResult && (
                  <button
                    onClick={async () => { setAddingTransfer(true); await addBudgetLine(`Title transfer fee (${state})`, feesResult!.transferFee); setAddingTransfer(false); setAddedTransfer(true); }}
                    disabled={addingTransfer || addedTransfer}
                    className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40"
                  >
                    {addingTransfer ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} {addedTransfer ? "Added" : "Add to budget"}
                  </button>
                )}
              </div>
              {feesError ? (
                <p className="text-[12px] text-amber-600 flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0" /> {feesError}</p>
              ) : feesResult && (
                <p className="text-[18px] font-bold text-slate-800">{money(feesResult.transferFee)}</p>
              )}
            </div>

            {/* Mortgage registration fee */}
            {feesResult && (
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Mortgage Registration Fee</p>
                  {feesResult.mortgageFee != null && (
                    <button
                      onClick={async () => { setAddingMortgage(true); await addBudgetLine(`Mortgage registration fee (${state})`, feesResult!.mortgageFee!); setAddingMortgage(false); setAddedMortgage(true); }}
                      disabled={addingMortgage || addedMortgage}
                      className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40"
                    >
                      {addingMortgage ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} {addedMortgage ? "Added" : "Add to budget"}
                    </button>
                  )}
                </div>
                <p className="text-[18px] font-bold text-slate-800">
                  {feesResult.mortgageFee != null ? money(feesResult.mortgageFee) : (hasLoan ? "—" : "N/A — no loan recorded for this project")}
                </p>
              </div>
            )}

            <div className="border-t border-slate-200 pt-3 flex items-center justify-between">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total</p>
              <p className="text-[20px] font-bold text-indigo-600">{money(total)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-[11px] text-slate-400 flex items-start gap-2">
        <Landmark size={13} className="mt-0.5 shrink-0" />
        <span>General rates only -- first-home-buyer concessions and foreign/absentee-owner surcharges aren't calculated here. Treat these as a starting point; each "Add to budget" line is a normal, editable budget line afterward.</span>
      </div>
    </div>
  );
}
