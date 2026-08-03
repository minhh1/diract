// components/dashboard/tabs/PrecedentsTab.tsx
// The "Precedent" record tab (Matters): the firm's precedent library (see
// app/api/precedents, managed from Settings → Precedents) with an "Issue"
// action per document that drafts content from a staff prompt via
// app/api/precedents/[id]/issue, plus this matter's own issuance history and
// an optional per-matter override of the firm's formatting defaults (see
// app/api/precedents/settings).
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { PenSquare, Loader2, X, Sparkles, Download, Settings2, Check, FileOutput, Search, ChevronDown, AlertTriangle, Calendar } from "lucide-react";
import type { BodyTemplateSegment } from "@/lib/precedents/bodyTemplateDetect";
import { useCompany } from "@/components/CompanyContext";
import PrecedentLibraryTopUp from "@/components/precedents/PrecedentLibraryTopUp";

interface Props {
  recordId: string;
  companyId: string;
  /**
   * Set when the user arrived from the precedent library's "Use on a matter".
   * Opens that precedent's issue modal straight away, so the hand-off lands on
   * the document they picked rather than on the list.
   */
  initialPrecedentId?: string | null;
}

interface Precedent {
  id: string;
  name: string;
  description: string | null;
  // Library taxonomy (null for anything a firm typed in by hand before the
  // library existed) -- see lib/precedents/library/ and
  // supabase/migrations/20260802180000_precedent_library.sql.
  category: string | null;
  subcategory: string | null;
  jurisdictions: string[] | null;
  matter_types: string[] | null;
  document_type: string | null;
  requires_review: boolean | null;
  review_note: string | null;
  // When this precedent's own content was last prepared/edited (see
  // supabase/migrations/20260803000000_precedents_updated_at.sql) -- shown
  // so a precedent that hasn't been touched in a long time (law changes,
  // outdated wording) is obvious before relying on it for a real matter.
  updated_at: string;
}

const UNCATEGORISED = "Other";

interface Issuance {
  id: string;
  precedentId: string;
  precedentName: string;
  subjectLine: string | null;
  createdAt: string;
  hasDocx: boolean;
}

export default function PrecedentsTab({ recordId, initialPrecedentId }: Props) {
  const { isAdmin } = useCompany();
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [issuances, setIssuances] = useState<Issuance[]>([]);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState<Precedent | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [matterType, setMatterType] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // The library ships hundreds of precedents but a given matter only ever
  // needs a handful, so the default view is scoped to this matter's own
  // matter_type. "Show all" is the escape hatch for the times it isn't.
  const [showAll, setShowAll] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Fires once per mount, not once per list refresh.
  const openedDeepLink = useRef(false);

  const load = useCallback(async () => {
    const [precRes, issRes] = await Promise.all([
      fetch(`/api/precedents?recordTable=projects&projectId=${recordId}`),
      fetch(`/api/precedents/issuances?projectId=${recordId}`),
    ]);
    const precJson = await precRes.json();
    const issJson = await issRes.json();
    const list: Precedent[] = precJson.precedents || [];
    setPrecedents(list);
    setMatterType(precJson.matterType ?? null);
    setIssuances(issJson.issuances || []);
    setLoading(false);
    // Only on the first load: if the user came in via a deep link, open that
    // precedent. Guarded by openedDeepLink so reloading the list after an
    // issuance doesn't reopen the modal they just closed.
    if (initialPrecedentId && !openedDeepLink.current) {
      openedDeepLink.current = true;
      const target = list.find(p => p.id === initialPrecedentId);
      if (target) { setShowAll(true); setIssuing(target); }
    }
  }, [recordId, initialPrecedentId]);

  useEffect(() => { load(); }, [load]);

  const toggleSection = (name: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  // A precedent with no matter_types applies to any matter (client care,
  // debt recovery and so on), so it always shows -- only an explicitly
  // scoped one gets filtered out.
  const matchesMatter = (p: Precedent) =>
    showAll || !matterType || !p.matter_types?.length || p.matter_types.includes(matterType);

  const q = search.trim().toLowerCase();
  const matchesSearch = (p: Precedent) =>
    !q ||
    p.name.toLowerCase().includes(q) ||
    (p.description || "").toLowerCase().includes(q) ||
    (p.category || "").toLowerCase().includes(q) ||
    (p.subcategory || "").toLowerCase().includes(q);

  // Searching should look across the whole library, not just what the
  // matter-type filter happens to leave visible -- otherwise a staff member
  // searching for a document they know exists gets nothing back.
  const visible = precedents.filter(p => (q ? matchesSearch(p) : matchesMatter(p)));
  const hiddenByScope = precedents.length - visible.length;

  const grouped = new Map<string, Precedent[]>();
  for (const p of visible) {
    const key = p.category || UNCATEGORISED;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }

  if (loading) return null;

  return (
    <div className="space-y-8 animate-in fade-in p-1">
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Precedents</p>
          <button onClick={() => setShowSettings(true)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors">
            <Settings2 size={13} /> Customize for this matter
          </button>
        </div>
        <PrecedentLibraryTopUp isAdmin={isAdmin} variant="banner" onInstalled={load} className="mb-3" />
        {precedents.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search precedents..."
                className="w-full bg-slate-50 border border-slate-200 rounded-full pl-9 pr-4 py-2 text-[12px] outline-none focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            {matterType && !q && (
              <button
                onClick={() => setShowAll(p => !p)}
                className={`px-3.5 py-2 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
                  showAll ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {showAll ? `All (${precedents.length})` : `${matterType} only`}
              </button>
            )}
          </div>
        )}

        <div className="space-y-3">
          {precedents.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-8">
              No precedents set up yet. An admin can add some in Settings → Precedents
            </p>
          )}
          {precedents.length > 0 && visible.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-8">
              {q ? "No precedents match your search" : "Nothing scoped to this matter type"}
            </p>
          )}

          {[...grouped.entries()].map(([categoryName, items]) => {
            const isCollapsed = collapsed.has(categoryName);
            return (
              <div key={categoryName} className="bg-white border border-slate-200 rounded-[24px] overflow-hidden">
                <button
                  onClick={() => toggleSection(categoryName)}
                  className="w-full flex items-center gap-2 px-5 py-3.5 hover:bg-slate-50/60 transition-colors"
                >
                  <ChevronDown size={13} className={`text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-widest">{categoryName}</span>
                  <span className="text-[10px] text-slate-400 ml-auto">{items.length}</span>
                </button>
                {!isCollapsed && (
                  <div className="px-3 pb-3 space-y-1.5">
                    {items.map(p => (
                      <div key={p.id} className="flex items-center gap-3 p-3.5 bg-slate-50/60 rounded-[18px]">
                        <PenSquare size={15} className="text-amber-600 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[12.5px] font-bold text-slate-800">{p.name}</p>
                            {p.jurisdictions?.length && (
                              <span className="px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded-full text-[9px] font-bold">
                                {p.jurisdictions.join(" / ")}
                              </span>
                            )}
                            {/* So a precedent that hasn't been touched in a
                                while is visible before relying on it for a
                                real matter -- law changes, outdated wording. */}
                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-bold">
                              <Calendar size={9} /> Prepared {new Date(p.updated_at).toLocaleDateString('en-AU')}
                            </span>
                            {/* Court filings are scaffolds, not known-current
                                prescribed forms -- surfaced here rather than
                                left as an undocumented assumption. */}
                            {p.requires_review && (
                              <span
                                title={p.review_note || "Verify against the current prescribed form before use"}
                                className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold"
                              >
                                <AlertTriangle size={9} /> Check before use
                              </span>
                            )}
                          </div>
                          {p.description && <p className="text-[11px] text-slate-400 mt-0.5">{p.description}</p>}
                        </div>
                        <button onClick={() => setIssuing(p)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors shrink-0">
                          <FileOutput size={13} /> Issue
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {!q && !showAll && hiddenByScope > 0 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-[11px] font-bold text-slate-400 hover:text-indigo-600 transition-colors"
            >
              Show {hiddenByScope} more precedent{hiddenByScope === 1 ? "" : "s"} from the full library
            </button>
          )}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Recently issued</p>
        <div className="space-y-2">
          {issuances.length === 0 && (
            <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-8">Nothing issued yet</p>
          )}
          {issuances.map(i => (
            <div key={i.id}
              className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-[20px] hover:border-indigo-300 transition-colors">
              <Download size={14} className="text-slate-400 shrink-0" />
              <a href={`/api/precedents/issuances/${i.id}/download`} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                <p className="text-[12px] font-bold text-slate-700 truncate">{i.subjectLine || i.precedentName}</p>
                <p className="text-[10px] text-slate-400">{i.precedentName} · {new Date(i.createdAt).toLocaleString('en-AU')}</p>
              </a>
              {/* Anything issued before the editable .docx was kept alongside the PDF stays PDF-only. */}
              {i.hasDocx && (
                <a href={`/api/precedents/issuances/${i.id}/download?format=docx`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-indigo-500 hover:text-indigo-700">
                  Word
                </a>
              )}
            </div>
          ))}
        </div>
      </div>

      {issuing && (
        <IssueModal precedent={issuing} recordId={recordId} onClose={() => setIssuing(null)}
          onIssued={() => { setIssuing(null); load(); }} />
      )}
      {showSettings && (
        <MatterSettingsModal projectId={recordId} onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

// ── Issue modal ───────────────────────────────────────────────────
// The default flow is entirely manual — you write the subject and body
// yourself, no AI involved. "Draft with AI" is a separate, optional assist
// that pre-fills those two fields from a brief for you to then review/edit;
// it never runs on its own as part of issuing. AI in this feature is
// otherwise only used to identify fields in an uploaded letterhead template
// (see Settings → Precedents → "Fields identified in this template").
// Salutation and Sign off both default to this matter's precedent_settings
// (see "Customize for this matter") but are editable per document here --
// not every letter in a matter is addressed the same way or signed by the
// same person.
// If this precedent has a body_template (auto-detected from uploaded example
// documents, see Settings → Precedents → "Body template"), the Body field
// defaults to a generated fill-in form instead of a blank textarea --
// "Write freeform instead" switches back to typing/AI-draft for the one-off
// letter that needs different wording than the detected boilerplate.
function IssueModal({ precedent, recordId, onClose, onIssued }: {
  precedent: Precedent; recordId: string; onClose: () => void; onIssued: () => void;
}) {
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [deliveryMode, setDeliveryMode] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ subject: string; url: string | null; docxUrl: string | null } | null>(null);
  // What lib/precedents/letterheadClassify.ts found in this firm's
  // letterhead beyond the always-present address/content/signoff tags --
  // only recipient_name and delivery_mode need input here, everything else
  // (Our Ref, date, salutation, subject) is filled automatically.
  const [detectedFields, setDetectedFields] = useState<{ role: string; options?: string[] }[]>([]);

  // Optional per-issuance overrides of the matter/company's precedent_settings
  // defaults -- who signs THIS document, and how it addresses the recipient.
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [signerIds, setSignerIds] = useState<string[]>([]);
  // Read-only here -- unlike signerIds above, this isn't something THIS
  // issuance can turn off (see supabase/migrations/
  // 20260803010000_precedent_settings_default_signer.sql), just shown so
  // whoever's issuing isn't surprised by a signature they never picked.
  const [defaultSignerId, setDefaultSignerId] = useState<string | null>(null);
  const [salutation, setSalutation] = useState("");

  // Optional AI drafting assist -- collapsed by default.
  const [showAiAssist, setShowAiAssist] = useState(false);
  const [brief, setBrief] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Subject-only AI drafting -- independent of the body assist above, informed
  // by the matter's own name/custom fields rather than a written brief.
  const [draftingSubject, setDraftingSubject] = useState(false);

  // Body template auto-detected from uploaded example documents (see
  // Settings → Precedents → "Body template"). When set, the Body field
  // defaults to this generated fill-in form instead of a blank textarea --
  // "Write freeform instead" switches back to today's exact typing/AI-draft
  // flow for the letters where the boilerplate doesn't fit.
  const [bodyTemplate, setBodyTemplate] = useState<BodyTemplateSegment[] | null>(null);
  const [useFreeform, setUseFreeform] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const usingTemplate = !!bodyTemplate && !useFreeform;

  useEffect(() => {
    fetch("/api/precedents/letterhead").then(res => res.json())
      .then(json => setDetectedFields(json.letterhead?.detected_fields || []));
    fetch(`/api/precedents/settings?projectId=${recordId}`).then(res => res.json())
      .then(json => {
        const settings = json.projectOverride || json.companyDefault;
        setSignerIds(settings?.signers || []);
        setDefaultSignerId(settings?.default_signer_id || null);
      });
    fetch("/api/precedents/staff-signoffs").then(res => res.json())
      .then(json => setStaff(json.staff || []));
    fetch(`/api/precedents/${precedent.id}/body-template?recordId=${recordId}`).then(res => res.json())
      .then(json => {
        setBodyTemplate(json.template?.segments || null);
        // Fields bound to an existing project field (see PrecedentsSettingsTab.tsx's
        // "Default from field" picker) start pre-filled from this record's own
        // data instead of blank -- still editable before issuing.
        if (json.fieldDefaults) setFieldValues((prev: Record<string, string>) => ({ ...json.fieldDefaults, ...prev }));
      });
  }, [recordId, precedent.id]);

  const needsRecipientName = detectedFields.some(f => f.role === "recipient_name");
  const deliveryModeField = detectedFields.find(f => f.role === "delivery_mode");

  const toggleSigner = (userId: string) => {
    const already = signerIds.includes(userId);
    if (!already && signerIds.length >= 4) return;
    setSignerIds(already ? signerIds.filter(id => id !== userId) : [...signerIds, userId]);
  };

  const handleDraftWithAi = async () => {
    if (!brief.trim()) { setDraftError("Describe what this document should say"); return; }
    setDrafting(true);
    setDraftError(null);
    const res = await fetch(`/api/precedents/${precedent.id}/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId, prompt: brief }),
    });
    const json = await res.json();
    setDrafting(false);
    if (!res.ok) { setDraftError(json.error || "Failed to draft"); return; }
    setSubject(json.subject || "");
    setBody(json.body || "");
  };

  const handleDraftSubjectWithAi = async () => {
    setDraftingSubject(true);
    setError(null);
    const res = await fetch(`/api/precedents/${precedent.id}/draft-subject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordId }),
    });
    const json = await res.json();
    setDraftingSubject(false);
    if (!res.ok) { setError(json.error || "Failed to draft a subject line"); return; }
    setSubject(json.subject || "");
  };

  const handleIssue = async () => {
    if (!recipientAddress.trim()) { setError("Enter the recipient's name and address"); return; }
    if (!subject.trim()) { setError("Enter a subject line"); return; }
    if (usingTemplate) {
      if (bodyTemplate!.some(s => s.type === "field" && !fieldValues[s.key]?.trim())) {
        setError("Fill in every field"); return;
      }
    } else if (!body.trim()) {
      setError("Write the document's body text"); return;
    }
    if (needsRecipientName && !recipientName.trim()) { setError("Enter the recipient's name"); return; }
    if (deliveryModeField && !deliveryMode) { setError("Select a delivery mode"); return; }
    setIssuing(true);
    setError(null);
    const res = await fetch(`/api/precedents/${precedent.id}/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordId, subject, prompt: brief, recipientAddress, recipientName, deliveryMode, salutation, signerIds,
        ...(usingTemplate ? { fieldValues } : { body }),
      }),
    });
    const json = await res.json();
    setIssuing(false);
    if (!res.ok) { setError(json.error || "Failed to issue document"); return; }
    setResult({ subject: json.subject, url: json.url, docxUrl: json.docxUrl ?? null });
  };

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-md mx-4 p-8 text-center space-y-4">
          <Check size={32} className="text-emerald-500 mx-auto" />
          <p className="text-[14px] font-bold text-slate-800">Document issued</p>
          <p className="text-[12px] text-slate-500">{result.subject}</p>
          {result.url && (
            <a href={result.url} target="_blank" rel="noopener noreferrer"
              className="block w-full py-3 bg-slate-900 text-white text-[12px] font-bold rounded-full hover:bg-slate-700">
              Open PDF
            </a>
          )}
          {/* The .docx the PDF was rendered from — a letter almost always
              needs one last edit before it goes out. */}
          {result.docxUrl && (
            <a href={result.docxUrl} target="_blank" rel="noopener noreferrer"
              className="block w-full py-3 border border-slate-200 text-slate-600 text-[12px] font-bold rounded-full hover:bg-slate-50">
              Download Word version
            </a>
          )}
          <button onClick={onIssued} className="w-full py-3 border border-slate-200 text-slate-600 text-[12px] font-bold rounded-full hover:bg-slate-50">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-t-[32px] sm:rounded-[32px] shadow-2xl w-full max-w-lg mx-0 sm:mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Issue: {precedent.name}</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
          {needsRecipientName && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Recipient name</p>
              <input value={recipientName} onChange={e => setRecipientName(e.target.value)}
                placeholder="e.g. Acme Pty Ltd"
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
            </div>
          )}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              {needsRecipientName ? "Address" : "Recipient"}
            </p>
            <textarea value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)} rows={3}
              placeholder={needsRecipientName ? "Attention: Jane Smith\n123 Example Street\nSuburb VIC 3000" : "Jane Smith\n123 Example Street\nSuburb VIC 3000"}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
          </div>
          {deliveryModeField && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Delivery mode</p>
              <select value={deliveryMode} onChange={e => setDeliveryMode(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400 bg-white">
                <option value="">Select...</option>
                {(deliveryModeField.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
          )}
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Salutation <span className="text-slate-300 normal-case font-normal">(optional, leave blank to use the default)</span>
            </p>
            <input value={salutation} onChange={e => setSalutation(e.target.value)}
              placeholder="e.g. Dear Mr Smith,"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Subject line</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleDraftSubjectWithAi} disabled={draftingSubject}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-40">
                  {draftingSubject ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Draft subject with AI
                </button>
                {!showAiAssist && !usingTemplate && (
                  <button type="button" onClick={() => setShowAiAssist(true)}
                    className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
                    <Sparkles size={11} /> Draft with AI instead
                  </button>
                )}
              </div>
            </div>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Update on your account"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
          </div>

          {showAiAssist && !usingTemplate && (
            <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl space-y-2">
              <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                <Sparkles size={11} /> Draft with AI
              </p>
              <p className="text-[10px] text-indigo-400">
                Describe what this document should say. The subject and body above will be pre-filled for you to review and edit before issuing.
              </p>
              <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={3}
                placeholder="e.g. Confirm the order has shipped and is expected to arrive within 5 business days..."
                className="w-full px-4 py-2.5 border border-indigo-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none bg-white" />
              {draftError && <p className="text-[11px] text-red-500">{draftError}</p>}
              <button type="button" onClick={handleDraftWithAi} disabled={drafting}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                {drafting ? <><Loader2 size={13} className="animate-spin" /> Drafting...</> : <><Sparkles size={13} /> Generate draft</>}
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Body</p>
              {bodyTemplate && (
                <button type="button" onClick={() => setUseFreeform(!useFreeform)}
                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700">
                  {useFreeform ? "Use template fields instead" : "Write freeform instead"}
                </button>
              )}
            </div>
            {usingTemplate ? (
              <div className="space-y-3">
                {bodyTemplate!.filter((s): s is Extract<BodyTemplateSegment, { type: "field" }> => s.type === "field").map(s => (
                  <div key={s.key}>
                    <p className="text-[10px] font-bold text-slate-500 mb-1">{s.label}</p>
                    <input value={fieldValues[s.key] || ""} onChange={e => setFieldValues({ ...fieldValues, [s.key]: e.target.value })}
                      placeholder={s.example || undefined}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
                  </div>
                ))}
              </div>
            ) : (
              <textarea value={body} onChange={e => setBody(e.target.value)} rows={8}
                placeholder="Write the document's content here..."
                className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
            )}
          </div>
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
              Sign off <span className="text-slate-300 normal-case font-normal">(up to 4, defaults to this matter's usual signers)</span>
            </p>
            {defaultSignerId && (
              <p className="text-[11px] text-slate-400 mb-2">
                + {staff.find(s => s.userId === defaultSignerId)?.name || staff.find(s => s.userId === defaultSignerId)?.accountName || "The default signer"}&apos;s signature is always included, whatever&apos;s picked below.
              </p>
            )}
            {staff.length === 0 ? (
              <p className="text-[11px] text-slate-300 italic">No staff signoffs set up yet. Add one in your profile</p>
            ) : (
              <div className="space-y-1.5">
                {staff.map(s => {
                  const checked = signerIds.includes(s.userId);
                  return (
                    <label key={s.userId} className={`flex items-center gap-3 px-3 py-2 rounded-2xl border cursor-pointer transition-colors ${checked ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="checkbox" checked={checked} disabled={!checked && signerIds.length >= 4}
                        onChange={() => toggleSigner(s.userId)} />
                      <span className="text-[12px] font-medium text-slate-700">{s.name || s.accountName}</span>
                      {s.position && <span className="text-[11px] text-slate-400">— {s.position}</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {error && <p className="text-[11px] text-red-500">{error}</p>}
        </div>
        <div className="px-8 py-5 border-t border-slate-100 shrink-0">
          <button onClick={handleIssue} disabled={issuing}
            className="w-full py-3 bg-indigo-600 text-white text-[12px] font-bold rounded-full hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {issuing ? <><Loader2 size={14} className="animate-spin" /> Issuing...</> : <><FileOutput size={14} /> Issue document</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Per-matter settings override ─────────────────────────────────
const SUBJECT_OPTIONS = [
  { value: "sentence_case", label: "Sentence case" },
  { value: "all_caps", label: "ALL CAPS" },
  { value: "with_re", label: "RE: prefix" },
] as const;
const SALUTATION_OPTIONS = [
  { value: "generic", label: "Dear Sir/Madam" },
  { value: "client_first_name", label: "Dear [First name]" },
  { value: "client_full_name", label: "Dear [Full name]" },
] as const;

interface StaffOption { userId: string; accountName: string; name: string; position: string; hasSignoff: boolean }
interface SettingsRow {
  subject_line_style: typeof SUBJECT_OPTIONS[number]["value"];
  date_format: string;
  salutation_style: typeof SALUTATION_OPTIONS[number]["value"];
  signers: string[]; // staff_signoffs user_ids, up to 4
  // Unlike signers, always included on every issued document for this
  // matter regardless of what's picked at issue time -- see
  // supabase/migrations/20260803010000_precedent_settings_default_signer.sql.
  default_signer_id: string | null;
  include_firm_reference: boolean;
}

function MatterSettingsModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [companyDefault, setCompanyDefault] = useState<SettingsRow | null>(null);
  const [override, setOverride] = useState<SettingsRow | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [settingsRes, staffRes] = await Promise.all([
      fetch(`/api/precedents/settings?projectId=${projectId}`),
      fetch("/api/precedents/staff-signoffs"),
    ]);
    const settingsJson = await settingsRes.json();
    const staffJson = await staffRes.json();
    setCompanyDefault(settingsJson.companyDefault || null);
    setOverride(settingsJson.projectOverride || null);
    setStaff(staffJson.staff || []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const effective: SettingsRow = override || companyDefault || {
    subject_line_style: "sentence_case", date_format: "D MMMM YYYY", salutation_style: "generic", signers: [], default_signer_id: null, include_firm_reference: false,
  };

  const save = async (next: SettingsRow) => {
    setOverride(next);
    setSaving(true);
    await fetch("/api/precedents/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        subjectLineStyle: next.subject_line_style,
        dateFormat: next.date_format,
        salutationStyle: next.salutation_style,
        signers: next.signers,
        defaultSignerId: next.default_signer_id,
        includeFirmReference: next.include_firm_reference,
      }),
    });
    setSaving(false);
  };

  const revertToFirmDefault = async () => {
    setSaving(true);
    await fetch("/api/precedents/settings", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, clearOverride: true }),
    });
    setOverride(null);
    setSaving(false);
  };

  const toggleSigner = (userId: string) => {
    const already = effective.signers.includes(userId);
    if (!already && effective.signers.length >= 4) return;
    save({ ...effective, signers: already ? effective.signers.filter(id => id !== userId) : [...effective.signers, userId] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-slate-100 shrink-0">
          <h3 className="text-[14px] font-bold text-slate-800 uppercase tracking-wide">Precedent settings for this matter</h3>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-700"><X size={16} /></button>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-400">
                {override ? "This matter has its own overrides." : "Currently using the company-wide defaults."}
              </p>
              {override && (
                <button onClick={revertToFirmDefault} disabled={saving} className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700">
                  Use company default
                </button>
              )}
            </div>

            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Subject line</p>
              <div className="grid grid-cols-3 gap-2">
                {SUBJECT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => save({ ...effective, subject_line_style: opt.value })}
                    className={`p-2.5 rounded-2xl border text-[11px] font-medium transition-colors ${effective.subject_line_style === opt.value ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Salutation</p>
              <div className="grid grid-cols-3 gap-2">
                {SALUTATION_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => save({ ...effective, salutation_style: opt.value })}
                    className={`p-2.5 rounded-2xl border text-[11px] font-medium transition-colors ${effective.salutation_style === opt.value ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Default signature for this matter <span className="text-slate-300 normal-case font-normal">(always included, whatever's picked at issue time)</span>
              </p>
              {staff.length === 0 ? (
                <p className="text-[11px] text-slate-300 italic">No staff signoffs set up yet</p>
              ) : (
                <select value={effective.default_signer_id ?? ""}
                  onChange={e => save({ ...effective, default_signer_id: e.target.value || null })}
                  className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400 bg-white">
                  <option value="">None</option>
                  {staff.map(s => (
                    <option key={s.userId} value={s.userId}>{s.name || s.accountName}{s.position ? ` (${s.position})` : ""}</option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  Signers for this matter <span className="text-slate-300 normal-case font-normal">(up to 4)</span>
                </p>
                <Link href="/dashboard/profile" target="_blank" className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 shrink-0">
                  Add your signoff details →
                </Link>
              </div>
              {staff.length === 0 ? (
                <p className="text-[11px] text-slate-300 italic">No staff signoffs set up yet. Add one in your profile</p>
              ) : (
                <div className="space-y-1.5">
                  {staff.map(s => {
                    const checked = effective.signers.includes(s.userId);
                    return (
                      <label key={s.userId} className={`flex items-center gap-3 px-3 py-2 rounded-2xl border cursor-pointer transition-colors ${checked ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                        <input type="checkbox" checked={checked} disabled={!checked && effective.signers.length >= 4}
                          onChange={() => toggleSigner(s.userId)} />
                        <span className="text-[12px] font-medium text-slate-700">{s.name || s.accountName}</span>
                        {s.position && <span className="text-[11px] text-slate-400">— {s.position}</span>}
                        {!s.hasSignoff && (
                          <Link href="/dashboard/profile" target="_blank" onClick={e => e.stopPropagation()}
                            className="ml-auto text-[10px] font-bold text-amber-600 hover:text-amber-700 shrink-0">
                            Add signoff →
                          </Link>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
