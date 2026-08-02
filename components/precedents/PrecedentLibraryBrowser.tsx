// components/precedents/PrecedentLibraryBrowser.tsx
// Browse the whole precedent library: search, filter by the taxonomy, and
// preview the document itself.
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
  PenSquare, Search, X, AlertTriangle, Loader2, FileText, Filter, Settings2, Download, Briefcase,
} from "lucide-react";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { suggestAutoFill, type BindableField } from "@/lib/precedents/suggestAutoFill";
import { useCompany } from "@/components/CompanyContext";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { isFormSection, formLabelPrefix } from "@/lib/precedents/courtFormLayout";
import { stripStyleMarkers } from "@/lib/precedents/deedDocx";

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
  uses_letterhead: boolean | null;
  // body_template is deliberately absent -- the list endpoint doesn't return
  // it (too heavy); PreviewModal fetches it per-precedent on open.
}

// The company's letterhead, as returned by GET /api/precedents/letterhead.
// detected_fields are the roles lib/precedents/letterheadClassify.ts found in
// it (our_ref, date, salutation, ...) -- what the letterhead supplies around
// the precedent's own body.
interface Letterhead {
  original_filename: string;
  detected_fields: { role: string; options?: string[] }[] | null;
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

  // Company-wide, so it's fetched once here rather than per preview.
  const [letterhead, setLetterhead] = useState<Letterhead | null>(null);

  const load = useCallback(async () => {
    const [res, lhRes] = await Promise.all([
      fetch("/api/precedents?recordTable=projects"),
      fetch("/api/precedents/letterhead"),
    ]);
    const json = await res.json();
    setPrecedents(json.precedents || []);
    setLetterhead(await lhRes.json().then(j => j.letterhead || null).catch(() => null));
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
          className="flex items-center gap-2 px-4 py-2 bg-slate-50 border border-slate-200 rounded-full text-[11px] font-bold text-slate-600 hover:bg-slate-100 transition-colors"
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
            placeholder="Search by name, description or content..."
            className="w-full bg-slate-50 border border-slate-200 rounded-full pl-10 pr-4 py-2.5 text-[12px] outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        {/* min-w keeps the button the same width once the count appears, so
            selecting a filter doesn't resize the search box beside it. */}
        <button
          onClick={() => setShowFilters(p => !p)}
          className={`flex items-center justify-center gap-2 min-w-[104px] px-4 py-2.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
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

      {preview && (
        <PreviewModal key={preview.id} precedent={preview} letterhead={letterhead} onClose={() => setPreview(null)} />
      )}
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
            className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors ${
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

// One rendered line of the document: inline runs of text and fill-in fields.
type Inline =
  | { kind: "text"; text: string }
  | { kind: "field"; seg: Extract<BodyTemplateSegment, { type: "field" }> };

// Segments are a flat run of text and fields with newlines living inside the
// text; the document has to be laid out as paragraphs, so split on newline
// and keep fields attached to the line they fall on.
function toLines(segments: BodyTemplateSegment[]): Inline[][] {
  const lines: Inline[][] = [[]];
  for (const raw of segments) {
    // A deed marks each paragraph's Word style with a control-character
    // marker meant for the .docx renderer. It is invisible in a browser, so
    // left in place it shows the style name as if it were part of the text --
    // "HLHeading Parties". Strip it here; the styling it carries is applied
    // when the document is generated from the firm's deed template.
    const seg: BodyTemplateSegment =
      raw.type === "text" ? { ...raw, text: stripStyleMarkers(raw.text) } : raw;
    if (seg.type === "field") {
      lines[lines.length - 1].push({ kind: "field", seg });
      continue;
    }
    const parts = (seg.text || "").split("\n");
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ kind: "text", text: part });
    });
  }
  return lines;
}

// The library writes section headings as standalone all-caps lines ("SCOPE OF
// WORK", "PAYMENT DETAILS"). A trailing colon means it's a label introducing
// a value on the same line ("AMOUNT REQUIRED:"), not a heading.
function isHeading(line: Inline[]): boolean {
  if (line.some(p => p.kind === "field")) return false;
  const t = line.map(p => (p.kind === "text" ? p.text : "")).join("").trim();
  if (!t || t.length > 60 || t.endsWith(":")) return false;
  return /[A-Z]/.test(t) && t === t.toUpperCase();
}

// Tight padding: a wider chip leaves a visible gap before the following full
// stop, which reads as a typo in something meant to show layout.
/**
 * Picks a matter to use this precedent on.
 *
 * The library is reached without a matter in hand -- that's the point of it --
 * but issuing a document needs one, because the issue pipeline resolves the
 * client, the matter reference and the signers from it. So rather than
 * duplicating the issue flow here, this hands off to the matter's own
 * Precedents tab with the precedent already selected.
 */
function MatterPickerModal({
  precedent, onClose,
}: {
  precedent: Precedent;
  onClose: () => void;
}) {
  const { companyId } = useCompany();
  const router = useRouter();
  const [matters, setMatters] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    supabase
      .from("projects")
      .select("id, name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (cancelled) return;
        setMatters(data || []);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [companyId]);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? matters.filter(m => (m.name || "").toLowerCase().includes(needle))
    : matters;

  return (
    <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-slate-100">
          <p className="text-[14px] font-bold text-slate-800">Use on a matter</p>
          <p className="text-[11px] text-slate-400 mt-1">{precedent.name}</p>
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search matters..."
            className="mt-4 w-full bg-slate-50 border border-slate-200 rounded-full px-4 py-2 text-[12px] outline-none focus:ring-4 focus:ring-indigo-100"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <p className="flex items-center justify-center gap-2 text-[11px] text-slate-400 py-10">
              <Loader2 size={12} className="animate-spin" /> Loading matters&hellip;
            </p>
          ) : !shown.length ? (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest py-10">
              No matters match
            </p>
          ) : (
            shown.map(m => (
              <button
                key={m.id}
                onClick={() => router.push(`/dashboard/projects?id=${m.id}&precedent=${precedent.id}`)}
                className="w-full text-left px-4 py-2.5 rounded-2xl text-[12px] text-slate-700 hover:bg-indigo-50/60 transition-colors"
              >
                {m.name || "(untitled matter)"}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** The line as plain text, with fields standing in as their label. */
function linePlainText(line: Inline[]): string {
  return line.map(p => (p.kind === "text" ? p.text : p.seg.label)).join("").trim();
}

/**
 * Everything after the first colon, keeping field chips intact -- the value
 * side of a form's label/value row.
 */
function renderValueAfterColon(line: Inline[]) {
  const out: React.ReactNode[] = [];
  let seenColon = false;
  line.forEach((p, j) => {
    if (p.kind === "field") {
      if (seenColon) out.push(<FieldChip key={j} seg={p.seg} />);
      return;
    }
    if (seenColon) { out.push(<span key={j}>{p.text}</span>); return; }
    const idx = p.text.indexOf(":");
    if (idx >= 0) {
      seenColon = true;
      const rest = p.text.slice(idx + 1);
      if (rest.trim()) out.push(<span key={j}>{rest.trimStart()}</span>);
    }
  });
  return out;
}

function FieldChip({ seg }: { seg: Extract<BodyTemplateSegment, { type: "field" }> }) {
  return (
    <span
      title={seg.autoFillFieldId ? "Pre-fills from the matter" : "Filled in when issued"}
      className={`inline rounded px-0.5 font-bold ${
        seg.autoFillFieldId ? "bg-emerald-100 text-emerald-800" : "bg-indigo-100 text-indigo-800"
      }`}
    >
      {seg.label}
    </span>
  );
}

// A slot the letterhead fills in, as opposed to a fill-in field in the body.
// Amber so it reads as "this comes from the letterhead / the issue form", not
// as something typed into the precedent itself.
function SlotChip({ label }: { label: string }) {
  return (
    <span className="inline rounded px-0.5 font-bold bg-amber-100 text-amber-800">{label}</span>
  );
}

// What each letterhead role contributes to the letter. Roles come from
// lib/precedents/letterheadClassify.ts, detected per company when the
// letterhead was uploaded -- a firm whose letterhead has no Our Ref line
// simply has no our_ref role, and that row doesn't render.
const ROLE_SLOTS: Record<string, { prefix?: string; label: string; bold?: boolean }> = {
  our_ref: { prefix: "Our Ref: ", label: "Matter reference" },
  date: { label: "Date of issue" },
  delivery_mode: { label: "Delivery mode" },
  recipient_name: { label: "Recipient name" },
  address: { label: "Recipient address" },
  salutation: { label: "Salutation" },
  subject: { label: "Subject", bold: true },
  closing: { label: "Yours faithfully," },
};

// Roles in the order the letterhead lays them out. detected_fields is built
// in paragraph order by applyClassification, so it already carries that
// order; address isn't in it (it's a core tag, not a detected field), and it
// belongs with the recipient, so it's spliced in.
function letterheadRows(detected: { role: string; options?: string[] }[]): { role: string; options?: string[] }[] {
  const rows = [...detected];
  const hasAddress = rows.some(r => r.role === "address");
  if (!hasAddress) {
    const at = rows.findIndex(r => r.role === "recipient_name");
    const before = rows.findIndex(r => r.role === "salutation");
    const insertAt = at >= 0 ? at + 1 : before >= 0 ? before : rows.length;
    rows.splice(insertAt, 0, { role: "address" });
  }
  // closing sits below the body in the finished letter, so it's rendered
  // after it rather than with the header rows.
  return rows.filter(r => ROLE_SLOTS[r.role] && r.role !== "closing");
}

// Renders the template the way the issued document reads: Arial, 10pt body,
// 12pt bold headings, on a page rather than in a code block. Matches the
// letterhead the firm uploaded (its content paragraphs are sz=20, i.e. 10pt),
// so what a solicitor sees here is what comes out of the printer.
//
// The body is shown inside the letterhead's own scaffold -- Our Ref, date,
// delivery mode, recipient, salutation, subject above it; closing and signoff
// below -- because that's the document that actually gets sent. The header
// art itself lives in the .docx and isn't reproduced here; the band at the
// top stands in for it.
function DocumentPreview({
  segments, letterhead, usesLetterhead,
}: {
  segments: BodyTemplateSegment[];
  letterhead: Letterhead | null;
  usesLetterhead: boolean;
}) {
  const lines = toLines(segments);
  const rows = usesLetterhead && letterhead ? letterheadRows(letterhead.detected_fields || []) : [];

  return (
    <div
      className="bg-white border border-slate-200 rounded-2xl px-8 py-7 text-slate-900"
      style={{ fontFamily: "Arial, Helvetica, sans-serif", fontSize: "10pt", lineHeight: 1.45 }}
    >
      {!usesLetterhead ? (
        // Court documents, deeds and prescribed forms carry their own heading
        // (a statement of claim starts with COURT DETAILS, not the firm's
        // logo), so no letterhead scaffold is drawn around them.
        <div className="mb-6 py-3 border-b border-dashed border-slate-200 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-300">
            Not on letterhead &mdash; this document carries its own heading
          </p>
        </div>
      ) : letterhead ? (
        <>
          <div className="mb-6 py-3 border-b border-dashed border-slate-200 text-center">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-300">
              {letterhead.original_filename} &mdash; letterhead header
            </p>
          </div>
          {rows.map(r => {
            const slot = ROLE_SLOTS[r.role];
            return (
              <p key={r.role} style={{ margin: "0 0 6pt", fontSize: slot.bold ? "12pt" : undefined, fontWeight: slot.bold ? 700 : undefined }}>
                {slot.prefix}
                <SlotChip label={r.options?.length ? `${slot.label}: ${r.options.join(" / ")}` : slot.label} />
              </p>
            );
          })}
          <div style={{ height: "10pt" }} />
        </>
      ) : (
        <div className="mb-6 py-3 border-b border-dashed border-amber-200 text-center">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500">
            No letterhead uploaded &mdash; issued documents will have no header
          </p>
        </div>
      )}

      {lines.map((line, i) => {
        // A blank line is paragraph spacing, not an empty paragraph.
        if (!line.length) return <div key={i} style={{ height: "10pt" }} />;

        // Court documents are laid out as the approved forms are -- shaded
        // section bars and two-column label/value rows -- using the same
        // classification the .docx renderer uses, so the preview and the
        // downloaded file agree. See lib/precedents/courtFormLayout.ts.
        if (!usesLetterhead) {
          const plain = linePlainText(line);
          if (isFormSection(plain)) {
            return (
              <div key={i} className="bg-slate-200/70 border border-slate-300 px-3 py-1.5 mt-4 mb-2">
                <span style={{ fontSize: "12pt", fontWeight: 700 }}>{plain}</span>
              </div>
            );
          }
          const label = formLabelPrefix(plain);
          if (label) {
            return (
              <div key={i} className="flex border-b border-slate-200">
                <div className="w-1/3 shrink-0 px-3 py-1.5">{label}</div>
                <div className="flex-1 px-3 py-1.5">{renderValueAfterColon(line)}</div>
              </div>
            );
          }
        }

        const heading = isHeading(line);
        return (
          <p
            key={i}
            style={
              heading
                ? { fontSize: "12pt", fontWeight: 700, margin: "14pt 0 6pt" }
                : { margin: 0 }
            }
          >
            {line.map((p, j) =>
              p.kind === "text" ? <span key={j}>{p.text}</span> : <FieldChip key={j} seg={p.seg} />
            )}
          </p>
        );
      })}

      {/* Only correspondence signs off this way. A statement of claim ends
          with its own signature and verification blocks, which are part of
          the prescribed form and so are written into the body itself.
          A letterhead with its own closing line supplies that wording, so
          it's shown as a slot rather than guessed at; otherwise
          contentXml.ts composes "Yours faithfully," and that is what prints. */}
      {usesLetterhead && (
        <>
          <div style={{ height: "14pt" }} />
          <p style={{ margin: "0 0 14pt" }}>
            {letterhead && (letterhead.detected_fields || []).some(f => f.role === "closing")
              ? <SlotChip label="Closing (from letterhead)" />
              : "Yours faithfully,"}
          </p>
          <p style={{ margin: 0 }}><SlotChip label="Signing solicitor(s)" /></p>
        </>
      )}
    </div>
  );
}

// Which matter field each fill-in field pulls from. The library ships its
// fields unbound because it can't know what a given firm called things, so
// this proposes a match (lib/precedents/suggestAutoFill.ts) and a human
// confirms it -- a wrong binding puts wrong text in a letter silently, which
// is worse than a blank the author notices.
function AutoFillSection({
  precedentId, segments, availableFields, isAdmin, onSaved,
}: {
  precedentId: string;
  segments: BodyTemplateSegment[];
  availableFields: BindableField[];
  isAdmin: boolean;
  onSaved: (t: { segments: BodyTemplateSegment[] }) => void;
}) {
  const fieldSegs = useMemo(
    () => segments.filter((s): s is Extract<BodyTemplateSegment, { type: "field" }> => s.type === "field"),
    [segments]
  );

  // key -> chosen custom field id ("" = not bound). Seeded from what's saved,
  // falling back to a suggestion so the common case is one click to accept.
  const initial = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of fieldSegs) {
      m[s.key] = s.autoFillFieldId || suggestAutoFill(s.label, availableFields)?.field.id || "";
    }
    return m;
  }, [fieldSegs, availableFields]);

  const [choice, setChoice] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const dirty = fieldSegs.some(s => (s.autoFillFieldId || "") !== (choice[s.key] || ""));
  const suggestedCount = fieldSegs.filter(s => !s.autoFillFieldId && choice[s.key]).length;

  const save = async () => {
    setSaving(true);
    const next = segments.map(s =>
      s.type === "field" ? { ...s, autoFillFieldId: choice[s.key] || null } : s
    );
    const res = await fetch(`/api/precedents/${precedentId}/body-template`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments: next }),
    });
    setSaving(false);
    if (res.ok) {
      onSaved({ segments: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (!fieldSegs.length) return null;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Auto-fill</p>
        {suggestedCount > 0 && (
          <p className="text-[9px] text-emerald-600 font-bold">{suggestedCount} suggested</p>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
        A bound field pre-fills from the matter when the document is issued, instead of being typed each time.
        Leave one unbound if no matter field holds that information.
      </p>

      <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
        {fieldSegs.map(s => {
          const isSuggestion = !s.autoFillFieldId && !!choice[s.key];
          return (
            <div key={s.key} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[11px] font-bold text-slate-700 flex-1 min-w-0 truncate">{s.label}</span>
              {isSuggestion && (
                <span className="text-[9px] font-bold text-emerald-600 shrink-0">suggested</span>
              )}
              <select
                value={choice[s.key] || ""}
                disabled={!isAdmin}
                onChange={e => setChoice(c => ({ ...c, [s.key]: e.target.value }))}
                className="text-[11px] border border-slate-200 rounded-full px-3 py-1.5 bg-white max-w-[220px] disabled:text-slate-400 disabled:bg-slate-50"
              >
                <option value="">Typed in each time</option>
                {availableFields.map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {isAdmin ? (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors"
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {saving ? "Saving" : "Save auto-fill"}
          </button>
          {saved && <span className="text-[10px] font-bold text-emerald-600">Saved</span>}
        </div>
      ) : (
        <p className="text-[10px] text-slate-400 mt-3">Only a company admin can change these bindings.</p>
      )}
    </div>
  );
}

// Read-only preview. Shows what the precedent actually contains: the
// drafting instructions that steer the AI, and the body template with its
// fill-in fields made visible rather than rendered as prose -- a solicitor
// deciding whether to use a precedent wants to see where the gaps are.
function PreviewModal({
  precedent, letterhead, onClose,
}: {
  precedent: Precedent;
  letterhead: Letterhead | null;
  onClose: () => void;
}) {
  // Fetched per-preview rather than with the list: body_template is by far the
  // heaviest column (~500KB across a seeded library), and the list only needs
  // it for whichever one precedent the user actually opens.
  const [template, setTemplate] = useState<{ segments: BodyTemplateSegment[] } | null>(null);
  const [availableFields, setAvailableFields] = useState<BindableField[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(true);
  const [pickingMatter, setPickingMatter] = useState(false);
  const { isAdmin } = useCompany();

  // No setLoadingTemplate(true) here: the modal is keyed on the precedent id
  // by its parent, so a different precedent remounts with the initial state.
  // The same call returns the company's bindable matter fields, so the
  // auto-fill section costs no extra round trip.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/precedents/${precedent.id}/body-template`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        setTemplate(json.template || null);
        setAvailableFields(json.availableFields || []);
      })
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setPickingMatter(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors"
              title="Choose a matter and issue this precedent on it"
            >
              <Briefcase size={13} /> Use on a matter
            </button>
            {segments.length > 0 && (
              <a
                href={`/api/precedents/${precedent.id}/download`}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors"
                title="Download as a Word document on the firm's letterhead, with blanks to fill in"
              >
                <Download size={13} /> Word
              </a>
            )}
            <button onClick={onClose} className="p-1"><X size={18} className="text-slate-400" /></button>
          </div>
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
              <DocumentPreview
                segments={segments}
                letterhead={letterhead}
                usesLetterhead={precedent.uses_letterhead !== false}
              />
            )}
          </div>

          {segments.length > 0 && (
            <AutoFillSection
              precedentId={precedent.id}
              segments={segments}
              availableFields={availableFields}
              isAdmin={isAdmin}
              onSaved={setTemplate}
            />
          )}

          <p className="text-[10px] text-slate-300 leading-relaxed">
            Precedents are a starting point. Adapt to the matter and check anything jurisdiction-specific before
            it goes out.
          </p>
        </div>
      </div>

      {pickingMatter && (
        <MatterPickerModal precedent={precedent} onClose={() => setPickingMatter(false)} />
      )}
    </div>
  );
}
