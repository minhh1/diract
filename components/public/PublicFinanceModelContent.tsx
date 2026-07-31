"use client";

// The actual Finance Model UI (budget-vs-actual table, stamp duty action,
// raw transaction list) -- shared by two call sites, same pattern as
// PublicDocumentsContent.tsx/PublicClientUpdateContent.tsx:
//   1. components/dashboard/tabs/FinanceModelTab.tsx (mode="internal",
//      authenticated, editable) -- the record tab on an entity's dashboard.
//   2. app/public/finance-model/[pageId]/page.tsx (mode="public",
//      GENUINELY UNAUTHENTICATED, read-only, access-code gated) -- a
//      shareable link, backed by app/api/finance-model-pages/public/
//      [pageId]/route.ts.
// Public mode's access-code entry is a simpler (no offline/instant-paint
// cache) version of PublicDocumentsContent.tsx's -- still uses the same
// lib/publicPageCache.ts so a returning viewer isn't re-asked every visit,
// just without that component's "paint from cache while revalidating"
// optimization layered on top.
import { useEffect, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, ExternalLink, RefreshCw, Plus, X, Landmark, Lock, Share2, Copy, Check, Trash2 } from "lucide-react";
import { calculateStampDuty, AU_STATES, type AuState } from "@/lib/stampDuty";
import { readPinGatedCache, writePinGatedCache, clearPinGatedCache } from "@/lib/publicPageCache";

const CATEGORIES = ["Acquisition", "Construction", "Professional Fees", "Finance Costs", "Contingency", "Revenue", "Other"] as const;

interface Props {
  // Internal mode identifies the record directly (the viewer is already
  // authenticated and authorized for this company); public mode only has
  // the shareable link's opaque pageId -- the server resolves that to an
  // entity (and checks accessCode) since the client never learns the
  // entityId directly.
  entityId?: string;
  pageId?: string;
  mode?: "internal" | "public";
  accessCode?: string;
  embedded?: boolean;
}

interface Transaction {
  id: string;
  date: string | null;
  type: "income" | "expense" | "other";
  contact: string | null;
  reference: string | null;
  total: number;
  accountCode: string | null;
}

interface BudgetLine {
  id: string;
  category: string;
  label: string;
  budgeted_amount: number;
  xero_account_code: string | null;
  actual: number | null;
}

interface PropertyRow {
  id: string;
  street_address: string;
  state: string | null;
  purchase_price: number | null;
}

// Remembers a verified access code per pageId so a returning visitor isn't
// re-prompted every visit -- same private-helper shape as
// PublicDocumentsContent.tsx's getCachedCode/setCachedCode/clearCachedCode.
const codeCacheKey = (pageId: string) => `finance_model_code_${pageId}`;
function getCachedCode(pageId: string): string | null {
  try { return localStorage.getItem(codeCacheKey(pageId)); } catch { return null; }
}
function setCachedCode(pageId: string, code: string) {
  try { localStorage.setItem(codeCacheKey(pageId), code); } catch { /* ignore */ }
}
function clearCachedCode(pageId: string) {
  try { localStorage.removeItem(codeCacheKey(pageId)); } catch { /* ignore */ }
}

function money(n: number): string {
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD" });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

interface SharePage {
  id: string;
  title: string;
  access_code: string | null;
  is_active: boolean;
  created_at: string;
}

// Create/list/revoke public Finance Model links (finance_model_pages) --
// only ever rendered in editable (mode="internal") mode, so this always has
// a real session/company to authenticate through the normal (non-public)
// app/api/finance-model-pages routes.
function SharePanel({ entityId }: { entityId: string }) {
  const [pages, setPages] = useState<SharePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("Finance Model");
  const [accessCode, setAccessCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/finance-model-pages?entityId=${entityId}`);
    const json = await res.json();
    setPages((json.pages || []).filter((p: SharePage) => p.is_active));
    setLoading(false);
  };

  useEffect(() => { load(); }, [entityId]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    await fetch("/api/finance-model-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, title: title.trim(), accessCode: accessCode.trim() || undefined }),
    });
    setAccessCode("");
    await load();
    setCreating(false);
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this link? It will stop working immediately.")) return;
    await fetch(`/api/finance-model-pages/${id}/revoke`, { method: "PATCH" });
    await load();
  };

  const copyLink = (page: SharePage) => {
    const url = `${window.location.origin}/public/finance-model/${page.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(page.id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-3">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Public links</p>

      {loading ? (
        <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading...</p>
      ) : pages.length === 0 ? (
        <p className="text-[12px] text-slate-400">No public links yet.</p>
      ) : (
        <div className="space-y-1.5">
          {pages.map(page => (
            <div key={page.id} className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl">
              <p className="text-[12px] font-medium text-slate-700 flex-1">
                {page.title}
                {page.access_code && <span className="text-slate-400 font-normal"> — code: {page.access_code}</span>}
              </p>
              <button onClick={() => copyLink(page)} className="p-1 text-slate-300 hover:text-indigo-600" title="Copy link">
                {copiedId === page.id ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
              <button onClick={() => revoke(page.id)} className="p-1 text-slate-300 hover:text-rose-500" title="Revoke">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-40" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Access code (optional)</label>
          <input value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="Leave blank for none" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-40" />
        </div>
        <button onClick={create} disabled={creating || !title.trim()} className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40">
          {creating ? <Loader2 size={11} className="animate-spin" /> : "Create link"}
        </button>
      </div>
    </div>
  );
}

export default function PublicFinanceModelContent({ entityId, pageId, mode = "internal", accessCode, embedded }: Props) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [showStampDuty, setShowStampDuty] = useState(false);
  const [newLine, setNewLine] = useState({ category: "Acquisition" as string, label: "", budgetedAmount: "", xeroAccountCode: "" });
  const [stampDutyPrice, setStampDutyPrice] = useState("");
  const [stampDutyState, setStampDutyState] = useState<AuState | "">("");
  const [stampDutyError, setStampDutyError] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [needsCode, setNeedsCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [checkingCode, setCheckingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  const editable = mode === "internal";
  const cacheKey = `finance_model_${pageId}`;

  const applyLoadedData = (json: any) => {
    setConnected(!!json.connected);
    setTenantName(json.tenantName ?? null);
    setTransactions(json.transactions || []);
    setBudgetLines(json.budgetLines || []);
    setProperties(json.properties || []);
    if (json.properties?.length === 1 && json.properties[0].state) {
      setStampDutyState(json.properties[0].state as AuState);
    }
    if (json.properties?.length === 1 && json.properties[0].purchase_price) {
      setStampDutyPrice(String(json.properties[0].purchase_price));
    }
  };

  const fetchPublic = async (code?: string) => {
    const res = await fetch(`/api/finance-model-pages/public/${pageId}?code=${encodeURIComponent(code || "")}`);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, json };
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    setCodeError(null);
    try {
      if (mode === "public" && pageId) {
        // accessCode prop wins if the caller supplied one (e.g. a widget
        // that already has it); otherwise fall back to a code this same
        // browser verified on a previous visit.
        const code = accessCode || getCachedCode(pageId) || undefined;

        const cached = code ? readPinGatedCache<any>(cacheKey, code) : null;
        if (cached) { applyLoadedData(cached); setPageTitle(cached.title ?? null); }

        const { ok, json } = await fetchPublic(code);
        if (!ok) { setError(json.error || "This page is not available"); return; }
        setPageTitle(json.title ?? null);
        if (json.requiresCode) {
          // A previously-remembered code no longer works (revoked/rotated)
          // -- clear it so the prompt below starts fresh, never silently
          // leaving stale cached data on screen.
          if (code) { clearCachedCode(pageId); clearPinGatedCache(cacheKey); setConnected(false); setBudgetLines([]); }
          setNeedsCode(true);
          return;
        }
        setNeedsCode(false);
        if (code) { setCachedCode(pageId, code); writePinGatedCache(cacheKey, code, json); }
        applyLoadedData(json);
        return;
      }

      const res = await fetch(`/api/xero/finance-model?entityId=${entityId}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to load");
        setNeedsReconnect(!!json.needsReconnect);
        return;
      }
      applyLoadedData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [entityId, pageId, mode, accessCode]);

  const handleCodeSubmit = async () => {
    if (!codeInput.trim()) return;
    setCheckingCode(true);
    setCodeError(null);
    const code = codeInput.trim();
    const { ok, json } = await fetchPublic(code);
    setCheckingCode(false);
    if (!ok || json.requiresCode) { setCodeError(json.error || "Incorrect access code"); return; }
    setNeedsCode(false);
    applyLoadedData(json);
    writePinGatedCache(cacheKey, code, json);
    setLoading(false);
  };

  // Only ever called from editable (mode="internal") UI, where entityId is
  // always provided -- public mode never renders the buttons that call these.
  const addBudgetLine = async (line: { category: string; label: string; budgetedAmount: number; xeroAccountCode?: string | null }) => {
    setSavingLine(true);
    await fetch("/api/finance-model/budget-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityId, ...line }),
    });
    await load();
    setSavingLine(false);
  };

  const deleteBudgetLine = async (id: string) => {
    if (!confirm("Remove this budget line?")) return;
    await fetch(`/api/finance-model/budget-lines?id=${id}`, { method: "DELETE" });
    await load();
  };

  const handleAddLine = async () => {
    const amount = parseFloat(newLine.budgetedAmount);
    if (!newLine.label.trim() || !Number.isFinite(amount)) return;
    await addBudgetLine({
      category: newLine.category,
      label: newLine.label.trim(),
      budgetedAmount: amount,
      xeroAccountCode: newLine.xeroAccountCode.trim() || null,
    });
    setNewLine({ category: "Acquisition", label: "", budgetedAmount: "", xeroAccountCode: "" });
    setAddingLine(false);
  };

  const handleAddStampDuty = async () => {
    setStampDutyError(null);
    const price = parseFloat(stampDutyPrice);
    if (!stampDutyState || !Number.isFinite(price) || price <= 0) {
      setStampDutyError("Enter a state and a purchase price.");
      return;
    }
    try {
      const duty = calculateStampDuty(stampDutyState, price);
      await addBudgetLine({ category: "Acquisition", label: `Stamp duty (${stampDutyState})`, budgetedAmount: duty });
      setShowStampDuty(false);
    } catch (err) {
      setStampDutyError(err instanceof Error ? err.message : "Failed to calculate stamp duty");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-400 py-10 justify-center">
        <Loader2 size={14} className="animate-spin" /> Loading finance model...
      </div>
    );
  }

  if (needsCode) {
    return (
      <div className="bg-white border border-slate-200 rounded-[32px] p-8 text-center max-w-sm mx-auto">
        <Lock size={28} className="text-indigo-600 mx-auto mb-3" />
        <p className="text-[13px] font-bold text-slate-700 mb-1">{pageTitle || "Finance Model"}</p>
        <p className="text-[12px] text-slate-400 mb-4">Enter the access code to view this page.</p>
        <input
          value={codeInput}
          onChange={e => setCodeInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCodeSubmit()}
          placeholder="Access code"
          className="w-full text-center text-[13px] border border-slate-200 rounded-full px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-100 mb-2"
        />
        {codeError && <p className="text-[11px] text-rose-500 mb-2">{codeError}</p>}
        <button
          onClick={handleCodeSubmit}
          disabled={checkingCode || !codeInput.trim()}
          className="w-full bg-indigo-600 text-white rounded-full py-2.5 text-[12px] font-bold disabled:opacity-40"
        >
          {checkingCode ? <Loader2 size={13} className="animate-spin mx-auto" /> : "View"}
        </button>
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
        <button onClick={load} className="inline-flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline">
          <RefreshCw size={11} /> Try again
        </button>
      </div>
    );
  }

  const income = transactions.filter(t => t.type === "income");
  const expenses = transactions.filter(t => t.type === "expense");
  const incomeTotal = income.reduce((sum, t) => sum + t.total, 0);
  const expenseTotal = expenses.reduce((sum, t) => sum + t.total, 0);
  const budgetedTotal = budgetLines.reduce((sum, l) => sum + l.budgeted_amount, 0);
  const actualTotal = budgetLines.reduce((sum, l) => sum + (l.actual ?? 0), 0);

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
      {!connected && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 text-[12px] text-amber-700">
          Not linked to a Xero organisation yet -- budget lines below can still be tracked, but there's no actual data to compare against.
          {editable && (
            <a href="/dashboard/admin?tab=xero" className="inline-flex items-center gap-1 font-bold ml-1 hover:underline">
              Go to Admin → Xero <ExternalLink size={10} />
            </a>
          )}
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-slate-400">
          {tenantName ? `Live from Xero — ${tenantName}` : embedded ? "Finance Model" : "Not connected to Xero"}
        </p>
        <div className="flex items-center gap-4">
          {connected && (
            <p className="text-[12px] font-bold text-slate-700">
              Net: <span className={incomeTotal - expenseTotal >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(incomeTotal - expenseTotal)}</span>
            </p>
          )}
          {connected && (
            <button onClick={load} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600">
              <RefreshCw size={11} /> Refresh
            </button>
          )}
          {editable && entityId && (
            <button onClick={() => setShowShare(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
              <Share2 size={11} /> Share
            </button>
          )}
        </div>
      </div>

      {editable && entityId && showShare && <SharePanel entityId={entityId} />}

      {/* Budget vs Actual */}
      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Budget vs Actual</p>
          {editable && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowStampDuty(v => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
              >
                <Landmark size={11} /> Add stamp duty
              </button>
              <button
                onClick={() => setAddingLine(v => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
              >
                <Plus size={11} /> Add budget line
              </button>
            </div>
          )}
        </div>

        {showStampDuty && (
          <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">State</label>
              <select
                value={stampDutyState}
                onChange={e => setStampDutyState(e.target.value as AuState)}
                className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700"
              >
                <option value="">Select...</option>
                {properties.length > 0
                  ? [...new Set(properties.map(p => p.state).filter(Boolean))].map(s => <option key={s} value={s!}>{s}</option>)
                  : AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Purchase price</label>
              <input
                type="number"
                value={stampDutyPrice}
                onChange={e => setStampDutyPrice(e.target.value)}
                placeholder="0.00"
                className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36"
              />
            </div>
            <button
              onClick={handleAddStampDuty}
              disabled={savingLine}
              className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40"
            >
              {savingLine ? <Loader2 size={11} className="animate-spin" /> : "Calculate & add"}
            </button>
            <button onClick={() => { setShowStampDuty(false); setStampDutyError(null); }} className="text-slate-300 hover:text-slate-600">
              <X size={14} />
            </button>
            {stampDutyError && <p className="w-full text-[11px] text-rose-500">{stampDutyError}</p>}
          </div>
        )}

        {addingLine && (
          <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Category</label>
              <select
                value={newLine.category}
                onChange={e => setNewLine(p => ({ ...p, category: e.target.value }))}
                className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Label</label>
              <input
                value={newLine.label}
                onChange={e => setNewLine(p => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Slab & frame"
                className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-44"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Budgeted amount</label>
              <input
                type="number"
                value={newLine.budgetedAmount}
                onChange={e => setNewLine(p => ({ ...p, budgetedAmount: e.target.value }))}
                placeholder="0.00"
                className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-32"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Xero account code (optional)</label>
              <input
                value={newLine.xeroAccountCode}
                onChange={e => setNewLine(p => ({ ...p, xeroAccountCode: e.target.value }))}
                placeholder="e.g. 429"
                className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-28"
              />
            </div>
            <button
              onClick={handleAddLine}
              disabled={savingLine}
              className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40"
            >
              {savingLine ? <Loader2 size={11} className="animate-spin" /> : "Add"}
            </button>
            <button onClick={() => setAddingLine(false)} className="text-slate-300 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
        )}

        {budgetLines.length === 0 ? (
          <p className="text-[12px] text-slate-400 px-6 py-4">No budget lines yet.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-left text-slate-400 text-[9px] font-bold uppercase tracking-widest">
                <th className="px-6 py-2 font-bold">Category</th>
                <th className="px-2 py-2 font-bold">Label</th>
                <th className="px-2 py-2 font-bold text-right">Budgeted</th>
                <th className="px-2 py-2 font-bold text-right">Actual</th>
                <th className="px-2 py-2 font-bold text-right">Variance</th>
                {editable && <th className="px-6 py-2 font-bold"></th>}
              </tr>
            </thead>
            <tbody>
              {budgetLines.map(line => {
                const variance = line.actual == null ? null : line.actual - line.budgeted_amount;
                return (
                  <tr key={line.id} className="border-t border-slate-50 hover:bg-slate-50/60">
                    <td className="px-6 py-2 text-slate-500">{line.category}</td>
                    <td className="px-2 py-2 text-slate-700 font-medium">{line.label}</td>
                    <td className="px-2 py-2 text-right text-slate-700">{money(line.budgeted_amount)}</td>
                    <td className="px-2 py-2 text-right text-slate-700">{line.actual == null ? "—" : money(line.actual)}</td>
                    <td className={`px-2 py-2 text-right font-medium ${variance == null ? "text-slate-300" : variance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                      {variance == null ? "—" : `${variance > 0 ? "+" : ""}${money(variance)}`}
                    </td>
                    {editable && (
                      <td className="px-6 py-2 text-right">
                        <button onClick={() => deleteBudgetLine(line.id)} className="text-slate-300 hover:text-rose-500">
                          <X size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 font-bold">
                <td className="px-6 py-2 text-slate-700" colSpan={2}>Total</td>
                <td className="px-2 py-2 text-right text-slate-700">{money(budgetedTotal)}</td>
                <td className="px-2 py-2 text-right text-slate-700">{money(actualTotal)}</td>
                <td className={`px-2 py-2 text-right ${actualTotal - budgetedTotal > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                  {actualTotal - budgetedTotal > 0 ? "+" : ""}{money(actualTotal - budgetedTotal)}
                </td>
                {editable && <td />}
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Raw transaction detail */}
      {connected && (
        <>
          <Section title="Income" rows={income} total={incomeTotal} tone="income" />
          <Section title="Expenses" rows={expenses} total={expenseTotal} tone="expense" />
        </>
      )}
    </div>
  );
}
