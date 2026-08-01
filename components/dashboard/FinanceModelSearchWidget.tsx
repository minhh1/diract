"use client";

// The "Finance Model search" dashboard widget -- search any project the
// signed-in viewer has access to (app/api/projects/search/route.ts,
// enforced via lib/projectAccess.ts's getAccessibleProjectIds; NOT
// components/dashboard/RelationPicker.tsx, which queries `projects`
// directly with no access_mode filtering) and view its Finance Model
// inline. The picked project itself is still session-local (reopening
// the widget starts from the search/Recent/Starred view again), but
// which projects were recently viewed and which are starred now persist
// per-user (finance_model_project_recents/_stars) so returning users
// don't have to re-search every time.
//
// Also backs the "Residual Land Solver" widget (variant
// "residual_land_solver") -- identical search/Recent/Starred UX, but the
// picked project renders its Residual Land Value Solver
// (components/public/ResidualLandSolverContent.tsx) instead of the full
// Finance Model. Recents/stars are deliberately shared between the two
// variants: they're per-user "projects I work with" lists, not
// per-widget state.
import { useEffect, useRef, useState } from "react";
import { Search, ArrowLeft, Loader2, Star, Clock } from "lucide-react";
import PublicFinanceModelContent from "@/components/public/PublicFinanceModelContent";
import ResidualLandSolverContent from "@/components/public/ResidualLandSolverContent";

interface ProjectOption {
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

export default function FinanceModelSearchWidget({ variant = "finance_model" }: { variant?: "finance_model" | "residual_land_solver" }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectOption | null>(null);
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
    setSelected(p);
    setOpen(false);
    fetch("/api/finance-model/recent-projects", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: p.id }),
    }).then(loadLists);
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

  if (selected) {
    return (
      <div className="space-y-3">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline">
          <ArrowLeft size={12} /> {selected.name}
        </button>
        {variant === "residual_land_solver"
          ? <ResidualLandSolverContent projectId={selected.id} />
          : <PublicFinanceModelContent projectId={selected.id} mode="internal" embedded />}
      </div>
    );
  }

  return (
    <div className="relative space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search a project..."
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
