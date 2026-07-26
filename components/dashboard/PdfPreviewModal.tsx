"use client";

// Lightweight full-screen iframe embed of a PDF, so a user can preview a
// generated document in the tab instead of leaving the page (see
// InvoicesTab.tsx's "Preview PDF" row action). Not specific to invoices --
// any `src` works.
import { X, Download } from "lucide-react";

interface Props {
  src: string;
  downloadSrc?: string;
  title?: string;
  onClose: () => void;
}

export default function PdfPreviewModal({ src, downloadSrc, title, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/70 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-white text-[13px] font-medium">{title || 'Preview'}</p>
        <div className="flex items-center gap-2">
          {downloadSrc && (
            <a
              href={downloadSrc}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 text-white rounded-full text-[11px] font-bold hover:bg-white/20 transition-all"
            >
              <Download size={13} /> Download
            </a>
          )}
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white"><X size={18} /></button>
        </div>
      </div>
      <div className="flex-1 bg-white rounded-2xl overflow-hidden">
        <iframe src={src} className="w-full h-full border-0" title={title || 'PDF preview'} />
      </div>
    </div>
  );
}
