// components/settings/PrecedentsSettingsTab.tsx
// Precedents settings — open to every company member (unlike most of
// /dashboard/admin), reached via /dashboard/settings?view=precedents. Any
// member can add a new precedent to the library and edit their own staff
// signoff; the firm-wide stuff (letterhead, formatting defaults, editing/
// deleting someone ELSE's precedent or signoff) stays admin-only, gated
// client-side via useCompany().isAdmin (the APIs enforce the same split
// server-side — see app/api/precedents/*).
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Upload, FileText, Eye, Trash2, Loader2, Check, Plus, ChevronUp, ChevronDown, Lock, X,
} from "lucide-react";
import { useCompany } from "@/components/CompanyContext";

interface DetectedField { role: string; options?: string[] }

interface Letterhead {
  id: string;
  original_filename: string | null;
  updated_at: string;
  detected_fields?: DetectedField[];
}

// Only these 7 ever appear in detected_fields — address/body/signoff are the
// always-present core tags and never reported here (see
// lib/precedents/letterheadClassify.ts's applyClassification).
const FIELD_ROLE_LABELS: Record<string, string> = {
  our_ref: "Our Ref line",
  date: "Date line",
  delivery_mode: "Delivery mode",
  recipient_name: "Recipient name",
  salutation: "Salutation (“Dear …”)",
  subject: "Subject / RE line",
  closing: "Closing phrase",
};

interface Settings {
  subject_line_style: "all_caps" | "sentence_case" | "with_re";
  date_format: string;
  salutation_style: "generic" | "client_first_name" | "client_full_name";
  signers: string[]; // staff_signoffs user_ids, up to 4
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

interface StaffMember {
  userId: string;
  accountName: string;
  name: string;
  position: string;
  companyName: string;
  contactNumber: string;
  contactEmail: string;
  hasSignoff: boolean;
}

export default function PrecedentsSettingsTab() {
  const { isAdmin, userId } = useCompany();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(true);

  const loadStaff = useCallback(async () => {
    const res = await fetch("/api/precedents/staff-signoffs");
    const json = await res.json();
    setStaff(json.staff || []);
    setStaffLoading(false);
  }, []);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  return (
    <div className="space-y-6">
      <LetterheadSection isAdmin={isAdmin} />
      <SettingsSection isAdmin={isAdmin} staff={staff} staffLoading={staffLoading} />
      <StaffSignoffsSection isAdmin={isAdmin} currentUserId={userId} staff={staff} loading={staffLoading} onChanged={loadStaff} />
      <LibrarySection isAdmin={isAdmin} />
    </div>
  );
}

function AdminOnlyNote() {
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-300"><Lock size={10} /> Admin only</span>
  );
}

// Ticks once a second while `active`, resetting to 0 whenever it turns on --
// drives the status text below with real elapsed time instead of guessed
// fixed-duration steps, since upload/preview latency varies a lot (whether
// docservice's Fly machine was already warm, whether a legacy .doc needed
// converting first).
function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const startedAt = Date.now();
    setSeconds(0);
    const interval = setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [active]);
  return seconds;
}

function uploadStatusText(seconds: number): string {
  if (seconds < 4) return "Uploading your letterhead…";
  if (seconds < 15) return "Reading the document and classifying its fields with AI…";
  return "Still working — this takes longer right after the document conversion service has been idle. Feel free to check other pages; this will keep going.";
}

function previewStatusText(seconds: number): string {
  if (seconds < 3) return "Rendering preview…";
  if (seconds < 12) return "Converting your letterhead to PDF…";
  return "Still working — the conversion service can take longer if it's been idle for a while.";
}

// So leaving this page mid-upload (the fetch itself isn't cancelled by
// navigating away) and coming back still shows accurate status instead of a
// plain "Upload letterhead" button as if nothing had happened.
function pendingUploadKey(companyId: string): string {
  return `precedent_letterhead_upload_pending:${companyId}`;
}
const PENDING_UPLOAD_MAX_AGE_MS = 3 * 60 * 1000;

// ── Letterhead ────────────────────────────────────────────────────
function LetterheadSection({ isAdmin }: { isAdmin: boolean }) {
  const { companyId } = useCompany();
  const [letterhead, setLetterhead] = useState<Letterhead | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // cached blob, kept across hide/show
  const [previewVisible, setPreviewVisible] = useState(false);
  const uploadSeconds = useElapsedSeconds(uploading || resuming);
  const previewSeconds = useElapsedSeconds(previewing);

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents/letterhead");
    const json = await res.json();
    setLetterhead(json.letterhead || null);
    setLoading(false);
    return json.letterhead || null;
  }, []);

  useEffect(() => { load(); }, [load]);
  // Revoke the blob URL on unmount, so we don't leak object URLs.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  // Resume: if an upload was still going when this page was last left, keep
  // polling until it finishes (or the marker is old enough to assume
  // something went wrong) instead of just silently forgetting about it.
  useEffect(() => {
    if (!companyId) return;
    const key = pendingUploadKey(companyId);
    const raw = localStorage.getItem(key);
    if (!raw) return;
    let startedAt: number;
    try { startedAt = JSON.parse(raw).startedAt; } catch { localStorage.removeItem(key); return; }
    if (!startedAt || Date.now() - startedAt > PENDING_UPLOAD_MAX_AGE_MS) { localStorage.removeItem(key); return; }

    setResuming(true);
    const poll = setInterval(async () => {
      const lh = await load();
      const finished = (lh && new Date(lh.updated_at).getTime() > startedAt) || Date.now() - startedAt > PENDING_UPLOAD_MAX_AGE_MS;
      if (finished) {
        setResuming(false);
        localStorage.removeItem(key);
        clearInterval(poll);
      }
    }, 3000);
    return () => clearInterval(poll);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only run once per companyId, not on every `load` identity change
  }, [companyId]);

  const invalidatePreviewCache = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewVisible(false);
  };

  const handleUpload = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".docx") && !lower.endsWith(".doc")) {
      setError("Please upload a .docx or .doc file.");
      return;
    }
    setError(null);
    setUploading(true);
    invalidatePreviewCache(); // stale once the source file changes
    const key = companyId ? pendingUploadKey(companyId) : null;
    if (key) localStorage.setItem(key, JSON.stringify({ startedAt: Date.now() }));
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/precedents/letterhead", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) { setError(json.error || "Upload failed"); return; }
      setLetterhead(json.letterhead);
    } finally {
      setUploading(false);
      if (key) localStorage.removeItem(key);
    }
  };

  const handleRemove = async () => {
    if (!window.confirm("Remove the firm letterhead? Documents can't be issued until a new one is uploaded.")) return;
    await fetch("/api/precedents/letterhead", { method: "DELETE" });
    setLetterhead(null);
    invalidatePreviewCache();
  };

  const handlePreview = async () => {
    // Already fetched once -- just toggle visibility, don't pay for another
    // docx→PDF conversion just to show the same thing again.
    if (previewUrl) { setPreviewVisible(v => !v); return; }
    setPreviewing(true);
    try {
      const res = await fetch("/api/precedents/letterhead/preview");
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error || "Failed to render preview");
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
      setPreviewVisible(true);
    } finally {
      setPreviewing(false);
    }
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Letterhead</p>
        {!isAdmin && <AdminOnlyNote />}
      </div>

      {(uploading || resuming) && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
          <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
          <p className="text-[11px] text-indigo-700">{uploadStatusText(uploadSeconds)} <span className="text-indigo-400">({uploadSeconds}s)</span></p>
        </div>
      )}

      {letterhead ? (
        <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-[24px]">
          <FileText size={18} className="text-indigo-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-slate-800 truncate">{letterhead.original_filename || "Letterhead.docx"}</p>
            <p className="text-[11px] text-slate-400">Uploaded {new Date(letterhead.updated_at).toLocaleDateString()}</p>
          </div>
          <button onClick={handlePreview} disabled={previewing} title="Preview where issued content will land"
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-600 text-[11px] font-bold rounded-full hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-40">
            {previewing ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} {previewVisible ? "Hide preview" : "Preview"}
          </button>
          {isAdmin && (
            <>
              <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Replace
                <input type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
              </label>
              <button onClick={handleRemove} title="Remove letterhead" className="p-2 text-slate-300 hover:text-red-500 transition-colors">
                <Trash2 size={15} />
              </button>
            </>
          )}
        </div>
      ) : (
        <div>
          <p className="text-[12px] text-slate-400 mb-3">
            {isAdmin
              ? <>Upload your firm&apos;s Word letterhead (logo/header/footer already laid out). The recipient&apos;s
                  address and the letter itself are placed automatically — no manual tagging needed.</>
              : "No letterhead has been uploaded yet — ask a company admin to set one up before issuing documents."}
          </p>
          {isAdmin && (
            <label className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white text-[11px] font-bold rounded-full hover:bg-indigo-700 transition-colors cursor-pointer">
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? "Uploading..." : "Upload letterhead"}
              <input type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
            </label>
          )}
        </div>
      )}
      {previewing && (
        <div className="flex items-center gap-2 px-4 py-3 mt-4 bg-slate-50 border border-slate-200 rounded-2xl">
          <Loader2 size={14} className="animate-spin text-slate-400 shrink-0" />
          <p className="text-[11px] text-slate-500">{previewStatusText(previewSeconds)} <span className="text-slate-400">({previewSeconds}s)</span></p>
        </div>
      )}
      {previewVisible && previewUrl && (
        <div className="mt-4 border border-slate-200 rounded-[24px] overflow-hidden">
          <iframe src={previewUrl} title="Letterhead preview" className="w-full h-[600px]" />
        </div>
      )}
      {letterhead && <DetectedFieldsSection isAdmin={isAdmin} letterhead={letterhead} onChanged={setLetterhead} />}
      {error && <p className="text-[11px] text-red-500 mt-3">{error}</p>}
    </div>
  );
}

// Where a firm reviews/corrects what got automatically identified in their
// uploaded letterhead (Our Ref, date, delivery mode, etc. — see
// lib/precedents/letterheadClassify.ts) — this is the answer to "where can
// the user edit the fields": nowhere until this section existed. Recognising
// these fields is the one place this feature uses AI at all; issuing a
// document itself doesn't require it (see PrecedentsTab.tsx's Issue modal).
function DetectedFieldsSection({ isAdmin, letterhead, onChanged }: {
  isAdmin: boolean; letterhead: Letterhead; onChanged: (lh: Letterhead) => void;
}) {
  const fields = letterhead.detected_fields || [];
  const [savingRole, setSavingRole] = useState<string | null>(null);

  const save = async (next: DetectedField[]) => {
    const res = await fetch("/api/precedents/letterhead", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detectedFields: next }),
    });
    const json = await res.json();
    if (res.ok && json.letterhead) onChanged(json.letterhead);
  };

  const remove = async (role: string) => {
    setSavingRole(role);
    await save(fields.filter(f => f.role !== role));
    setSavingRole(null);
  };

  const updateOptions = async (role: string, optionsText: string) => {
    setSavingRole(role);
    const options = optionsText.split(",").map(s => s.trim()).filter(Boolean);
    await save(fields.map(f => f.role === role ? { ...f, options } : f));
    setSavingRole(null);
  };

  return (
    <div className="mt-5 pt-5 border-t border-slate-100">
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fields identified in this template</p>
      <p className="text-[11px] text-slate-400 mb-3">
        When this letterhead was uploaded, these fields were automatically recognised from its layout (not written by AI — just identified). Remove one if it was picked up incorrectly; the rest of the letter keeps working either way.
      </p>
      {fields.length === 0 ? (
        <p className="text-[11px] text-slate-300 italic">No extra fields identified — this letterhead just uses the standard address/content/signoff areas.</p>
      ) : (
        <div className="space-y-2">
          {fields.map(f => (
            <div key={f.role} className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 rounded-2xl">
              <span className="text-[12px] font-medium text-slate-700 flex-1">{FIELD_ROLE_LABELS[f.role] || f.role}</span>
              {f.role === "delivery_mode" && isAdmin && (
                <input
                  defaultValue={(f.options || []).join(", ")}
                  onBlur={e => updateOptions(f.role, e.target.value)}
                  placeholder="By Hand, By Email, By Post"
                  className="w-56 px-3 py-1.5 border border-slate-200 rounded-full text-[11px] outline-none focus:border-indigo-400"
                />
              )}
              {isAdmin && (
                <button onClick={() => remove(f.role)} disabled={savingRole === f.role} title="Remove this field"
                  className="p-1.5 text-slate-300 hover:text-red-500 transition-colors shrink-0">
                  {savingRole === f.role ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Formatting defaults ──────────────────────────────────────────
function SettingsSection({ isAdmin, staff, staffLoading }: { isAdmin: boolean; staff: StaffMember[]; staffLoading: boolean }) {
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
    if (!isAdmin) return;
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

  const toggleSigner = (userId: string) => {
    const already = settings.signers.includes(userId);
    if (!already && settings.signers.length >= 4) return;
    save({ ...settings, signers: already ? settings.signers.filter(id => id !== userId) : [...settings.signers, userId] });
  };

  if (loading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Formatting defaults</p>
        {!isAdmin ? <AdminOnlyNote /> : (saving || saved) && (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-emerald-500" />}
            {saving ? "Saving..." : "Saved"}
          </span>
        )}
      </div>

      <fieldset disabled={!isAdmin} className="space-y-6 disabled:opacity-60">
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Subject line</p>
          <div className="grid grid-cols-3 gap-2">
            {SUBJECT_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={() => save({ ...settings, subject_line_style: opt.value })}
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
              <button key={opt.value} type="button" onClick={() => save({ ...settings, date_format: opt.value })}
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
              <button key={opt.value} type="button" onClick={() => save({ ...settings, salutation_style: opt.value })}
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
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
            Signers <span className="text-slate-300 normal-case font-normal">(up to 4 — pick from the staff signoffs below)</span>
          </p>
          {staffLoading ? (
            <Loader2 size={14} className="animate-spin text-slate-300" />
          ) : staff.length === 0 ? (
            <p className="text-[11px] text-slate-300 italic">No staff signoffs set up yet</p>
          ) : (
            <div className="space-y-1.5">
              {staff.map(s => {
                const checked = settings.signers.includes(s.userId);
                return (
                  <label key={s.userId} className={`flex items-center gap-3 px-4 py-2.5 rounded-2xl border cursor-pointer transition-colors ${checked ? "border-indigo-400 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="checkbox" checked={checked} disabled={!isAdmin || (!checked && settings.signers.length >= 4)}
                      onChange={() => toggleSigner(s.userId)} />
                    <span className="text-[12px] font-medium text-slate-700">{s.name || s.accountName}</span>
                    {s.position && <span className="text-[11px] text-slate-400">— {s.position}</span>}
                    {!s.hasSignoff && <span className="ml-auto text-[10px] text-amber-500">No signoff details yet</span>}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </fieldset>
    </div>
  );
}

// ── Staff signoffs ────────────────────────────────────────────────
function StaffSignoffsSection({ isAdmin, currentUserId, staff, loading, onChanged }: {
  isAdmin: boolean; currentUserId: string | null; staff: StaffMember[]; loading: boolean; onChanged: () => void;
}) {
  if (loading) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Staff signoffs</p>
      <p className="text-[11px] text-slate-400 mb-4">
        What appears under each signer&apos;s name when they issue a document. Everyone can set their own; a company admin can set anyone&apos;s.
      </p>
      <div className="space-y-3">
        {staff.map(s => (
          <StaffSignoffRow key={s.userId} staff={s} canEdit={isAdmin || s.userId === currentUserId} canDelete={isAdmin} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function StaffSignoffRow({ staff, canEdit, canDelete, onChanged }: {
  staff: StaffMember; canEdit: boolean; canDelete: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(staff.name || staff.accountName);
  const [position, setPosition] = useState(staff.position);
  const [companyName, setCompanyName] = useState(staff.companyName);
  const [contactNumber, setContactNumber] = useState(staff.contactNumber);
  const [contactEmail, setContactEmail] = useState(staff.contactEmail);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError(null);
    const res = await fetch("/api/precedents/staff-signoffs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: staff.userId, name, position, companyName, contactNumber, contactEmail }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) { setError(json.error || "Failed to save"); return; }
    setEditing(false);
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${staff.accountName}'s signoff details?`)) return;
    await fetch(`/api/precedents/staff-signoffs?userId=${staff.userId}`, { method: "DELETE" });
    onChanged();
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl">
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold text-slate-800">{staff.name || staff.accountName}</p>
          <p className="text-[11px] text-slate-400">
            {[staff.position, staff.companyName, staff.contactNumber, staff.contactEmail].filter(Boolean).join(" · ") || "No signoff details yet"}
          </p>
        </div>
        {canEdit && <button onClick={() => setEditing(true)} className="px-4 py-2 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 shrink-0">Edit</button>}
        {canDelete && staff.hasSignoff && (
          <button onClick={remove} className="p-2 text-slate-300 hover:text-red-500 shrink-0"><Trash2 size={14} /></button>
        )}
      </div>
    );
  }

  return (
    <div className="border border-indigo-200 rounded-2xl p-4 space-y-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (shown in bold)"
        className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] font-bold outline-none focus:border-indigo-400" />
      <input value={position} onChange={e => setPosition(e.target.value)} placeholder="Position, e.g. Partner"
        className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
      <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company name"
        className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
      <input value={contactNumber} onChange={e => setContactNumber(e.target.value)} placeholder="Contact number"
        className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
      <input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="Contact email"
        className="w-full px-4 py-2 border border-slate-200 rounded-full text-[12px] outline-none focus:border-indigo-400" />
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={() => setEditing(false)} className="px-4 py-2 text-[11px] text-slate-400 hover:text-slate-700">Cancel</button>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 disabled:opacity-40 transition-colors">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
        </button>
      </div>
    </div>
  );
}

// ── Precedent library ────────────────────────────────────────────
function LibrarySection({ isAdmin }: { isAdmin: boolean }) {
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
            canEdit
            onSaved={() => { setShowCreate(false); load(); }}
            onCancel={() => setShowCreate(false)}
            onDelete={() => setShowCreate(false)}
          />
        )}
        {precedents.map((p, i) => (
          <div key={p.id} className="flex items-start gap-2">
            {isAdmin && (
              <div className="flex flex-col pt-6 shrink-0">
                <button onClick={() => move(p.id, -1)} disabled={i === 0} className="text-slate-300 hover:text-indigo-600 disabled:opacity-20"><ChevronUp size={13} /></button>
                <button onClick={() => move(p.id, 1)} disabled={i === precedents.length - 1} className="text-slate-300 hover:text-indigo-600 disabled:opacity-20"><ChevronDown size={13} /></button>
              </div>
            )}
            <div className="flex-1">
              <PrecedentCard precedent={p} canEdit={isAdmin} onSaved={load} onDelete={() => remove(p.id)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrecedentCard({ precedent, isNew, canEdit, onSaved, onDelete, onCancel }: {
  precedent: Precedent; isNew?: boolean; canEdit: boolean; onSaved: () => void; onDelete: () => void; onCancel?: () => void;
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

  if (!isNew && !canEdit) {
    return (
      <div className="border border-slate-200 rounded-[24px] p-5">
        <p className="text-[13px] font-bold text-slate-800">{precedent.name}</p>
        {precedent.description && <p className="text-[12px] text-slate-400 mt-1">{precedent.description}</p>}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-[24px] p-5 space-y-3">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Letter of Demand"
        className="w-full px-4 py-2.5 border border-slate-200 rounded-full text-[13px] font-bold outline-none focus:border-indigo-400" />
      <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
        placeholder="Description shown to staff on the Precedent tab (optional)"
        className="w-full px-4 py-2.5 border border-slate-200 rounded-2xl text-[12px] outline-none focus:border-indigo-400 resize-none" />
      <textarea value={aiInstructions} onChange={e => setAiInstructions(e.target.value)} rows={3}
        placeholder="Instructions for the optional AI drafting assist — e.g. 'This is a formal letter of demand. State a clear deadline and the consequences of non-payment.'"
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
