"use client";

// The Finance Model's Overview subtab -- Budget vs Actual, the stamp duty
// calculator, and public-link sharing. Internal/authenticated only (the
// public share link renders a read-only version of this same data
// directly from PublicFinanceModelContent's public-mode branch, not this
// component -- see that file's header comment for why sharing doesn't
// extend to the Transactions/Timeline/Loans subtabs).
import { useEffect, useState } from "react";
import { Loader2, ExternalLink, RefreshCw, Plus, X, Landmark, Share2, Copy, Check, Trash2 } from "lucide-react";
import { calculateStampDuty, AU_STATES, type AuState } from "@/lib/stampDuty";
import BudgetVsActualTable, { type BudgetLine } from "./BudgetVsActualTable";

const CATEGORIES = ["Acquisition", "Construction", "Professional Fees", "Finance Costs", "Contingency", "Revenue", "Other"] as const;

interface PropertyInfo {
  id: string;
  street_address: string;
  state: string | null;
  purchase_price: number | null;
}

interface SharePage {
  id: string;
  title: string;
  access_code: string | null;
  is_active: boolean;
  created_at: string;
}

function SharePanel({ projectId }: { projectId: string }) {
  const [pages, setPages] = useState<SharePage[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("Finance Model");
  const [accessCode, setAccessCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/finance-model-pages?projectId=${projectId}`);
    const json = await res.json();
    setPages((json.pages || []).filter((p: SharePage) => p.is_active));
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const create = async () => {
    if (!title.trim()) return;
    setCreating(true);
    await fetch("/api/finance-model-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title: title.trim(), accessCode: accessCode.trim() || undefined }),
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

export default function OverviewSubtab({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [showStampDuty, setShowStampDuty] = useState(false);
  const [newLine, setNewLine] = useState({ category: "Acquisition" as string, label: "", budgetedAmount: "", xeroAccountCode: "" });
  const [stampDutyPrice, setStampDutyPrice] = useState("");
  const [stampDutyState, setStampDutyState] = useState<AuState | "">("");
  const [stampDutyError, setStampDutyError] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance-model/overview?projectId=${projectId}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to load"); return; }
      setConnected(!!json.connected);
      setBudgetLines(json.budgetLines || []);
      setProperty(json.property || null);
      if (json.property?.state) setStampDutyState(json.property.state as AuState);
      if (json.property?.purchase_price) setStampDutyPrice(String(json.property.purchase_price));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [projectId]);

  const addBudgetLine = async (line: { category: string; label: string; budgetedAmount: number; xeroAccountCode?: string | null }) => {
    setSavingLine(true);
    await fetch("/api/finance-model/budget-lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...line }),
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
      {!connected && (
        <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 text-[12px] text-amber-700">
          Not linked to an accounting connection yet -- budget lines below can still be tracked, and actuals can be entered manually or synced later in the Transactions tab.
          <a href="/dashboard/admin?tab=xero" className="inline-flex items-center gap-1 font-bold ml-1 hover:underline">
            Go to Admin → Xero <ExternalLink size={10} />
          </a>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] text-slate-400">{property?.street_address || "Finance Model"}</p>
        <button onClick={() => setShowShare(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
          <Share2 size={11} /> Share
        </button>
      </div>

      {showShare && <SharePanel projectId={projectId} />}

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Budget vs Actual</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowStampDuty(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
              <Landmark size={11} /> Add stamp duty
            </button>
            <button onClick={() => setAddingLine(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
              <Plus size={11} /> Add budget line
            </button>
          </div>
        </div>

        {showStampDuty && (
          <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">State</label>
              <select value={stampDutyState} onChange={e => setStampDutyState(e.target.value as AuState)} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
                <option value="">Select...</option>
                {property?.state ? <option value={property.state}>{property.state}</option> : AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Purchase price</label>
              <input type="number" value={stampDutyPrice} onChange={e => setStampDutyPrice(e.target.value)} placeholder="0.00" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-36" />
            </div>
            <button onClick={handleAddStampDuty} disabled={savingLine} className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40">
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
              <select value={newLine.category} onChange={e => setNewLine(p => ({ ...p, category: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Label</label>
              <input value={newLine.label} onChange={e => setNewLine(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Slab & frame" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-44" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Budgeted amount</label>
              <input type="number" value={newLine.budgetedAmount} onChange={e => setNewLine(p => ({ ...p, budgetedAmount: e.target.value }))} placeholder="0.00" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-32" />
            </div>
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Xero account code (optional)</label>
              <input value={newLine.xeroAccountCode} onChange={e => setNewLine(p => ({ ...p, xeroAccountCode: e.target.value }))} placeholder="e.g. 429" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-28" />
            </div>
            <button onClick={handleAddLine} disabled={savingLine} className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40">
              {savingLine ? <Loader2 size={11} className="animate-spin" /> : "Add"}
            </button>
            <button onClick={() => setAddingLine(false)} className="text-slate-300 hover:text-slate-600">
              <X size={14} />
            </button>
          </div>
        )}

        <BudgetVsActualTable budgetLines={budgetLines} editable onDelete={deleteBudgetLine} />
      </div>
    </div>
  );
}
