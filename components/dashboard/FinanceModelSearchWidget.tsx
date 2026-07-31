"use client";

// The "Finance Model search" dashboard widget -- search any project the
// signed-in viewer has access to (app/api/projects/search/route.ts,
// enforced via lib/projectAccess.ts's getAccessibleProjectIds; NOT
// components/dashboard/RelationPicker.tsx, which queries `projects`
// directly with no access_mode filtering) and view its Finance Model
// inline. Session-local -- the picked project isn't persisted in the
// widget's config, so it resets to a fresh search on next page load (see
// lib/dashboardWidgets/types.ts's FinanceModelWidget doc comment).
import { useEffect, useRef, useState } from "react";
import { Search, ArrowLeft, Loader2 } from "lucide-react";
import PublicFinanceModelContent from "@/components/public/PublicFinanceModelContent";

interface ProjectOption {
  id: string;
  name: string;
  status: string | null;
}

export default function FinanceModelSearchWidget() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProjectOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectOption | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await fetch(`/api/projects/search?q=${encodeURIComponent(query)}`);
      const json = await res.json().catch(() => ({}));
      setResults(json.projects || []);
      setSearching(false);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  if (selected) {
    return (
      <div className="space-y-3">
        <button onClick={() => setSelected(null)} className="flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 hover:underline">
          <ArrowLeft size={12} /> {selected.name}
        </button>
        <PublicFinanceModelContent projectId={selected.id} mode="internal" embedded />
      </div>
    );
  }

  return (
    <div className="relative">
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

      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-lg max-h-72 overflow-y-auto">
          {results.length === 0 ? (
            <p className="text-[12px] text-slate-400 px-4 py-3">{searching ? "Searching..." : "No projects found."}</p>
          ) : (
            results.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelected(p); setOpen(false); }}
                className="w-full text-left px-4 py-2.5 text-[12px] text-slate-700 hover:bg-slate-50 flex items-center justify-between"
              >
                <span className="font-medium">{p.name}</span>
                {p.status && <span className="text-[10px] text-slate-400">{p.status}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
