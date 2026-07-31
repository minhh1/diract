"use client";

// Shared attachment list + uploader -- used by AttachmentsSubtab.tsx (the
// project-wide "Attachments" tab) and, scoped via attachableTable/
// attachableId, by a small per-budget-line popover in
// BudgetVsActualTable.tsx. No reusable dropzone component exists
// anywhere in this codebase (every prior upload feature hand-rolls the
// same hidden-<input>-triggered-by-a-button shape), so this follows that
// same convention rather than inventing one.
import { useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, Trash2, Upload, Download } from "lucide-react";

interface Attachment {
  id: string;
  name: string;
  file_size: number | null;
  content_type: string | null;
  created_at: string;
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsList({
  projectId, attachableTable, attachableId, compact,
}: {
  projectId: string;
  attachableTable?: "budget_line" | "task";
  attachableId?: string;
  compact?: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams({ projectId });
    if (attachableTable && attachableId) {
      params.set("attachableTable", attachableTable);
      params.set("attachableId", attachableId);
    } else {
      params.set("generalOnly", "true");
    }
    const res = await fetch(`/api/finance-model/attachments?${params}`);
    const json = await res.json();
    setAttachments(json.attachments || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId, attachableTable, attachableId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("projectId", projectId);
      if (attachableTable && attachableId) {
        form.append("attachableTable", attachableTable);
        form.append("attachableId", attachableId);
      }
      await fetch("/api/finance-model/attachments/upload", { method: "POST", body: form });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    await load();
    setUploading(false);
  };

  const download = async (id: string) => {
    const res = await fetch(`/api/finance-model/attachments/${id}`);
    const json = await res.json();
    if (json.url) window.open(json.url, "_blank");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this attachment?")) return;
    setAttachments(prev => prev.filter(a => a.id !== id));
    await fetch(`/api/finance-model/attachments?id=${id}`, { method: "DELETE" });
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {loading ? (
        <p className="text-[12px] text-slate-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading...</p>
      ) : attachments.length === 0 ? (
        <p className="text-[12px] text-slate-400">No attachments yet.</p>
      ) : (
        <div className="space-y-1.5">
          {attachments.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-2xl">
              <Paperclip size={12} className="text-slate-400 shrink-0" />
              <p className="text-[12px] font-medium text-slate-700 flex-1 truncate">{a.name}</p>
              <span className="text-[10px] text-slate-400 shrink-0">{formatSize(a.file_size)}</span>
              <button onClick={() => download(a.id)} className="text-slate-300 hover:text-indigo-600 shrink-0" title="Download">
                <Download size={12} />
              </button>
              <button onClick={() => remove(a.id)} className="text-slate-300 hover:text-rose-500 shrink-0" title="Delete">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:underline disabled:opacity-40"
      >
        {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} {uploading ? "Uploading..." : "Upload file"}
      </button>
    </div>
  );
}
