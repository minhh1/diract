// components/settings/ExecutionTemplateSection.tsx
// The firm's execution page, under the deed template in Settings > Precedents.
//
// An override rather than a requirement: without one, deeds use the built-in
// signing blocks, which are already correct. A firm uploads its own when it
// has particular wording or layout it wants kept.
"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Upload, Trash2, Check, AlertTriangle } from "lucide-react";
import { EXECUTION_VARIANTS } from "@/lib/precedents/executionClauses";

interface ExecutionTemplate {
  id: string;
  original_filename: string;
  blocks: Record<string, string[]> | null;
  updated_at: string;
}

// The keys a block can be stored under, paired with what to call them. An
// individual has two, because a deed and an agreement open differently.
const SLOTS: { key: string; label: string; guidance: string }[] = [
  {
    key: "individual_deed",
    label: "Individual - deed",
    guidance: "Opens \"Signed, sealed and delivered by ... in the presence of\". The sealing and delivery are what make it a deed.",
  },
  {
    key: "individual_agreement",
    label: "Individual - agreement",
    guidance: "Opens \"Executed by ... in the presence of\". No sealing, and a witness is usual rather than required.",
  },
  ...EXECUTION_VARIANTS.filter(v => v.kind !== "individual").map(v => ({
    key: v.kind as string, label: v.label, guidance: v.guidance,
  })),
];

export default function ExecutionTemplateSection({ isAdmin }: { isAdmin: boolean }) {
  const [template, setTemplate] = useState<ExecutionTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unrecognised, setUnrecognised] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/precedents/execution-template");
    const json = await res.json().catch(() => ({}));
    setTemplate(json.executionTemplate || null);
    setLoading(false);
  }, []);
  useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t); }, [load]);

  const upload = async (file: File) => {
    setUploading(true); setError(null); setUnrecognised(0);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/precedents/execution-template", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) { setError(json.error || "Upload failed"); return; }
    setTemplate(json.executionTemplate);
    setUnrecognised(json.unrecognised || 0);
  };

  const remove = async () => {
    const res = await fetch("/api/precedents/execution-template", { method: "DELETE" });
    if (!res.ok) { setError("Could not remove the template"); return; }
    setTemplate(null);
  };

  const have = template?.blocks ?? {};

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Execution page</p>
        {!isAdmin && <p className="text-[10px] text-slate-400">Only a company admin can change this.</p>}
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-5">
        How each kind of party signs. Upload your own execution page to use your firm&apos;s wording and
        layout; each block should start &ldquo;Executed by&rdquo; or &ldquo;Signed, sealed and delivered by&rdquo;,
        and blocks are matched to the party they suit by the words they use. Without one, deeds use a
        standard set of signing blocks.
      </p>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-rose-50 border border-rose-100 rounded-2xl">
          <AlertTriangle size={13} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-700">{error}</p>
        </div>
      )}
      {unrecognised > 0 && (
        <div className="px-4 py-3 mb-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <p className="text-[11px] text-amber-700">
            {unrecognised} block{unrecognised === 1 ? " was" : "s were"} not recognised and{" "}
            {unrecognised === 1 ? "has" : "have"} been left out. The standard block is used for anything missing,
            rather than guessing which party a block belongs to.
          </p>
        </div>
      )}
      {uploading && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
          <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
          <p className="text-[11px] text-indigo-700">Reading the signing blocks&hellip;</p>
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
              </p>
            </div>
            {isAdmin && (
              <>
                <label className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
                  <Upload size={13} /> Replace
                  <input type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                </label>
                <button onClick={remove} className="p-2 text-slate-400 hover:text-rose-600 transition-colors" title="Remove">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>

          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-6 mb-2">
            Blocks recognised &mdash; {SLOTS.filter(s => have[s.key]).length} of {SLOTS.length}
          </p>
          <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
            {SLOTS.map(s => {
              const ok = !!have[s.key];
              return (
                <div key={s.key} className="flex items-start gap-3 px-4 py-2.5">
                  {ok ? <Check size={13} className="text-emerald-600 shrink-0 mt-0.5" /> : <span className="w-[13px] shrink-0" />}
                  <div className="min-w-0">
                    <p className={`text-[11px] font-bold ${ok ? "text-slate-700" : "text-slate-300"}`}>
                      {s.label}{!ok && <span className="font-normal"> &middot; standard block used</span>}
                    </p>
                    <p className="text-[10px] text-slate-400 leading-relaxed">{s.guidance}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="border border-dashed border-slate-200 rounded-[24px] py-10 text-center">
          <p className="text-[11px] text-slate-400 mb-4">Using the standard signing blocks.</p>
          {isAdmin && (
            <label className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
              <Upload size={13} /> Upload execution page
              <input type="file" accept=".docx,.doc" className="hidden" disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
