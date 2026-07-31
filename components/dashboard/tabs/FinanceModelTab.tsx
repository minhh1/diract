"use client";

// The "Finance Model" entity tab -- actual income/expenses pulled live from
// this entity's linked Xero organisation (entities.xero_connection_id, set
// via Admin -> Xero -> "Link entities to a Xero organisation"). Bank
// transactions only, not invoices/bills -- see app/api/xero/finance-model/
// route.ts's comment for why that's the right source for "actual spent".
// Budgeted figures / stamp duty aren't wired in yet -- this is the "can we
// see actuals" foundation the rest of the finance model builds on.
import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, ExternalLink, RefreshCw } from "lucide-react";

interface Props {
  recordId: string; // entity id
}

interface Transaction {
  id: string;
  date: string | null;
  type: "income" | "expense" | "other";
  contact: string | null;
  reference: string | null;
  total: number;
}

function money(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function FinanceModelTab({ recordId }: Props) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/xero/finance-model?entityId=${recordId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load");
        setNeedsReconnect(!!json.needsReconnect);
        setConnected(false);
        return;
      }
      setConnected(!!json.connected);
      setTenantName(json.tenantName ?? null);
      setTransactions(json.transactions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [recordId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading finance model...
      </div>
    );
  }

  if (!connected && !error) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[13px] font-medium text-slate-600 mb-1">Not linked to a Xero organisation</p>
        <p className="text-[12px] text-slate-400 mb-4">
          Link this entity to a connected Xero organisation to see its actual income and expenses.
        </p>
        <a
          href="/dashboard/admin?tab=xero"
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline"
        >
          Go to Admin → Xero <ExternalLink size={11} />
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center">
        <p className="text-[13px] font-medium text-rose-600 mb-1">Couldn't load Xero data</p>
        <p className="text-[12px] text-slate-400 mb-4">
          {needsReconnect
            ? "This Xero organisation was connected before the finance model's data access was added -- disconnect and reconnect it in Admin → Xero to grant the new permission."
            : error}
        </p>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline"
        >
          <RefreshCw size={11} /> Try again
        </button>
      </div>
    );
  }

  const income = transactions.filter(t => t.type === "income");
  const expenses = transactions.filter(t => t.type === "expense");
  const incomeTotal = income.reduce((sum, t) => sum + t.total, 0);
  const expenseTotal = expenses.reduce((sum, t) => sum + t.total, 0);

  const Section = ({ title, rows, total, tone }: { title: string; rows: Transaction[]; total: number; tone: "income" | "expense" }) => (
    <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {tone === "income" ? <TrendingUp size={14} className="text-emerald-500" /> : <TrendingDown size={14} className="text-rose-500" />}
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
        </div>
        <p className={`text-[13px] font-bold ${tone === "income" ? "text-emerald-600" : "text-rose-600"}`}>{money(total)}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-[12px] text-slate-400 px-6 py-4">No {title.toLowerCase()} yet.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
              <th className="px-6 py-2 font-bold">Date</th>
              <th className="px-2 py-2 font-bold">Contact</th>
              <th className="px-2 py-2 font-bold">Reference</th>
              <th className="px-6 py-2 font-bold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(t => (
              <tr key={t.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                <td className="px-6 py-2 text-slate-500 whitespace-nowrap">{formatDate(t.date)}</td>
                <td className="px-2 py-2 text-slate-700 font-medium">{t.contact || "—"}</td>
                <td className="px-2 py-2 text-slate-400 truncate max-w-xs">{t.reference || "—"}</td>
                <td className={`px-6 py-2 text-right font-medium whitespace-nowrap ${tone === "income" ? "text-emerald-600" : "text-rose-600"}`}>
                  {tone === "income" ? "+" : "−"}{money(t.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-slate-400">
          {tenantName ? `Live from Xero — ${tenantName}` : "Live from Xero"}
        </p>
        <div className="flex items-center gap-4">
          <p className="text-[12px] font-bold text-slate-700">
            Net: <span className={incomeTotal - expenseTotal >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(incomeTotal - expenseTotal)}</span>
          </p>
          <button onClick={load} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600">
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
      </div>
      <Section title="Income" rows={income} total={incomeTotal} tone="income" />
      <Section title="Expenses" rows={expenses} total={expenseTotal} tone="expense" />
    </div>
  );
}
