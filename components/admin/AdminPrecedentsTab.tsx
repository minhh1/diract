// components/admin/AdminPrecedentsTab.tsx
// Admin "Precedents" tab: firm letterhead + issued-document formatting
// defaults + the precedent library shown per-matter in
// components/dashboard/tabs/PrecedentsTab.tsx. Three independent sections in
// one screen, same shape as AdminEmailTab.tsx (sending domain + notification
// toggles) — each section owns its own load/save state.
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Upload, FileText, Eye, Trash2, Loader2, Check, Plus, ChevronUp, ChevronDown, X,
} from "lucide-react";

interface Props {
  companyId: string;
}

interface Letterhead {
  id: string;
  original_filename: string | null;
  updated_at: string;
}

interface Signer {
  name: string;
  position: string;
}

interface Settings {
  subject_line_style: "all_caps" | "sentence_case" | "with_re";
  date_format: string;
  salutation_style: "generic" | "client_first_name" | "client_full_name";
  signers: Signer[];
  include_firm_reference: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  subject_line_style: "sentence_case",
  date_format: "D MMMM YYYY",
  salutation_style: "generic",
  signers: [],
  include_firm_reference: false,
};

const SUBJECT_OPTIONS: { value: Settings["subject_line_style"]; label: string; example: string }[] = [
  { value: "sentence_case", label: "Sentence case", example: "Settlement of your claim" },
  { value: "all_caps", label: "ALL CAPS", example: "SETTLEMENT OF YOUR CLAIM" },
  { value: "with_re", label: "RE: prefix", example: "RE: Settlement of your claim" },
];

const DATE_OPTIONS = [
  { value: "D MMMM YYYY", label: "26 July 2026" },
  { value: "DD/MM/YYYY", label: "26/07/2026" },
  { value: "YYYY-MM-DD", label: "2026-07-26" },
];

const SALUTATION_OPTIONS: { value: Settings["salutation_style"]; label: string }[] = [
  { value: "generic", label: "Dear Sir/Madam" },
  { value: "client_first_name", label: "Dear [First name]" },
  { value: "client_full_name", label: "Dear [Full name]" },
];

interface Precedent {
  id: string;
  name: string;
  description: string | null;
  ai_instructions: string | null;
  display_order: number;
}

export default function AdminPrecedentsTab({}: Props) {
  return (
    <div className="space-y-6">
      <LetterheadSection />
      <SettingsSection />
      <LibrarySection />
    </div>
  );
}

// ── Letterhead ────────────────────────────────────────────────────
function LetterheadSection() {
  const [letterhead, setLetterhead] = useState<Letterhead | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents/letterhead");
    const json = await res.json();
    setLetterhead(json.letterhead || null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".docx") && !lower.endsWith(".doc")) {
      setError("Please upload a .docx or .doc file.");
      return;
    }
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/precedents/letterhead", { method: "POST", body: form });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) { setError(json.error || "Upload failed"); return; }
    setLetterhead(json.letterhead);
  };

  const handleRemove = async () => {
    if (!window.confirm("Remove the firm letterhead? Documents can't be issued until a new one is uploaded.")) return;
    await fetch("/api/precedents/letterhead", { method: "DELETE" });
    setLetterhead(null);
  };

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch("/api/precedents/letterhead/preview");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to render preview");
        return;
      }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Letterhead</p>

      {letterhead ? (
        <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-[24px]">
          <FileText size={18} className="text-indigo-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-slate-800 truncate">{letterhead.original_filename || "Letterhead.docx"}</p>
            <p className="text-[11px] text-slate-400">Uploaded {new Date(letterhead.updated_at).toLocaleDateString()}</p>
          </div>
          <button onClick={handlePreview} disabled={previewing} title="Preview where issued content will land"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-[11px] font-bold rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-40">
            {previewing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} Preview
          </button>
          <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
            {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Replace
            <input type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          </label>
          <button onClick={handleRemove} title="Remove letterhead" className="p-2 text-slate-300 hover:text-red-500 transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <div>
          <p className="text-[12px] text-slate-400 mb-3">
            Upload your firm&apos;s Word letterhead (logo/header/footer already laid out). The recipient&apos;s
            address and the letter itself are placed automatically — no manual tagging needed.
          </p>
          <label className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors cursor-pointer">
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {uploading ? "Uploading..." : "Upload letterhead"}
            <input type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          </label>
        </div>
      )}
      {error && <p className="text-[11px] text-red-500 mt-3">{error}</p>}
    </div>
  );
}

// ── Formatting defaults ──────────────────────────────────────────
function SettingsSection() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents/settings");
    const json = await res.json();
    if (json.companyDefault) {
      setSettings({
        subject_line_style: json.companyDefault.subject_line_style,
        date_format: json.companyDefault.date_format,
        salutation_style: json.companyDefault.salutation_style,
        signers: json.companyDefault.signers || [],
        include_firm_reference: json.companyDefault.include_firm_reference,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (next: Settings) => {
    setSettings(next);
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/precedents/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subjectLineStyle: next.subject_line_style,
        dateFormat: next.date_format,
        salutationStyle: next.salutation_style,
        signers: next.signers,
        includeFirmReference: next.include_firm_reference,
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };

  const updateSigner = (i: number, patch: Partial<Signer>) => {
    const next = settings.signers.map((s, idx) => idx === i ? { ...s, ...patch } : s);
    setSettings({ ...settings, signers: next });
  };
  const addSigner = () => {
    if (settings.signers.length >= 4) return;
    setSettings({ ...settings, signers: [...settings.signers, { name: "", position: "" }] });
  };
  const removeSigner = (i: number) => save({ ...settings, signers: settings.signers.filter((_, idx) => idx !== i) });

  if (loading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Formatting defaults</p>
        {(saving || saved) && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-emerald-500" />}
            {saving ? "Saving..." : "Saved"}
          </span>
        )}
      </div>

      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Subject line</p>
        <div className="grid grid-cols-3 gap-2">
          {SUBJECT_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => save({ ...settings, subject_line_style: opt.value })}
              className={`text-left p-3 rounded-2xl border transition-colors ${settings.subject_line_style === opt.value ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
              <p className="text-[11px] font-bold text-slate-700">{opt.label}</p>
              <p className="text-[10px] text-slate-400 truncate">{opt.example}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Date format</p>
        <div className="grid grid-cols-3 gap-2">
          {DATE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => save({ ...settings, date_format: opt.value })}
              className={`p-3 rounded-2xl border text-[12px] font-medium transition-colors ${settings.date_format === opt.value ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Salutation</p>
        <div className="grid grid-cols-3 gap-2">
          {SALUTATION_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => save({ ...settings, salutation_style: opt.value })}
              className={`p-3 rounded-2xl border text-[12px] font-medium transition-colors ${settings.salutation_style === opt.value ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={settings.include_firm_reference}
          onChange={e => save({ ...settings, include_firm_reference: e.target.checked })} />
        <span className="text-[12px] text-slate-600">Include the matter&apos;s reference number (&quot;Our Ref&quot;) when available</span>
      </label>

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Signers <span className="text-slate-300 normal-case font-normal">(up to 4)</span></p>
          <button onClick={addSigner} disabled={settings.signers.length >= 4}
            className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-30">
            <Plus size={12} /> Add signer
          </button>
        </div>
        <div className="space-y-2">
          {settings.signers.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={s.name} onChange={e => updateSigner(i, { name: e.target.value })}
                onBlur={() => save(settings)} placeholder="Name"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              <input value={s.position} onChange={e => updateSigner(i, { position: e.target.value })}
                onBlur={() => save(settings)} placeholder="Position, e.g. Partner"
                className="flex-1 px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
              <button onClick={() => removeSigner(i)} className="p-1.5 text-slate-300 hover:text-red-500 shrink-0"><X size={14} /></button>
            </div>
          ))}
          {settings.signers.length === 0 && <p className="text-[11px] text-slate-300 italic">No signers configured yet</p>}
        </div>
      </div>
    </div>
  );
}

// ── Precedent library ────────────────────────────────────────────
function LibrarySection() {
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents?recordTable=projects");
    const json = await res.json();
    setPrecedents(json.precedents || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const move = async (id: string, dir: -1 | 1) => {
    const idx = precedents.findIndex(p => p.id === id);
    const other = precedents[idx + dir];
    if (!other) return;
    const a = precedents[idx], b = other;
    setPrecedents(prev => {
      const next = [...prev];
      [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
      return next;
    });
    await Promise.all([
      fetch(`/api/precedents/${a.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayOrder: b.display_order }) }),
      fetch(`/api/precedents/${b.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayOrder: a.display_order }) }),
    ]);
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this precedent? Its issuance history is kept, but it won't be issuable anymore.")) return;
    await fetch(`/api/precedents/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Precedent library</p>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors">
          <Plus size={13} /> Add precedent
        </button>
      </div>

      <div className="space-y-3">
        {precedents.length === 0 && !showCreate && (
          <p className="text-center text-slate-300 text-[11px] uppercase font-bold tracking-widest p-8">No precedents yet</p>
        )}
        {showCreate && (
          <PrecedentCard
            precedent={{ id: "", name: "", description: "", ai_instructions: "", display_order: 0 }}
            isNew
            onSaved={() => { setShowCreate(false); load(); }}
            onCancel={() => setShowCreate(false)}
            onDelete={() => setShowCreate(false)}
          />
        )}
        {precedents.map((p, i) => (
          <div key={p.id} className="flex items-start gap-2">
            <div className="flex flex-col pt-6 shrink-0">
              <button onClick={() => move(p.id, -1)} disabled={i === 0} className="text-slate-300 hover:text-indigo-600 disabled:opacity-20"><ChevronUp size={13} /></button>
              <button onClick={() => move(p.id, 1)} disabled={i === precedents.length - 1} className="text-slate-300 hover:text-indigo-600 disabled:opacity-20"><ChevronDown size={13} /></button>
            </div>
            <div className="flex-1">
              <PrecedentCard precedent={p} onSaved={load} onDelete={() => remove(p.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrecedentCard({ precedent, isNew, onSaved, onDelete, onCancel }: {
  precedent: Precedent; isNew?: boolean; onSaved: () => void; onDelete: () => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(precedent.name);
  const [description, setDescription] = useState(precedent.description || "");
  const [aiInstructions, setAiInstructions] = useState(precedent.ai_instructions || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const res = isNew
      ? await fetch("/api/precedents", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, aiInstructions }),
        })
      : await fetch(`/api/precedents/${precedent.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, aiInstructions }),
        });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to save"); return; }
    onSaved();
  };

  return (
    <div className="border border-slate-200 rounded-[24px] p-5 space-y-3">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Letter of Demand"
        className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] font-bold outline-none focus:border-indigo-400" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
        placeholder="Description shown to staff on the Precedent tab (optional)"
        className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
      <textarea value={aiInstructions} onChange={e => setAiInstructions(e.target.value)} rows={3}
        placeholder="AI drafting instructions — e.g. 'This is a formal letter of demand. State a clear deadline and the consequences of non-payment.'"
        className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <div className="flex items-center justify-end gap-2">
        {isNew && onCancel && <button onClick={onCancel} className="px-4 py-2 text-[11px] text-slate-400 hover:text-slate-700">Cancel</button>}
        {!isNew && (
          <button onClick={onDelete} className="mr-auto p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
        )}
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {isNew ? "Add" : "Save"}
        </button>
      </div>
    </div>
  );
}
