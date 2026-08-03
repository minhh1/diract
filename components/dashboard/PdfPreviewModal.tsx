"use client";

// Lightweight full-screen iframe embed of a PDF, so a user can preview a
// generated document in the tab instead of leaving the page (see
// InvoicesTab.tsx's "Preview PDF" row action). Not specific to invoices --
// any `src` works.
import { X, Download, FileText } from "lucide-react";

interface Props {
  src: string;
  downloadSrc?: string;
  // Invoices only, for now -- see generateInvoiceDocx.ts. Optional so every
  // other caller of this generic PDF-preview modal is unaffected.
  wordDownloadSrc?: string;
  title?: string;
  onClose: () => void;
}

export default function PdfPreviewModal({ src, downloadSrc, wordDownloadSrc, title, onClose }: Props) {
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
              <Download size={13} /> PDF
            </a>
          )}
          {wordDownloadSrc && (
            <a
              href={wordDownloadSrc}
              className="flex items-center gap-2 px-3 py-2 bg-white/10 text-white rounded-full text-[11px] font-bold hover:bg-white/20 transition-all"
            >
              <FileText size={13} /> Word
            </a>
          )}
          <button onClick={onClose} className="p-2 text-white/70 hover:text-white"><X size={18} /></button>
        </div>
      </div>
      {/* Capped at a realistic single-page width (max-w-3xl) and centred --
          without this, the iframe stretched edge-to-edge on a wide/landscape
          viewport, and the browser's built-in PDF viewer rendered the
          (correctly A4-sized) page at a fixed zoom pinned to one side,
          leaving a huge block of blank space rather than looking like a
          normal page. Landscape-orientation PDFs (the wide trust reports)
          still get plenty of room within 3xl; this only stops portrait
          documents from being stretched needlessly wide. */}
      <div className="flex-1 flex justify-center overflow-hidden">
        <div className="w-full max-w-3xl h-full bg-white rounded-2xl overflow-hidden">
          <iframe src={src} className="w-full h-full border-0" title={title || 'PDF preview'} />
        </div>
      </div>
    </div>
  );
}
