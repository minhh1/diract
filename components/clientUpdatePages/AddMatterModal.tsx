// components/clientUpdatePages/AddMatterModal.tsx
// Search + multi-select (checkboxes) matter picker -- adds every checked
// matter to the given group in one go, rather than one click per matter.
"use client";

import { useState } from "react";
import { X, Search, Loader2, Check } from "lucide-react";

interface MatterOption { id: string; name: string; description: string | null; }

export default function AddMatterModal({ pageId, groupId, onClose, onAdded }: {
  pageId: string; groupId: string | null; onClose: () => void; onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<MatterOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async (query: string) => {
    setQ(query);
    if (query.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/client-update-pages/matters/search?q=${encodeURIComponent(query)}`);
    const json = await res.json();
    setSearching(false);
    setResults(json.matters || []);
  };

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const addSelected = async () => {
    if (!selected.size) return;
    setAdding(true);
    setError(null);
    const results = await Promise.all([...selected].map(projectId =>
      fetch(`/api/client-update-pages/${pageId}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, groupId }),
      })
    ));
    setAdding(false);
    const failed = results.filter(r => !r.ok).length;
    if (failed) { setError(`${failed} matter${failed === 1 ? "" : "s"} could not be added (already on this page?)`); }
    if (failed < results.length) onAdded();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-3 shrink-0">
          <h3 className="text-[13px] font-bold text-slate-800">Add matters</h3>
          <button onClick={onClose} title="Close" className="p-1 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="px-6 pb-3 shrink-0">
          <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-full">
            <Search size={14} className="text-slate-300" />
            <input value={q} onChange={e => search(e.target.value)} placeholder="Search by name or matter number..." autoFocus
              className="flex-1 text-[13px] outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 space-y-1">
          {searching && <p className="text-[11px] text-slate-300 text-center py-4">Searching...</p>}
          {!searching && q.trim().length >= 2 && results.length === 0 && (
            <p className="text-[11px] text-slate-300 text-center py-4">No matches</p>
          )}
          {results.map(r => {
            const checked = selected.has(r.id);
            return (
              <button key={r.id} onClick={() => toggle(r.id)}
                className={`w-full flex items-center gap-3 text-left px-4 py-2.5 rounded-2xl transition-colors ${checked ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${checked ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                  {checked && <Check size={11} className="text-white" />}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-slate-700 truncate">{r.name}</p>
                  {r.description && <p className="text-[10px] text-slate-400 truncate">{r.description}</p>}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 space-y-2">
          {error && <p className="text-[11px] text-red-500">{error}</p>}
          <button onClick={addSelected} disabled={!selected.size || adding}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {adding ? <Loader2 size={14} className="animate-spin" /> : `Add ${selected.size || ""} matter${selected.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
