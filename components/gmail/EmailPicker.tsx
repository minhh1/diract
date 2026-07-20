// components/gmail/EmailPicker.tsx
// Searchable dropdown for picking a connected Gmail account from a list —
// used wherever a flat list of buttons would get unwieldy for companies
// with a lot of staff (source-of-truth emails, archive accounts).
"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Plus, Mail } from "lucide-react";

interface Props {
  label: string;
  options: string[]; // emails available to pick (already-selected ones excluded by the caller)
  onSelect: (email: string) => void;
  placeholder?: string;
  emptyText?: string;
  accent?: "indigo" | "purple";
}

const ACCENT_CLASSES = {
  indigo: { ring: "focus:ring-indigo-100", hoverBg: "hover:bg-indigo-50", hoverIcon: "group-hover:text-indigo-500", hoverText: "group-hover:text-indigo-700" },
  purple: { ring: "focus:ring-purple-100", hoverBg: "hover:bg-purple-50", hoverIcon: "group-hover:text-purple-500", hoverText: "group-hover:text-purple-700" },
};

export default function EmailPicker({ label, options, onSelect, placeholder, emptyText, accent = "indigo" }: Props) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const a = ACCENT_CLASSES[accent];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = options.filter(e => e.toLowerCase().includes(query.toLowerCase()));

  if (!options.length) {
    return (
      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
        <p className="text-[11px] text-slate-400 italic px-1">{emptyText || "No connected accounts available."}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <div className="relative">
        <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder || "Search connected accounts..."}
          className={`w-full bg-white border border-slate-200 rounded-full py-2.5 pl-10 pr-4 text-[12px] font-medium outline-none focus:ring-4 ${a.ring}`}
        />
      </div>
      {open && (
        <div className="absolute z-10 mt-1.5 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-lg py-1.5">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-slate-400 px-4 py-2.5">No matching connected accounts</p>
          ) : (
            filtered.map(email => (
              <button
                key={email}
                onClick={() => { onSelect(email); setQuery(""); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left group ${a.hoverBg}`}
              >
                <Mail size={13} className={`text-slate-400 shrink-0 ${a.hoverIcon}`} />
                <span className={`text-[12px] font-medium text-slate-600 flex-1 truncate ${a.hoverText}`}>{email}</span>
                <Plus size={13} className={`text-slate-300 shrink-0 ${a.hoverIcon}`} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
