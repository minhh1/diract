// app/dashboard/pdf-editor/page.tsx
// Library view for the standalone PDF editor: upload a PDF, list the company's
// PDFs, open one into <PdfEditor>. Not tied to the document-templates/fill flow.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, Loader2, Trash2, PenSquare } from "lucide-react";
import PdfEditor from "@/components/pdfeditor/PdfEditor";

interface PdfDoc {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export default function PdfEditorPage() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<PdfDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/pdf-editor/list");
    const json = await res.json();
    setDocuments(json.documents || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a .pdf file");
      return;
    }
    setError(null);
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    form.append("name", file.name.replace(/\.pdf$/i, ""));
    const res = await fetch("/api/pdf-editor/upload", { method: "POST", body: form });
    const json = await res.json();
    setUploading(false);
    if (!res.ok) { setError(json.error || "Upload failed"); return; }
    setOpenId(json.document.id);
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this PDF? This can't be undone.")) return;
    await fetch(`/api/pdf-editor/${id}`, { method: "DELETE" });
    load();
  };

  if (openId) {
    return <PdfEditor documentId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-light text-slate-900 tracking-tight">PDF Editor</h1>
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mt-1">Annotate, sign, and edit text in your PDFs</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-5 py-2.5 text-[12px] font-medium bg-slate-900 text-white rounded-full disabled:opacity-50"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          Upload PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handleUpload(e.target.files?.[0])}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-2.5 bg-red-50 text-red-600 text-[12px] rounded-xl">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-[13px] mt-16 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center mt-16 text-slate-400 text-[13px]">
          No PDFs yet — upload one to get started.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-50">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-all group">
              <FileText size={18} className="text-slate-300 shrink-0" />
              <button onClick={() => setOpenId(doc.id)} className="flex-1 min-w-0 text-left">
                <p className="text-[13px] font-medium text-slate-900 truncate">{doc.name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Updated {new Date(doc.updated_at).toLocaleDateString()}
                </p>
              </button>
              <button
                onClick={() => setOpenId(doc.id)}
                title="Edit"
                className="p-2 rounded-full text-slate-400 hover:text-slate-900 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
              >
                <PenSquare size={15} />
              </button>
              <button
                onClick={() => handleDelete(doc.id)}
                title="Delete"
                className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
