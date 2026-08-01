"use client";

// The Finance Model's Loans subtab -- senior/mezzanine/money-partner
// loans against a project, each with a dated interest-rate history and an
// ordered sequence of repayment-type phases (e.g. 5 years Interest Only,
// then Amortizing) -- see lib/loanCalculator.ts for how those two combine
// into a repayment schedule. Borrower/guarantor pickers reuse
// components/dashboard/RelationPicker.tsx (the same generic entity-search
// component used everywhere else in the app) rather than a bespoke search
// box.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X, ChevronRight, Trash2, RefreshCw, Check, Unlink, Split, Search, Archive, RotateCcw, Pencil } from "lucide-react";
import RelationPicker from "@/components/dashboard/RelationPicker";
import { money } from "./BudgetVsActualTable";
import { calculateLoanSchedule, type LoanInterestRateEntry, type LoanPhaseInput } from "@/lib/loanCalculator";

const LENDER_TYPES = ["Senior", "Mezzanine", "Private Lender", "Money Partner", "Other"];
const REPAYMENT_PERIODS = ["Monthly", "Six-Monthly", "At End of Term"];
const REPAYMENT_TYPES = ["Interest Only", "Amortizing"] as const;
const FREQUENCIES = ["Monthly", "Quarterly", "Six-Monthly", "Annually", "At Maturity"];

interface Loan {
  id: string;
  name: string | null;
  lender_type: string | null;
  lender: string | null;
  borrower: string | null;
  guarantors: string[] | null;
  principal_amount: number | null;
  start_date: string | null;
  repayment_date: string | null;
  repayment_period: string | null;
  extension_right: boolean | null;
  extension_terms: string | null;
  early_repayment_allowed: boolean | null;
  early_repayment_terms: string | null;
  security: string | null;
  notes: string | null;
  is_discharged: boolean | null;
  // Attached by the GET route for the requesting project specifically --
  // see app/api/finance-model/loans/route.ts's header comment.
  allocation_percent: number;
  allocated_principal_amount: number;
  is_split: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

interface AllocationRow { id: string | null; projectId: string; projectName: string; splitPercent: number; }

// Lets one loan be shared across more than one project, either split
// equally (recomputed live as projects are added/removed) or by any
// custom proportion (typed per row) -- "equal" isn't a persisted mode,
// it's just what "Split equally" writes; adding a project only
// re-equalizes if the CURRENT set already looks equal, so a deliberate
// custom split is never silently overwritten by an add.
function LoanSplitEditor({ loan, projectId, onChanged }: { loan: Loan; projectId: string; onChanged: () => void }) {
  const [rows, setRows] = useState<AllocationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/finance-model/loan-allocations?loanId=${loan.id}`);
    const json = await res.json();
    setRows((json.allocations || []).map((a: any) => ({ id: a.id, projectId: a.projectId, projectName: a.projectName, splitPercent: a.splitPercent })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [loan.id]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await fetch(`/api/projects/search?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      const existingIds = new Set(rows.map(r => r.projectId));
      setResults((json.projects || []).filter((p: any) => !existingIds.has(p.id)));
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, rows]);

  const isRoughlyEqual = (list: AllocationRow[]) => list.length > 0 && list.every(r => Math.abs(r.splitPercent - 100 / list.length) < 0.05);
  const equalize = (list: AllocationRow[]) => list.map(r => ({ ...r, splitPercent: 100 / list.length }));

  const addProject = (p: { id: string; name: string }) => {
    setRows(prev => {
      const wasEqual = isRoughlyEqual(prev);
      const next = [...prev, { id: null, projectId: p.id, projectName: p.name, splitPercent: 0 }];
      return wasEqual ? equalize(next) : next;
    });
    setQuery("");
    setResults([]);
    setShowSearch(false);
  };

  const removeProject = (pid: string) => setRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.projectId !== pid)));
  const updatePercent = (pid: string, value: number) => setRows(prev => prev.map(r => (r.projectId === pid ? { ...r, splitPercent: value } : r)));

  const save = async () => {
    setSaving(true);
    await fetch("/api/finance-model/loan-allocations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loanId: loan.id, allocations: rows.map(r => ({ projectId: r.projectId, splitPercent: r.splitPercent })) }),
    });
    setSaving(false);
    await load();
    onChanged();
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-[11px] text-slate-400 py-3"><Loader2 size={12} className="animate-spin" /> Loading split...</div>;
  }

  const total = rows.reduce((s, r) => s + r.splitPercent, 0);
  const withinTolerance = Math.abs(total - 100) < 0.05;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Split size={11} /> Split across projects</p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setRows(prev => equalize(prev))} disabled={rows.length < 2} className="text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-30 disabled:no-underline">
            Split equally
          </button>
          <button type="button" onClick={() => setShowSearch(v => !v)} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"><Plus size={11} /> Add project</button>
        </div>
      </div>

      {showSearch && (
        <div className="relative">
          <Search size={11} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects..." autoFocus
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400"
          />
          {(searching || results.length > 0) && (
            <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-lg max-h-48 overflow-y-auto">
              {searching ? (
                <p className="text-[11px] text-slate-400 px-3 py-2">Searching...</p>
              ) : (
                results.map(p => (
                  <button key={p.id} type="button" onClick={() => addProject(p)} className="w-full text-left px-3 py-2 text-[11px] text-slate-700 hover:bg-slate-50">
                    {p.name}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.projectId} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-1.5">
            <p className={`flex-1 text-[11px] font-medium truncate ${r.projectId === projectId ? "text-indigo-600" : "text-slate-600"}`}>
              {r.projectName}{r.projectId === projectId ? " (this project)" : ""}
            </p>
            <input
              type="number" step="0.01" value={r.splitPercent}
              onChange={e => updatePercent(r.projectId, parseFloat(e.target.value) || 0)}
              className="w-16 text-right text-[11px] border border-slate-200 rounded-lg px-1.5 py-0.5 bg-white"
            />
            <span className="text-[10px] text-slate-400 w-3">%</span>
            <span className="text-[11px] text-slate-500 w-24 text-right shrink-0">{money((loan.principal_amount || 0) * r.splitPercent / 100)}</span>
            <button type="button" onClick={() => removeProject(r.projectId)} disabled={rows.length <= 1} className="text-slate-300 hover:text-rose-500 disabled:opacity-20 shrink-0">
              <X size={11} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className={`text-[11px] font-bold ${withinTolerance ? "text-emerald-600" : "text-amber-600"}`}>
          Total: {total.toFixed(2)}%{!withinTolerance ? " (must total 100%)" : ""}
        </p>
        <button type="button" onClick={save} disabled={saving || !withinTolerance} className="text-[11px] font-bold bg-indigo-600 text-white rounded-full px-4 py-1.5 disabled:opacity-40">
          {saving ? <Loader2 size={11} className="animate-spin" /> : "Save split"}
        </button>
      </div>
    </div>
  );
}

function LoanDetail({ loan, projectId, onChanged }: { loan: Loan; projectId: string; onChanged: () => void }) {
  const [rates, setRates] = useState<(LoanInterestRateEntry & { id: string })[]>([]);
  const [phases, setPhases] = useState<(LoanPhaseInput & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingRate, setAddingRate] = useState(false);
  const [addingPhase, setAddingPhase] = useState(false);
  const [newRate, setNewRate] = useState({ effectiveDate: "", interestRatePa: "" });
  const [newPhase, setNewPhase] = useState({ repaymentType: "Interest Only" as string, startDate: "", endDate: "", paymentFrequency: "Monthly" });
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editPhase, setEditPhase] = useState({ repaymentType: "Interest Only" as string, startDate: "", endDate: "", paymentFrequency: "Monthly" });
  const [saving, setSaving] = useState(false);
  const [linkedLine, setLinkedLine] = useState<{ id: string; budgeted_amount: number | null } | null>(null);
  const [linking, setLinking] = useState(false);
  const [actualRepaid, setActualRepaid] = useState<number | null>(null);
  const [matchedTxCount, setMatchedTxCount] = useState(0);

  const linkedSource = `loan:${loan.id}`;

  const load = async () => {
    setLoading(true);
    const [rRes, pRes, blRes, txRes] = await Promise.all([
      fetch(`/api/finance-model/loan-interest-rates?loanId=${loan.id}`),
      fetch(`/api/finance-model/loan-phases?loanId=${loan.id}`),
      fetch(`/api/finance-model/budget-lines?projectId=${projectId}`),
      fetch(`/api/finance-model/transactions?projectId=${projectId}`),
    ]);
    const rJson = await rRes.json();
    const pJson = await pRes.json();
    const blJson = await blRes.json();
    const txJson = await txRes.json();
    setRates(rJson.rates || []);
    setPhases((pJson.phases || []).map((p: any) => ({ ...p, phase_order: Number(p.phase_order) || 0 })));
    setLinkedLine((blJson.budgetLines || []).find((l: any) => l.linked_source === linkedSource) || null);
    // Actual repayments -- Expense-type transactions matched to this loan
    // (money paid TO the lender, principal+interest combined, since bank
    // transactions aren't broken into interest/principal components).
    // Drawdowns (Income-type, money FROM the lender) aren't counted here --
    // this is specifically "what's been repaid," compared against the
    // calculated schedule's total (interest + principal) below.
    const matched = ((txJson.transactions || []) as { loan_id: string | null; type: string | null; amount: number | null }[]).filter(t => t.loan_id === loan.id && t.type === "Expense");
    setMatchedTxCount(matched.length);
    setActualRepaid(matched.length ? matched.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0) : null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [loan.id]);

  // Interest/rate history and phases are intrinsic to the loan itself
  // (shared regardless of split), but the SCHEDULE is computed against
  // this project's allocated share of the principal, not the full
  // facility -- an unsplit loan's allocated_principal_amount always
  // equals principal_amount (100%), so this is a no-op for every loan
  // that hasn't been split.
  const schedule = useMemo(() => {
    if (!loan.allocated_principal_amount || !phases.length) return null;
    return calculateLoanSchedule(loan.allocated_principal_amount, phases, rates);
  }, [loan.allocated_principal_amount, phases, rates]);

  const addRate = async () => {
    const rate = parseFloat(newRate.interestRatePa);
    if (!newRate.effectiveDate || !Number.isFinite(rate)) return;
    setSaving(true);
    await fetch("/api/finance-model/loan-interest-rates", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loanId: loan.id, effectiveDate: newRate.effectiveDate, interestRatePa: rate }),
    });
    setNewRate({ effectiveDate: "", interestRatePa: "" });
    setAddingRate(false);
    setSaving(false);
    await load();
  };

  const deleteRate = async (id: string) => {
    await fetch(`/api/finance-model/loan-interest-rates?id=${id}`, { method: "DELETE" });
    await load();
  };

  const addPhase = async () => {
    if (!newPhase.startDate || !newPhase.endDate) return;
    setSaving(true);
    await fetch("/api/finance-model/loan-phases", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loanId: loan.id, ...newPhase }),
    });
    setNewPhase({ repaymentType: "Interest Only", startDate: "", endDate: "", paymentFrequency: "Monthly" });
    setAddingPhase(false);
    setSaving(false);
    await load();
  };

  const deletePhase = async (id: string) => {
    await fetch(`/api/finance-model/loan-phases?id=${id}`, { method: "DELETE" });
    await load();
  };

  const startEditPhase = (p: LoanPhaseInput & { id: string }) => {
    setEditingPhaseId(p.id);
    setEditPhase({ repaymentType: p.repayment_type, startDate: p.start_date, endDate: p.end_date || "", paymentFrequency: p.payment_frequency });
  };

  const savePhaseEdit = async () => {
    if (!editingPhaseId || !editPhase.startDate || !editPhase.endDate) return;
    setSaving(true);
    await fetch("/api/finance-model/loan-phases", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingPhaseId, ...editPhase }),
    });
    setEditingPhaseId(null);
    setSaving(false);
    await load();
  };

  const linkToBudget = async (amount: number) => {
    setLinking(true);
    if (linkedLine) {
      await fetch("/api/finance-model/budget-lines", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: linkedLine.id, budgetedAmount: amount }) });
    } else {
      await fetch("/api/finance-model/budget-lines", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, category: "Finance Costs", label: `${loan.name || loan.lender_type || "Loan"} interest`, budgetedAmount: amount, linkedSource }),
      });
    }
    await load();
    setLinking(false);
  };

  const unlinkFromBudget = async () => {
    if (!linkedLine) return;
    setLinking(true);
    await fetch("/api/finance-model/budget-lines", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: linkedLine.id, linkedSource: null }) });
    await load();
    setLinking(false);
  };

  // Auto-resync -- once linked, keep the budget line's amount in step with
  // the calculated total interest whenever rates/phases change, no manual
  // re-click needed.
  useEffect(() => {
    if (loading || !linkedLine || !schedule) return;
    if (Math.round(linkedLine.budgeted_amount ?? 0) !== Math.round(schedule.totalInterest)) {
      fetch("/api/finance-model/budget-lines", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: linkedLine.id, budgetedAmount: schedule.totalInterest }) }).then(load);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, linkedLine?.id, schedule?.totalInterest]);

  if (loading) {
    return <div className="flex items-center gap-2 text-[12px] text-slate-400 py-6 justify-center"><Loader2 size={13} className="animate-spin" /> Loading loan detail...</div>;
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Interest rate history</p>
          <button onClick={() => setAddingRate(v => !v)} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"><Plus size={11} /> Add rate</button>
        </div>
        {addingRate && (
          <div className="flex items-end gap-2 bg-slate-50/60 rounded-xl p-2">
            <input type="date" value={newRate.effectiveDate} onChange={e => setNewRate(p => ({ ...p, effectiveDate: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white" />
            <input type="number" step="0.01" value={newRate.interestRatePa} onChange={e => setNewRate(p => ({ ...p, interestRatePa: e.target.value }))} placeholder="% p.a." className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white w-20" />
            <button onClick={addRate} disabled={saving} className="text-[11px] font-bold bg-indigo-600 text-white rounded-lg px-2 py-1 disabled:opacity-40">Add</button>
          </div>
        )}
        {rates.length === 0 ? (
          <p className="text-[11px] text-slate-400">No rate entries yet.</p>
        ) : (
          <div className="space-y-1">
            {[...rates].sort((a, b) => new Date(b.effective_date).getTime() - new Date(a.effective_date).getTime()).map(r => (
              <div key={r.id} className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-50 rounded-lg">
                <span className="text-slate-600">{formatDate(r.effective_date)}</span>
                <span className="font-bold text-slate-700">{r.interest_rate_pa}% p.a.</span>
                <button onClick={() => deleteRate(r.id)} className="text-slate-300 hover:text-rose-500"><X size={11} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Repayment phases</p>
          <button onClick={() => setAddingPhase(v => !v)} className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"><Plus size={11} /> Add phase</button>
        </div>
        {addingPhase && (
          <div className="flex flex-wrap items-end gap-2 bg-slate-50/60 rounded-xl p-2">
            <select value={newPhase.repaymentType} onChange={e => setNewPhase(p => ({ ...p, repaymentType: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white">
              {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" value={newPhase.startDate} onChange={e => setNewPhase(p => ({ ...p, startDate: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white" />
            <input type="date" value={newPhase.endDate} onChange={e => setNewPhase(p => ({ ...p, endDate: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white" />
            <select value={newPhase.paymentFrequency} onChange={e => setNewPhase(p => ({ ...p, paymentFrequency: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white">
              {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <button onClick={addPhase} disabled={saving} className="text-[11px] font-bold bg-indigo-600 text-white rounded-lg px-2 py-1 disabled:opacity-40">Add</button>
          </div>
        )}
        {phases.length === 0 ? (
          <p className="text-[11px] text-slate-400">No phases yet.</p>
        ) : (
          <div className="space-y-1">
            {[...phases].sort((a, b) => a.phase_order - b.phase_order).map(p => (
              editingPhaseId === p.id ? (
                <div key={p.id} className="flex flex-wrap items-end gap-2 bg-slate-50/60 rounded-xl p-2">
                  <select value={editPhase.repaymentType} onChange={e => setEditPhase(prev => ({ ...prev, repaymentType: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white">
                    {REPAYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="date" value={editPhase.startDate} onChange={e => setEditPhase(prev => ({ ...prev, startDate: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white" />
                  <input type="date" value={editPhase.endDate} onChange={e => setEditPhase(prev => ({ ...prev, endDate: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white" />
                  <select value={editPhase.paymentFrequency} onChange={e => setEditPhase(prev => ({ ...prev, paymentFrequency: e.target.value }))} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white">
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <button onClick={savePhaseEdit} disabled={saving} className="text-[11px] font-bold bg-indigo-600 text-white rounded-lg px-2 py-1 disabled:opacity-40">
                    {saving ? <Loader2 size={11} className="animate-spin" /> : "Save"}
                  </button>
                  <button onClick={() => setEditingPhaseId(null)} className="text-[11px] text-slate-400 px-1">Cancel</button>
                </div>
              ) : (
                <div key={p.id} className="flex items-center justify-between text-[11px] px-2 py-1 bg-slate-50 rounded-lg">
                  <span className="font-bold text-slate-700">{p.repayment_type}</span>
                  <span className="text-slate-500">{formatDate(p.start_date)} → {formatDate(p.end_date)}</span>
                  <span className="text-slate-400">{p.payment_frequency}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEditPhase(p)} className="text-slate-300 hover:text-indigo-600"><Pencil size={11} /></button>
                    <button onClick={() => deletePhase(p.id)} className="text-slate-300 hover:text-rose-500"><X size={11} /></button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      <div className="col-span-2 border-t border-slate-100 pt-3">
        <LoanSplitEditor loan={loan} projectId={projectId} onChanged={onChanged} />
      </div>

      <div className="col-span-2 border-t border-slate-100 pt-3">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Repayment schedule</p>
        {!schedule ? (
          <p className="text-[11px] text-slate-400">Add a principal amount and at least one phase to calculate a schedule.</p>
        ) : (
          <>
            <div className="flex items-center gap-6 mb-2 text-[12px]">
              <p className="font-bold text-slate-700">Total interest: <span className="text-indigo-600">{money(schedule.totalInterest)}</span></p>
              <p className="font-bold text-slate-700">Remaining balance: <span className={schedule.finalBalance > 0 ? "text-amber-600" : "text-emerald-600"}>{money(schedule.finalBalance)}</span></p>
              {linkedLine ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600"><Check size={11} /> Synced to budget (Finance Costs)</span>
                  <button onClick={unlinkFromBudget} disabled={linking} className="text-slate-300 hover:text-rose-500 disabled:opacity-40" title="Unlink (keeps the line, stops auto-sync)">
                    {linking ? <Loader2 size={11} className="animate-spin" /> : <Unlink size={11} />}
                  </button>
                </div>
              ) : (
                <button onClick={() => linkToBudget(schedule.totalInterest)} disabled={linking} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40">
                  {linking ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />} Link total interest to budget
                </button>
              )}
            </div>
            <div className="max-h-56 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest sticky top-0 bg-white">
                    <th className="py-1">Period</th>
                    <th className="py-1 text-right">Opening</th>
                    <th className="py-1 text-right">Interest</th>
                    <th className="py-1 text-right">Principal</th>
                    <th className="py-1 text-right">Payment</th>
                    <th className="py-1 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.periods.map((p, i) => (
                    <tr key={i} className="border-t border-slate-50">
                      <td className="py-1 text-slate-500">{formatDate(p.periodStart)} → {formatDate(p.periodEnd)}</td>
                      <td className="py-1 text-right text-slate-500">{money(p.openingBalance)}</td>
                      <td className="py-1 text-right text-slate-700">{money(p.interest)}</td>
                      <td className="py-1 text-right text-slate-700">{money(p.principal)}</td>
                      <td className="py-1 text-right font-medium text-slate-700">{money(p.payment)}</td>
                      <td className="py-1 text-right text-slate-500">{money(p.closingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Calculated vs Actual</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Calculated (P+I)</p>
                  <p className="text-[16px] font-bold text-slate-800">{money(schedule.periods.reduce((s, p) => s + p.payment, 0))}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Actual Repaid ({matchedTxCount} tx)</p>
                  <p className="text-[16px] font-bold text-slate-800">{actualRepaid != null ? money(actualRepaid) : "— (no transactions matched to this loan yet)"}</p>
                </div>
                {actualRepaid != null && (
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Variance</p>
                    <p className={`text-[16px] font-bold ${actualRepaid - schedule.periods.reduce((s, p) => s + p.payment, 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {money(actualRepaid - schedule.periods.reduce((s, p) => s + p.payment, 0))}
                    </p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Actual sums Expense-type Transactions matched to this loan (Transactions tab) -- combined principal+interest, since bank transactions aren't broken into components. Match transactions to this loan there to populate this.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoansSubtab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingLoan, setAddingLoan] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLoan, setNewLoan] = useState({
    name: "", lenderType: "Senior", lender: "", borrowerId: "", guarantorIds: [] as string[],
    principalAmount: "", startDate: "", repaymentDate: "", repaymentPeriod: "At End of Term",
    extensionRight: false, extensionTerms: "", earlyRepaymentAllowed: false, earlyRepaymentTerms: "",
    security: "", notes: "",
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance-model/loans?projectId=${projectId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to load"); return; }
      setLoans(json.loans || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const addLoan = async () => {
    if (!newLoan.borrowerId) return;
    setSaving(true);
    await fetch("/api/finance-model/loans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId, name: newLoan.name.trim() || null, lenderType: newLoan.lenderType, lender: newLoan.lender.trim() || null,
        borrowerId: newLoan.borrowerId, guarantorIds: newLoan.guarantorIds,
        principalAmount: parseFloat(newLoan.principalAmount) || null,
        startDate: newLoan.startDate || null, repaymentDate: newLoan.repaymentDate || null,
        repaymentPeriod: newLoan.repaymentPeriod, extensionRight: newLoan.extensionRight,
        extensionTerms: newLoan.extensionTerms.trim() || null, earlyRepaymentAllowed: newLoan.earlyRepaymentAllowed,
        earlyRepaymentTerms: newLoan.earlyRepaymentTerms.trim() || null, security: newLoan.security.trim() || null,
        notes: newLoan.notes.trim() || null,
      }),
    });
    setNewLoan({ name: "", lenderType: "Senior", lender: "", borrowerId: "", guarantorIds: [], principalAmount: "", startDate: "", repaymentDate: "", repaymentPeriod: "At End of Term", extensionRight: false, extensionTerms: "", earlyRepaymentAllowed: false, earlyRepaymentTerms: "", security: "", notes: "" });
    setAddingLoan(false);
    setSaving(false);
    await load();
  };

  const deleteLoan = async (id: string) => {
    if (!confirm("Remove this loan and all its rate/phase history?")) return;
    await fetch(`/api/finance-model/loans?id=${id}`, { method: "DELETE" });
    await load();
  };

  const toggleDischarged = async (loan: Loan) => {
    setLoans(prev => prev.map(l => (l.id === loan.id ? { ...l, is_discharged: !l.is_discharged } : l)));
    await fetch("/api/finance-model/loans", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: loan.id, isDischarged: !loan.is_discharged }),
    });
    await load();
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center"><Loader2 size={14} className="animate-spin" /> Loading loans...</div>;
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
      <div className="flex items-center justify-end px-1">
        <button onClick={() => setAddingLoan(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"><Plus size={11} /> Add loan</button>
      </div>

      {addingLoan && (
        <div className="bg-white border border-slate-200 rounded-[32px] p-4 grid grid-cols-2 gap-3">
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Name</label>
            <input value={newLoan.name} onChange={e => setNewLoan(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Senior construction facility" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Lender type</label>
            <select value={newLoan.lenderType} onChange={e => setNewLoan(p => ({ ...p, lenderType: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white w-full">
              {LENDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Lender</label>
            <input value={newLoan.lender} onChange={e => setNewLoan(p => ({ ...p, lender: e.target.value }))} placeholder="e.g. NAB, GAP" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Borrower</label>
            <RelationPicker linkedSystemTable="entities" value={newLoan.borrowerId || null} onSelect={id => setNewLoan(p => ({ ...p, borrowerId: id || "" }))} placeholder="Select entity..." /></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Guarantors</label>
            <RelationPicker linkedSystemTable="entities" multiple values={newLoan.guarantorIds} onSelectMulti={ids => setNewLoan(p => ({ ...p, guarantorIds: ids }))} placeholder="Select entities..." /></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Principal amount</label>
            <input type="number" value={newLoan.principalAmount} onChange={e => setNewLoan(p => ({ ...p, principalAmount: e.target.value }))} placeholder="0.00" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Repayment period</label>
            <select value={newLoan.repaymentPeriod} onChange={e => setNewLoan(p => ({ ...p, repaymentPeriod: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white w-full">
              {REPAYMENT_PERIODS.map(t => <option key={t} value={t}>{t}</option>)}
            </select></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Start date</label>
            <input type="date" value={newLoan.startDate} onChange={e => setNewLoan(p => ({ ...p, startDate: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          <div><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Repayment date</label>
            <input type="date" value={newLoan.repaymentDate} onChange={e => setNewLoan(p => ({ ...p, repaymentDate: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          <div className="col-span-2 flex items-center gap-6">
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" checked={newLoan.extensionRight} onChange={e => setNewLoan(p => ({ ...p, extensionRight: e.target.checked }))} /> Extension right</label>
            <label className="flex items-center gap-1.5 text-[12px] text-slate-600"><input type="checkbox" checked={newLoan.earlyRepaymentAllowed} onChange={e => setNewLoan(p => ({ ...p, earlyRepaymentAllowed: e.target.checked }))} /> Early repayment allowed</label>
          </div>
          {newLoan.extensionRight && (
            <div className="col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Extension terms</label>
              <input value={newLoan.extensionTerms} onChange={e => setNewLoan(p => ({ ...p, extensionTerms: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          )}
          {newLoan.earlyRepaymentAllowed && (
            <div className="col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Early repayment terms</label>
              <input value={newLoan.earlyRepaymentTerms} onChange={e => setNewLoan(p => ({ ...p, earlyRepaymentTerms: e.target.value }))} placeholder="e.g. break fee" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          )}
          <div className="col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Security</label>
            <input value={newLoan.security} onChange={e => setNewLoan(p => ({ ...p, security: e.target.value }))} placeholder="e.g. First registered mortgage over the property" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          <div className="col-span-2"><label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Notes</label>
            <textarea value={newLoan.notes} onChange={e => setNewLoan(p => ({ ...p, notes: e.target.value }))} rows={2} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-full" /></div>
          <div className="col-span-2 flex justify-end gap-2">
            <button onClick={() => setAddingLoan(false)} className="text-[11px] font-bold text-slate-400 px-3 py-1.5">Cancel</button>
            <button onClick={addLoan} disabled={saving || !newLoan.borrowerId} className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40">
              {saving ? <Loader2 size={11} className="animate-spin" /> : "Add loan"}
            </button>
          </div>
        </div>
      )}

      {loans.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
          <p className="text-[12px] text-slate-400">No loans recorded for this project yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {loans.map(loan => (
            <div key={loan.id} className={`bg-white border rounded-[32px] overflow-hidden ${loan.is_discharged ? "border-slate-100" : "border-slate-200"}`}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedId(id => (id === loan.id ? null : loan.id))}
                onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setExpandedId(id => (id === loan.id ? null : loan.id)); }}
                className="w-full flex items-center justify-between px-6 py-4 text-left cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <ChevronRight size={14} className={`text-slate-300 transition-transform ${expandedId === loan.id ? "rotate-90" : ""}`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <p className={`text-[13px] font-bold ${loan.is_discharged ? "text-slate-400" : "text-slate-700"}`}>{loan.name || loan.lender_type || "Loan"}</p>
                      {loan.is_discharged && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400">Discharged</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">{loan.lender_type}{loan.lender ? ` (${loan.lender})` : ""} · Repayment {formatDate(loan.repayment_date)}{loan.security ? ` · ${loan.security}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className={`text-[13px] font-bold ${loan.is_discharged ? "text-slate-400" : "text-slate-700"}`}>{loan.principal_amount != null ? money(loan.allocated_principal_amount) : "—"}</p>
                    {loan.is_split && (
                      <p className="text-[10px] font-bold text-indigo-500 flex items-center gap-1 justify-end">
                        <Split size={9} /> {loan.allocation_percent.toFixed(0)}% of {money(loan.principal_amount || 0)}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); toggleDischarged(loan); }}
                    className="text-slate-300 hover:text-indigo-500"
                    title={loan.is_discharged ? "Mark as active" : "Mark as discharged (paid off)"}
                  >
                    {loan.is_discharged ? <RotateCcw size={13} /> : <Archive size={13} />}
                  </button>
                  <button onClick={e => { e.stopPropagation(); deleteLoan(loan.id); }} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                </div>
              </div>
              {expandedId === loan.id && (
                <div className="px-6 pb-6 border-t border-slate-100 pt-4">
                  <LoanDetail loan={loan} projectId={projectId} onChanged={load} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
