// components/settings/CrossReferenceCheckSection.tsx
// Upload any Word document and get back a checked copy: broken clause,
// recital, schedule and annexure references highlighted, each with a real
// Word comment explaining what's wrong. Not part of the precedent library --
// this checks whatever a user hands it, matter document or otherwise.
"use client";

import { useState } from "react";
import { FileSearch, Upload, Loader2, AlertTriangle, Download, CheckCircle2 } from "lucide-react";

interface Issue {
  kind: string;
  text: string;
  message: string;
  confidence: "high" | "heuristic";
}

interface CheckResult {
  issues: Issue[];
  docx: string;
  filename: string;
}

const KIND_LABEL: Record<string, string> = {
  clause: "Clause reference",
  recital: "Recital reference",
  schedule: "Schedule reference",
  annexure: "Annexure reference",
  definedTermUnused: "Unused defined term",
  definedTermUndefined: "Possibly undefined term",
};

function downloadBase64Docx(base64: string, filename: string) {
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CrossReferenceCheckSection() {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  const upload = async (file: File) => {
    setChecking(true); setError(null); setResult(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/precedents/cross-reference-check", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setChecking(false);
    if (!res.ok) { setError(json.error || "The check failed"); return; }
    setResult(json);
  };

  const highConfidence = result?.issues.filter(i => i.confidence === "high") ?? [];
  const heuristic = result?.issues.filter(i => i.confidence === "heuristic") ?? [];

  return (
    <div className="bg-white border border-slate-200 rounded-[40px] p-8">
      <div className="flex items-center gap-2 mb-2">
        <FileSearch size={14} className="text-indigo-600" />
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cross-reference check</p>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed mb-5">
        Upload a Word document and check whether its internal cross-references still line up: a
        &ldquo;clause 5.2&rdquo; that no longer exists after edits, a Recital or Schedule reference to something
        that isn&apos;t there, or a defined term nobody ever uses again. Anything found is highlighted in a copy of
        the document with a comment explaining what&apos;s wrong.
      </p>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-rose-50 border border-rose-100 rounded-2xl">
          <AlertTriangle size={13} className="text-rose-500 shrink-0 mt-0.5" />
          <p className="text-[11px] text-rose-700">{error}</p>
        </div>
      )}

      {checking && (
        <div className="flex items-center gap-2 px-4 py-3 mb-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
          <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
          <p className="text-[11px] text-indigo-700">Reading the document and checking its cross-references&hellip;</p>
        </div>
      )}

      {!checking && !result && (
        <div className="border border-dashed border-slate-200 rounded-[24px] py-10 text-center">
          <label className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors cursor-pointer">
            <Upload size={13} /> Upload a document to check
            <input type="file" accept=".docx,.doc" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
          </label>
        </div>
      )}

      {result && !checking && (
        <>
          <div className="flex items-center justify-between p-5 bg-slate-50 rounded-[24px] mb-4">
            <div className="flex items-center gap-3">
              {result.issues.length === 0
                ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                : <AlertTriangle size={18} className="text-amber-500 shrink-0" />}
              <p className="text-[13px] font-bold text-slate-800">
                {result.issues.length === 0
                  ? "No cross-reference issues found"
                  : `${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} found`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadBase64Docx(result.docx, result.filename)}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-[11px] font-bold rounded-full hover:bg-slate-700 transition-colors"
              >
                <Download size={13} /> Download checked copy
              </button>
              <label className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-full hover:bg-slate-50 transition-colors cursor-pointer">
                <Upload size={13} /> Check another
                <input type="file" accept=".docx,.doc" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
              </label>
            </div>
          </div>

          {highConfidence.length > 0 && (
            <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 mb-4">
              {highConfidence.map((issue, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                  <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{KIND_LABEL[issue.kind] ?? issue.kind}</p>
                    <p className="text-[11px] text-slate-700 leading-relaxed">{issue.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {heuristic.length > 0 && (
            <div>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                Worth a second look &mdash; not confirmed issues
              </p>
              <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100">
                {heuristic.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="w-[13px] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">{KIND_LABEL[issue.kind] ?? issue.kind}</p>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{issue.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
