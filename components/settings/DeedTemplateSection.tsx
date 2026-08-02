// components/settings/DeedTemplateSection.tsx
// The firm's deed template, shown under the letterhead in Settings >
// Precedents.
//
// Separate from the letterhead because they do different jobs: a letterhead is
// what a LETTER is composed into and carries branding and merge tags; a deed
// template is what a DEED is generated into and carries the named Word styles
// that supply its numbering and indentation.
//
// The screen's job is mostly to explain that difference before the upload, so
// a firm adds its house styles first and gets a deed that looks like its own
// precedents. If it doesn't, the upload still succeeds and says plainly what
// was added.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Upload, Trash2, Check, AlertTriangle } from "lucide-react";
import { DEED_STYLES, DEED_TEMPLATE_GUIDANCE } from "@/lib/precedents/deedTemplateStyles";

interface DeedTemplate {
  id: string;
  original_filename: string;
  detected_styles: Record<string, string> | null;
  defaults_applied: boolean;
  updated_at: string;
}

export default function DeedTemplateSection({ isAdmin }: { isAdmin: boolean }) {
  const [template, setTemplate] = useState<DeedTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stylesAdded, setStylesAdded] = useState<string[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents/deed-template");
    const json = await res.json().catch(() => ({}));
    setTemplate(json.deedTemplate || null);
    setLoading(false);
  }, []);

  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    setStylesAdded(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/precedents/deed-template", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) { setError(json.error || "Upload failed"); return; }
    setTemplate(json.deedTemplate);
    if (json.defaultsApplied) setStylesAdded(json.stylesAdded || []);
  };

  const remove = async () => {
    setError(null);
    const res = await fetch("/api/precedents/deed-template", { method: "DELETE" });
    if (!res.ok) { setError("Could not remove the template"); return; }
    setTemplate(null);
    setStylesAdded(null);
  };

  // Which of the styles a deed applies this template actually defines. Shown
  // so a firm can see its own styles were recognised rather than having to
  // take it on trust.
  const found = template?.detected_styles ?? {};
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const have = new Set([...Object.keys(found), ...Object.values(found)].map(normalise));
  const recognised = DEED_STYLES.filter(s =>
    have.has(normalise(s.id)) || have.has(normalise(s.name)) ||
    (s.aliases ?? []).some(a => have.has(normalise(a)))
  );

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Deed / Agreement</p>
        {!isAdmin && (
          <p className="text-[10px] text-slate-400">Only a company admin can change this.</p>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-5">{DEED_TEMPLATE_GUIDANCE}</p>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-rose-50 border border-rose-100 rounded-2xl">
          <AlertTriangle size={13} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-700">{error}</p>
        </div>
      )}

      {stylesAdded && (
        <div className="px-4 py-3 mb-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <p className="text-[11px] font-bold text-amber-800">A standard numbering scheme was added</p>
          <p className="text-[11px] text-amber-700 mt-1 leading-relaxed">
            Your template didn&apos;t define deed numbering, so these styles were added to it:{" "}
            {stylesAdded.join(", ")}. Only styles were added &mdash; your logo, header, footer and
            content are untouched. Edit any of them in Word to match your house style and upload again.
          </p>
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
          <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
          <p className="text-[11px] text-indigo-700">Checking the template&apos;s styles&hellip;</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
      ) : template ? (
        <>
          <div className="flex items-center gap-4 p-5 bg-slate-50 rounded-[24px]">
            <FileText size={18} className="text-indigo-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-bold text-slate-800 truncate">{template.original_filename}</p>
              <p className="text-[11px] text-slate-400">
                Uploaded {new Date(template.updated_at).toLocaleDateString("en-AU")}
                {template.defaults_applied && " · standard numbering added"}
              </p>
            </div>
            {isAdmin && (
              <>
                <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Replace
                  <input
                    ref={fileRef} type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
                  />
                </label>
                <button
                  onClick={remove}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                  title="Remove the deed template"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>

          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-6 mb-2">
            Styles recognised &mdash; {recognised.length} of {DEED_STYLES.length}
          </p>
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {DEED_STYLES.map(s => {
              const ok = recognised.includes(s);
              return (
                <div key={s.id} className="flex items-start gap-3 px-4 py-2.5">
                  {ok
                    ? <Check size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                    : <span className="w-[13px] shrink-0" />}
                  <div className="min-w-0">
                    <p className={`text-[11px] font-bold ${ok ? "text-slate-700" : "text-slate-300"}`}>
                      {s.name}{!s.required && <span className="font-normal text-slate-300"> · optional</span>}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{s.purpose}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="border border-dashed border-slate-200 rounded-[24px] py-10 text-center">
          <p className="text-[11px] text-slate-400 mb-4">No deed template yet.</p>
          {isAdmin && (
            <label className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
              <Upload size={13} /> Upload deed template
              <input
                type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
