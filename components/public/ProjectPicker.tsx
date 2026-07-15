// components/public/ProjectPicker.tsx
// Searchable project picker (by name and/or matter number) for the public
// task page. Filters an already-loaded project catalog client-side — no
// network round trip per keystroke, which is what made this feel slow when
// it hit a search API on every character typed.
"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X } from "lucide-react";

export interface PickedProject { id: string; name: string; matterNumber: string | null; }

interface Props {
  projects: PickedProject[];
  value: PickedProject | null;
  onChange: (project: PickedProject | null) => void;
  label?: string;
}

const MAX_RESULTS = 20;

export default function ProjectPicker({ projects, value, onChange, label = "Project *" }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches = projects.filter(p =>
      p.name.toLowerCase().includes(q) || (p.matterNumber || "").toLowerCase().includes(q)
    );
    return matches.slice(0, MAX_RESULTS);
  }, [query, projects]);

  if (value) {
    return (
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
        <div className="flex items-center gap-2 px-4 py-2.5 border border-indigo-200 bg-indigo-50 rounded-full">
          <span className="flex-1 text-[13px] text-slate-800 font-medium truncate">
            {value.name}{value.matterNumber ? ` — ${value.matterNumber}` : ""}
          </span>
          <button onClick={() => onChange(null)} className="text-indigo-400 hover:text-red-500 shrink-0"><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="relative">
        <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search by project name or matter number..."
          className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-full text-[13px] outline-none focus:border-indigo-400"
        />
      </div>
      {open && query.trim() && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-lg max-h-56 overflow-y-auto">
          {results.length === 0 && <p className="px-4 py-3 text-[12px] text-slate-300 italic">No projects found</p>}
          {results.map(p => (
            <button key={p.id} type="button"
              onClick={() => { onChange(p); setQuery(""); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
              <p className="text-[12px] font-medium text-slate-800">{p.name}</p>
              {p.matterNumber && <p className="text-[10px] text-slate-400">{p.matterNumber}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
