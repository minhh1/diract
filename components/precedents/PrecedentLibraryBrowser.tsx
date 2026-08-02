// components/precedents/PrecedentLibraryBrowser.tsx
// Browse the whole precedent library: search, filter by the taxonomy, and
// preview a precedent's drafting instructions and fill-in fields.
//
// Distinct from PrecedentsTab.tsx, which is scoped to one matter and exists
// to ISSUE a document. This is for finding out what the firm has -- before a
// matter exists, or to check whether something needs writing.
//
// Filters are derived from the data rather than hardcoded, so a firm that
// adds its own categories or jurisdictions sees them here without any change
// to this file.
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  PenSquare, Search, X, AlertTriangle, Loader2, FileText, Filter, Settings2,
} from "lucide-react";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";

interface Precedent {
  id: string;
  name: string;
  description: string | null;
  ai_instructions: string | null;
  category: string | null;
  subcategory: string | null;
  jurisdictions: string[] | null;
  matter_types: string[] | null;
  document_type: string | null;
  requires_review: boolean | null;
  review_note: string | null;
  library_key: string | null;
  // body_template is deliberately absent -- the list endpoint doesn't return
  // it (too heavy); PreviewModal fetches it per-precedent on open.
}

const UNCATEGORISED = "Other";

const DOC_TYPE_LABELS: Record<string, string> = {
  letter: "Letter",
  advice: "Advice",
  court_document: "Court document",
  deed: "Deed / agreement",
  form: "Form",
  file_note: "File note",
};

export default function PrecedentLibraryBrowser() {
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [jurisdiction, setJurisdiction] = useState<string | null>(null);
  const [docType, setDocType] = useState<string | null>(null);
  const [preview, setPreview] = useState<Precedent | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents?recordTable=projects");
    const json = await res.json();
    setPrecedents(json.precedents || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  // Derived from the data, so a firm's own categories appear automatically.
  const { categories, jurisdictions, docTypes } = useMemo(() => {
    const c = new Set<string>();
    const j = new Set<string>();
    const d = new Set<string>();
    for (const p of precedents) {
      c.add(p.category || UNCATEGORISED);
      (p.jurisdictions || []).forEach(x => j.add(x));
      if (p.document_type) d.add(p.document_type);
    }
    return {
      categories: [...c].sort(),
      // Fixed order rather than alphabetical -- reads as a map of Australia.
      jurisdictions: ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"].filter(x => j.has(x)),
      docTypes: [...d].sort(),
    };
  }, [precedents]);

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => precedents.filter(p => {
    if (category && (p.category || UNCATEGORISED) !== category) return false;
    // A precedent with no jurisdictions applies everywhere, so it survives a
    // jurisdiction filter rather than being hidden by it -- filtering to NSW
    // should show NSW-specific documents PLUS everything that applies in NSW.
    if (jurisdiction && p.jurisdictions?.length && !p.jurisdictions.includes(jurisdiction)) return false;
    if (docType && p.document_type !== docType) return false;
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q) ||
      (p.subcategory || "").toLowerCase().includes(q) ||
      (p.ai_instructions || "").toLowerCase().includes(q)
    );
  }), [precedents, category, jurisdiction, docType, q]);

  const grouped = useMemo(() => {
    const map = new Map<string, Precedent[]>();
    for (const p of filtered) {
      const key = p.category || UNCATEGORISED;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const activeFilterCount = [category, jurisdiction, docType].filter(Boolean).length;
  const clearFilters = () => { setCategory(null); setJurisdiction(null); setDocType(null); };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 size={20} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-light uppercase tracking-tight text-slate-900">Precedents</h1>
          <p className="text-[11px] text-slate-400 mt-1">
            {precedents.length} precedent{precedents.length === 1 ? "" : "s"}{" "}in the firm&apos;s library
          </p>
        </div>
        <Link
          href="/dashboard/settings?view=precedents"
          className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-all"
        >
          <Settings2 size={14} /> Manage library
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, description or drafting instructions..."
            className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-[12px] outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        <button
          onClick={() => setShowFilters(p => !p)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all ${
            activeFilterCount ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Filter size={13} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-[28px] p-6 space-y-4">
          <FilterRow label="Practice area" options={categories} value={category} onChange={setCategory} />
          {jurisdictions.length > 0 && (
            <FilterRow
              label="Jurisdiction"
              options={jurisdictions}
              value={jurisdiction}
              onChange={setJurisdiction}
              hint="Also shows precedents that apply in every state"
            />
          )}
          <FilterRow
            label="Document type"
            options={docTypes}
            value={docType}
            onChange={setDocType}
            labelFor={v => DOC_TYPE_LABELS[v] || v}
          />
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors">
              Clear all filters
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 font-bold">
        {filtered.length} of {precedents.length} shown
      </p>

      {filtered.length === 0 && (
        <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-16">
          Nothing matches
        </p>
      )}

      <div className="space-y-4">
        {grouped.map(([categoryName, items]) => (
          <div key={categoryName} className="bg-white border border-slate-200 rounded-[28px] overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-3.5 bg-slate-50/60 border-b border-slate-100">
              <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">{categoryName}</span>
              <span className="text-[10px] text-slate-400 ml-auto">{items.length}</span>
            </div>
            <div className="p-3 space-y-1.5">
              {items.map(p => (
                <button
                  key={p.id}
                  onClick={() => setPreview(p)}
                  className="w-full flex items-center gap-3 p-3.5 bg-slate-50/60 hover:bg-indigo-50/60 rounded-[18px] text-left transition-colors"
                >
                  <PenSquare size={15} className="text-amber-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[12.5px] font-bold text-slate-800">{p.name}</p>
                      {p.jurisdictions?.length ? (
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[9px] font-bold">
                          {p.jurisdictions.join(" / ")}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-bold">
                          All states
                        </span>
                      )}
                      {p.document_type && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-bold">
                          {DOC_TYPE_LABELS[p.document_type] || p.document_type}
                        </span>
                      )}
                      {p.requires_review && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold">
                          <AlertTriangle size={9} /> Check before use
                        </span>
                      )}
                    </div>
                    {p.description && <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>}
                  </div>
                  <FileText size={14} className="text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {preview && <PreviewModal key={preview.id} precedent={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function FilterRow({
  label, options, value, onChange, labelFor, hint,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  labelFor?: (v: string) => string;
  hint?: string;
}) {
  if (!options.length) return null;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        {hint && <p className="text-[9px] text-slate-300">{hint}</p>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(value === opt ? null : opt)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all ${
              value === opt ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
            }`}
          >
            {labelFor ? labelFor(opt) : opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// Read-only preview. Shows what the precedent actually contains: the
// drafting instructions that steer the AI, and the body template with its
// fill-in fields made visible rather than rendered as prose -- a solicitor
// deciding whether to use a precedent wants to see where the gaps are.
function PreviewModal({ precedent, onClose }: { precedent: Precedent; onClose: () => void }) {
  // Fetched per-preview rather than with the list: body_template is by far the
  // heaviest column (~500KB across a seeded library), and the list only needs
  // it for whichever one precedent the user actually opens.
  const [template, setTemplate] = useState<{ segments: BodyTemplateSegment[] } | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  // No setLoadingTemplate(true) here: the modal is keyed on the precedent id
  // by its parent, so a different precedent remounts with the initial state.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/precedents/${precedent.id}/body-template`)
      .then(r => r.json())
      .then(json => { if (!cancelled) setTemplate(json.template || null); })
      .catch(() => { if (!cancelled) setTemplate(null); })
      .finally(() => { if (!cancelled) setLoadingTemplate(false); });
    return () => { cancelled = true; };
  }, [precedent.id]);

  const segments = template?.segments || [];
  const fieldCount = segments.filter(s => s.type === "field").length;

  return (
    <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-100 px-7 py-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-slate-800">{precedent.name}</p>
            {precedent.description && <p className="text-[11px] text-slate-400 mt-1">{precedent.description}</p>}
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {precedent.category && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold">
                  {precedent.category}{precedent.subcategory ? ` · ${precedent.subcategory}` : ""}
                </span>
              )}
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold">
                {precedent.jurisdictions?.length ? precedent.jurisdictions.join(" / ") : "All states"}
              </span>
              {precedent.document_type && (
                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-[9px] font-bold">
                  {DOC_TYPE_LABELS[precedent.document_type] || precedent.document_type}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 p-1"><X size={18} className="text-slate-400" /></button>
        </div>

        <div className="px-7 py-6 space-y-6">
          {precedent.requires_review && (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-amber-800">
                <AlertTriangle size={12} /> Check before use
              </p>
              {precedent.review_note && (
                <p className="text-[11px] text-amber-700 mt-1.5 leading-relaxed">{precedent.review_note}</p>
              )}
            </div>
          )}

          {precedent.ai_instructions && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Drafting approach</p>
              <p className="text-[12px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                {precedent.ai_instructions}
              </p>
            </div>
          )}

          <div>
            <div className="flex items-baseline gap-2 mb-2">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Document</p>
              {fieldCount > 0 && (
                <p className="text-[9px] text-slate-300">{fieldCount} fill-in field{fieldCount === 1 ? "" : "s"}</p>
              )}
            </div>
            {loadingTemplate ? (
              <p className="flex items-center gap-2 text-[11px] text-slate-400">
                <Loader2 size={12} className="animate-spin" /> Loading template&hellip;
              </p>
            ) : segments.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic leading-relaxed">
                No fixed template. This precedent is drafted from the instructions above and the brief given at
                issue time &mdash; used for long-form documents where a fill-in template would not help.
              </p>
            ) : (
              <div className="bg-slate-50 rounded-2xl p-5 text-[12px] leading-relaxed whitespace-pre-wrap font-mono">
                {segments.map((s, i) =>
                  s.type === "text" ? (
                    <span key={i} className="text-slate-700">{s.text}</span>
                  ) : (
                    <span
                      key={i}
                      title={s.autoFillFieldId ? "Pre-fills from the matter" : "Filled in when issued"}
                      className={`inline-block px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-bold not-italic ${
                        s.autoFillFieldId
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-indigo-100 text-indigo-700"
                      }`}
                    >
                      {s.label}{s.autoFillFieldId ? " (auto)" : ""}
                    </span>
                  )
                )}
              </div>
            )}
          </div>

          <p className="text-[10px] text-slate-300 leading-relaxed">
            Precedents are a starting point. Adapt to the matter and check anything jurisdiction-specific before
            it goes out. To issue this on a matter, open the matter and use its Precedents tab.
          </p>
        </div>
      </div>
    </div>
  );
}
