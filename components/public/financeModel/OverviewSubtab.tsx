"use client";

// The Finance Model's Overview subtab -- Budget vs Actual and public-link
// sharing. The stamp duty / title fee calculator lives in its own Duty &
// Fees subtab (components/public/financeModel/DutyFeesSubtab.tsx) -- this
// tab just links there. Internal/authenticated only (the public share
// link renders a read-only version of this same data directly from
// PublicFinanceModelContent's public-mode branch, not this component --
// see that file's header comment for why sharing doesn't extend to the
// Transactions/Timeline/Loans/Duty & Fees subtabs).
import { useEffect, useState } from "react";
import { Loader2, ExternalLink, RefreshCw, Plus, X, Calculator, Share2, Copy, Check, Trash2, Settings } from "lucide-react";
import BudgetVsActualTable, { type BudgetLine } from "./BudgetVsActualTable";

interface BudgetCategory {
  id: string;
  name: string;
  kind: "Revenue" | "Cost";
  is_creditable: boolean;
  display_order: number;
}

function CategoriesPanel({ onChanged }: { onChanged: () => void }) {
  const [categories, setCategories] = useState<BudgetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/finance-model/budget-categories");
    const json = await res.json();
    setCategories(json.categories || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await fetch("/api/finance-model/budget-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
    setNewName("");
    await load();
    onChanged();
    setSaving(false);
  };

  const toggleCreditable = async (cat: BudgetCategory) => {
    setCategories(prev => prev.map(c => c.id === cat.id ? { ...c, is_creditable: !c.is_creditable } : c));
    await fetch("/api/finance-model/budget-categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cat.id, isCreditable: !cat.is_creditable }),
    });
  };

  const remove = async (cat: BudgetCategory) => {
    if (!confirm(`Delete category "${cat.name}"? Existing budget lines keep their category text, but it won't appear in the picklist anymore.`)) return;
    setCategories(prev => prev.filter(c => c.id !== cat.id));
    await fetch(`/api/finance-model/budget-categories?id=${cat.id}`, { method: "DELETE" });
    onChanged();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-[32px] p-6 space-y-3">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Budget categories</p>

      {loading ? (
        <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading...</p>
      ) : (
        <div className="space-y-1.5">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl">
              <p className="text-[12px] font-medium text-slate-700 flex-1">{cat.name}</p>
              <span className="text-[10px] text-slate-400">{cat.kind}</span>
              {cat.kind === "Cost" && (
                <label className="flex items-center gap-1.5 text-[10px] text-slate-500">
                  <input type="checkbox" checked={cat.is_creditable} onChange={() => toggleCreditable(cat)} />
                  GST creditable
                </label>
              )}
              {cat.kind === "Cost" && (
                <button onClick={() => remove(cat)} className="p-1 text-slate-300 hover:text-rose-500" title="Delete">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-3 pt-2 border-t border-slate-100">
        <div>
          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">New cost category</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Landscaping" className="text-[12px] border border-slate-200 rounded-xl px-3 py-1.5 bg-white w-48" />
        </div>
        <button onClick={add} disabled={saving || !newName.trim()} className="text-[11px] font-bold bg-indigo-600 text-white rounded-xl px-4 py-1.5 disabled:opacity-40">
          {saving ? <Loader2 size={11} className="animate-spin" /> : "Add"}
        </button>
      </div>
    </div>
  );
}

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

export default function OverviewSubtab({ projectId, onOpenDutyFees }: { projectId: string; onOpenDutyFees?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [property, setProperty] = useState<PropertyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [newLine, setNewLine] = useState({ category: "", label: "", budgetedAmount: "", xeroAccountCode: "" });
  const [showShare, setShowShare] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const loadCategories = async () => {
    const res = await fetch("/api/finance-model/budget-categories");
    const json = await res.json();
    const cats = json.categories || [];
    setCategories(cats);
    setNewLine(p => (p.category ? p : { ...p, category: cats[0]?.name || "" }));
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [res] = await Promise.all([fetch(`/api/finance-model/overview?projectId=${projectId}`), loadCategories()]);
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Failed to load"); return; }
      setConnected(!!json.connected);
      setBudgetLines(json.budgetLines || []);
      setProperty(json.property || null);
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
    setNewLine({ category: categories[0]?.name || "", label: "", budgetedAmount: "", xeroAccountCode: "" });
    setAddingLine(false);
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
        <div className="flex items-center gap-4">
          <button onClick={() => setShowCategories(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
            <Settings size={11} /> Categories
          </button>
          <button onClick={() => setShowShare(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
            <Share2 size={11} /> Share
          </button>
        </div>
      </div>

      {showCategories && <CategoriesPanel onChanged={loadCategories} />}
      {showShare && <SharePanel projectId={projectId} />}

      <div className="bg-white border border-slate-200 rounded-[32px] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Budget vs Actual</p>
          <div className="flex items-center gap-3">
            {onOpenDutyFees && (
              <button onClick={onOpenDutyFees} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
                <Calculator size={11} /> Stamp duty & fees
              </button>
            )}
            <button onClick={() => setAddingLine(v => !v)} className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline">
              <Plus size={11} /> Add budget line
            </button>
          </div>
        </div>

        {addingLine && (
          <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-100 flex flex-wrap items-end gap-3">
            <div>
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Category</label>
              <select value={newLine.category} onChange={e => setNewLine(p => ({ ...p, category: e.target.value }))} className="text-[12px] border border-slate-200 rounded-xl px-2 py-1.5 bg-white text-slate-700">
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
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
