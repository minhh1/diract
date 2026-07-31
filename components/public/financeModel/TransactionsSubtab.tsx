"use client";

// The Finance Model's Transactions subtab -- a persisted ledger (manual
// entry and/or "Sync from Xero"), with checkbox filters, quick date-range
// buttons, sortable columns, per-row classification against a budget
// line, and a bulk "Apply rules" action
// (lib/financeModel/classifyTransaction.ts). No server-side sort/filter --
// loads a project's full transaction set and works on it client-side, same
// tradeoff components/dashboard/tabs/InvoicesTab.tsx already makes for its
// own custom-table-backed list.
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X, RefreshCw, Wand2, Trash2 } from "lucide-react";
import { money } from "./BudgetVsActualTable";

interface BudgetLine {
  id: string;
  category: string | null;
  label: string | null;
}

interface Transaction {
  id: string;
  date: string | null;
  type: "Income" | "Expense" | null;
  contact: string | null;
  reference: string | null;
  amount: number | null;
  budget_line: string | null;
  source: "Manual" | "Xero" | null;
}

type DateRange = "week" | "month" | "since_start" | "total";
type SortKey = "date" | "amount";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday-start week
  const s = new Date(d);
  s.setDate(d.getDate() + diff);
  s.setHours(0, 0, 0, 0);
  return s;
}

export default function TransactionsSubtab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(["Income", "Expense"]));
  const [sourceFilter, setSourceFilter] = useState<Set<string>>(new Set(["Manual", "Xero"]));
  const [unclassifiedOnly, setUnclassifiedOnly] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("total");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [addingTx, setAddingTx] = useState(false);
  const [savingTx, setSavingTx] = useState(false);
  const [newTx, setNewTx] = useState({ date: "", type: "Expense" as string, contact: "", reference: "", amount: "", budgetLineId: "" });

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [applyingRules, setApplyingRules] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, blRes] = await Promise.all([
        fetch(`/api/finance-model/transactions?projectId=${projectId}`),
        fetch(`/api/finance-model/budget-lines?projectId=${projectId}`),
      ]);
      const txJson = await txRes.json();
      const blJson = await blRes.json();
      if (!txRes.ok) { setError(txJson.error || "Failed to load"); return; }
      setTransactions(txJson.transactions || []);
      setProjectCreatedAt(txJson.projectCreatedAt || null);
      setBudgetLines(blJson.budgetLines || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const budgetLineLabel = (id: string | null) => {
    if (!id) return "—";
    const line = budgetLines.find(l => l.id === id);
    return line ? `${line.category ? `${line.category} — ` : ""}${line.label || ""}` : "—";
  };

  const toggleSetValue = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  const rangeStart = useMemo((): Date | null => {
    const now = new Date();
    if (dateRange === "week") return startOfWeek(now);
    if (dateRange === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
    if (dateRange === "since_start") return projectCreatedAt ? new Date(projectCreatedAt) : null;
    return null;
  }, [dateRange, projectCreatedAt]);

  const filtered = useMemo(() => {
    let rows = transactions.filter(t => {
      if (t.type && !typeFilter.has(t.type)) return false;
      if (t.source && !sourceFilter.has(t.source)) return false;
      if (unclassifiedOnly && t.budget_line) return false;
      if (rangeStart && t.date && new Date(t.date) < rangeStart) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      const av = sortKey === "date" ? new Date(a.date || 0).getTime() : (a.amount ?? 0);
      const bv = sortKey === "date" ? new Date(b.date || 0).getTime() : (b.amount ?? 0);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [transactions, typeFilter, sourceFilter, unclassifiedOnly, rangeStart, sortKey, sortDir]);

  const total = filtered.reduce((sum, t) => sum + (t.type === "Expense" ? -(t.amount ?? 0) : (t.amount ?? 0)), 0);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const handleAddTx = async () => {
    const amount = parseFloat(newTx.amount);
    if (!Number.isFinite(amount)) return;
    setSavingTx(true);
    await fetch("/api/finance-model/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId, date: newTx.date || null, type: newTx.type,
        contact: newTx.contact.trim() || null, reference: newTx.reference.trim() || null,
        amount, budgetLineId: newTx.budgetLineId || null,
      }),
    });
    setNewTx({ date: "", type: "Expense", contact: "", reference: "", amount: "", budgetLineId: "" });
    setAddingTx(false);
    setSavingTx(false);
    await load();
  };

  const classify = async (id: string, budgetLineId: string) => {
    await fetch("/api/finance-model/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, budgetLineId: budgetLineId || null }),
    });
    await load();
  };

  const deleteTx = async (id: string) => {
    if (!confirm("Remove this transaction?")) return;
    await fetch(`/api/finance-model/transactions?id=${id}`, { method: "DELETE" });
    await load();
  };

  const syncFromXero = async () => {
    setSyncing(true);
    setSyncMessage(null);
    const res = await fetch("/api/finance-model/sync-xero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const json = await res.json();
    setSyncing(false);
    setSyncMessage(res.ok ? `Imported ${json.imported}, skipped ${json.skipped} already-imported.` : (json.error || "Sync failed"));
    if (res.ok) await load();
  };

  const applyRules = async () => {
    setApplyingRules(true);
    const res = await fetch("/api/finance-model/classify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    const json = await res.json();
    setApplyingRules(false);
    setSyncMessage(res.ok ? `Classified ${json.classified} of ${json.checked} unclassified transactions.` : (json.error || "Failed to apply rules"));
    if (res.ok) await load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading transactions...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[13px] font-medium text-rose-600 mb-1">Couldn't load</p>
        <p className="text-[12px] text-slate-400 mb-4">{error}</p>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline">
          <RefreshCw size={11} /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-[12px] font-bold text-slate-700">
          Net: <span className={total >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(total)}</span>
          <span className="text-slate-400 font-normal ml-2">({filtered.length} of {transactions.length})</span>
        </p>
        <div className="flex items-center gap-3">
          {syncMessage && <p className="text-[11px] text-slate-400">{syncMessage}</p>}
          <button onClick={applyRules} disabled={applyingRules} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40">
            {applyingRules ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Apply rules
          </button>
          <button onClick={syncFromXero} disabled={syncing} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40">
            {syncing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync from Xero
          </button>
          <button onClick={() => setAddingTx(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
            <Plus size={11} /> Add transaction
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-center gap-4 text-[11px]">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Type</span>
          {["Income", "Expense"].map(t => (
            <label key={t} className="flex items-center gap-1 text-slate-600 cursor-pointer">
              <input type="checkbox" checked={typeFilter.has(t)} onChange={() => toggleSetValue(typeFilter, t, setTypeFilter)} /> {t}
            </label>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-bold uppercase tracking-widest text-[9px]">Source</span>
          {["Manual", "Xero"].map(s => (
            <label key={s} className="flex items-center gap-1 text-slate-600 cursor-pointer">
              <input type="checkbox" checked={sourceFilter.has(s)} onChange={() => toggleSetValue(sourceFilter, s, setSourceFilter)} /> {s}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-1 text-slate-600 cursor-pointer">
          <input type="checkbox" checked={unclassifiedOnly} onChange={e => setUnclassifiedOnly(e.target.checked)} /> Unclassified only
        </label>
        <div className="flex items-center gap-1 ml-auto">
          {([["week", "This week"], ["month", "This month"], ["since_start", "Since project start"], ["total", "Total"]] as [DateRange, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setDateRange(id)}
              className={`px-2.5 py-1 rounded-full font-bold ${dateRange === id ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {addingTx && (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Date</label>
            <input type="date" value={newTx.date} onChange={e => setNewTx(p => ({ ...p, date: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Type</label>
            <select value={newTx.type} onChange={e => setNewTx(p => ({ ...p, type: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Contact</label>
            <input value={newTx.contact} onChange={e => setNewTx(p => ({ ...p, contact: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Reference</label>
            <input value={newTx.reference} onChange={e => setNewTx(p => ({ ...p, reference: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Amount</label>
            <input type="number" value={newTx.amount} onChange={e => setNewTx(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-28" />
          </div>
          <div>
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Budget line</label>
            <select value={newTx.budgetLineId} onChange={e => setNewTx(p => ({ ...p, budgetLineId: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
              <option value="">Unclassified</option>
              {budgetLines.map(l => <option key={l.id} value={l.id}>{l.category} — {l.label}</option>)}
            </select>
          </div>
          <button onClick={handleAddTx} disabled={savingTx} className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40">
            {savingTx ? <Loader2 size={11} className="animate-spin" /> : "Add"}
          </button>
          <button onClick={() => setAddingTx(false)} className="text-slate-300 hover:text-slate-600"><X size={14} /></button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-[12px] text-slate-400 px-6 py-4">No transactions match these filters.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                <th className="px-6 py-2 font-bold cursor-pointer" onClick={() => toggleSort("date")}>Date {sortKey === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                <th className="px-2 py-2 font-bold">Contact</th>
                <th className="px-2 py-2 font-bold">Reference</th>
                <th className="px-2 py-2 font-bold">Budget line</th>
                <th className="px-2 py-2 font-bold">Source</th>
                <th className="px-6 py-2 font-bold text-right cursor-pointer" onClick={() => toggleSort("amount")}>Amount {sortKey === "amount" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                <th className="px-2 py-2 font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => (
                <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                  <td className="px-6 py-2 text-slate-500 whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="px-2 py-2 text-slate-700 font-medium">{t.contact || "—"}</td>
                  <td className="px-2 py-2 text-slate-400 truncate max-w-xs">{t.reference || "—"}</td>
                  <td className="px-2 py-2">
                    <select value={t.budget_line || ""} onChange={e => classify(t.id, e.target.value)} className="text-[11px] border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600">
                      <option value="">Unclassified</option>
                      {budgetLines.map(l => <option key={l.id} value={l.id}>{l.category} — {l.label}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-slate-400">{t.source || "—"}</td>
                  <td className={`px-6 py-2 text-right font-medium whitespace-nowrap ${t.type === "Expense" ? "text-rose-600" : "text-emerald-600"}`}>
                    {t.type === "Expense" ? "−" : "+"}{money(Math.abs(t.amount ?? 0))}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => deleteTx(t.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={12} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
