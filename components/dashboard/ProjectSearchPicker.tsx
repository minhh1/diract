"use client";

// Project search + Starred/Recent lists, extracted from
// FinanceModelSearchWidget.tsx so the Residual Land Solver's "link to a
// project" flow can reuse the exact same picker UX. Search goes through
// app/api/projects/search/route.ts (access-mode enforced via
// lib/projectAccess.ts -- NOT RelationPicker.tsx, which queries `projects`
// directly with no filtering); recents/stars persist per-user
// (finance_model_project_recents/_stars) and are deliberately shared by
// every caller -- they're "projects I work with" lists, not per-widget
// state. Selecting records a recent before invoking onSelect.
import { useEffect, useRef, useState } from "react";
import { Search, Loader2, Star, Clock } from "lucide-react";

export interface ProjectOption {
  id: string;
  name: string;
  status: string | null;
}

function StarButton({ starred, onToggle }: { starred: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle(); }}
      className={starred ? "text-amber-400 hover:text-amber-500" : "text-slate-200 hover:text-amber-400"}
      title={starred ? "Unstar" : "Star"}
    >
      <Star size={13} fill={starred ? "currentColor" : "none"} />
    </button>
  );
}

export default function ProjectSearchPicker({ onSelect, placeholder = "Search a project..." }: { onSelect: (p: ProjectOption) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [recents, setRecents] = useState<ProjectOption[]>([]);
  const [starred, setStarred] = useState<ProjectOption[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const starredIds = new Set(starred.map(p => p.id));

  const loadLists = async () => {
    const [rRes, sRes] = await Promise.all([
      fetch("/api/finance-model/recent-projects"),
      fetch("/api/finance-model/starred-projects"),
    ]);
    const rJson = await rRes.json().catch(() => ({}));
    const sJson = await sRes.json().catch(() => ({}));
    setRecents(rJson.projects || []);
    setStarred(sJson.projects || []);
  };

  useEffect(() => { loadLists(); }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/projects/search?q=${encodeURIComponent(query)}`);
      const json = await res.json().catch(() => ({}));
      setResults(json.projects || []);
      setSearching(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const selectProject = (p: ProjectOption) => {
    setOpen(false);
    fetch("/api/finance-model/recent-projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id }),
    }).then(loadLists);
    onSelect(p);
  };

  const toggleStar = async (p: ProjectOption) => {
    if (starredIds.has(p.id)) {
      setStarred(prev => prev.filter(s => s.id !== p.id));
      await fetch(`/api/finance-model/starred-projects?projectId=${p.id}`, { method: "DELETE" });
    } else {
      setStarred(prev => [p, ...prev]);
      await fetch("/api/finance-model/starred-projects", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id }),
      });
    }
  };

  return (
    <div className="relative space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full text-[13px] border border-slate-200 rounded-full pl-10 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-100"
        />
        {searching && <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 animate-spin" />}
      </div>

      {open && query.trim() && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-lg max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-[12px] text-slate-400 px-4 py-3">{searching ? "Searching..." : "No projects found."}</p>
          ) : (
            results.map(p => (
              <div key={p.id} onClick={() => selectProject(p)} className="w-full text-left px-4 py-2.5 text-[12px] text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer">
                <span className="font-medium flex-1 truncate">{p.name}</span>
                {p.status && <span className="text-[10px] text-slate-400">{p.status}</span>}
                <StarButton starred={starredIds.has(p.id)} onToggle={() => toggleStar(p)} />
              </div>
            ))
          )}
        </div>
      )}

      {!query.trim() && (starred.length > 0 || recents.length > 0) && (
        <div className="space-y-3">
          {starred.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Star size={10} /> Starred</p>
              <div className="space-y-1">
                {starred.map(p => (
                  <div key={p.id} onClick={() => selectProject(p)} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-xl hover:bg-slate-100 cursor-pointer">
                    <span className="text-[12px] font-medium text-slate-700 flex-1 truncate">{p.name}</span>
                    <StarButton starred onToggle={() => toggleStar(p)} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {recents.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><Clock size={10} /> Recent</p>
              <div className="space-y-1">
                {recents.filter(p => !starredIds.has(p.id)).map(p => (
                  <div key={p.id} onClick={() => selectProject(p)} className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 rounded-xl hover:bg-slate-100 cursor-pointer">
                    <span className="text-[12px] font-medium text-slate-700 flex-1 truncate">{p.name}</span>
                    <StarButton starred={false} onToggle={() => toggleStar(p)} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
