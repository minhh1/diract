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
  // Every PDF generator in this app is a fixed single A4 orientation (see
  // each lib/*/generate*.ts's own PAGE_W/PAGE_H) -- the caller already
  // knows which, so it's passed in rather than guessed. Defaults to
  // portrait, the shape of a standalone document (receipt/cheque/invoice);
  // most trust *reports* are landscape and pass that explicitly.
  orientation?: 'portrait' | 'landscape';
  onClose: () => void;
}

export default function PdfPreviewModal({ src, downloadSrc, wordDownloadSrc, title, orientation = 'portrait', onClose }: Props) {
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
      {/* Sized to the ACTUAL A4 aspect ratio of the PDF being shown, not a
          generic box -- a fixed max-width cap (the previous approach) has
          no idea whether the page is portrait or landscape, so the
          browser's built-in PDF viewer would render the correctly-sized
          page at a fixed zoom pinned to one side, leaving a mismatched
          block of blank space rather than looking like a normal page.
          <iframe> is a replaced element (same CSS sizing category as
          img/video), so aspect-ratio + max-w-full max-h-full + w-auto
          h-auto here is the standard "shrink to fit both constraints while
          preserving ratio" technique -- it settles on whichever of the
          modal's width or height is the binding constraint, unlike setting
          height:100% outright (which doesn't reduce to match once width
          gets clamped). Inline style, not a Tailwind aspect-[…] class --
          Tailwind's arbitrary-value class detection is unreliable with a
          decimal ratio like 841.89/595.28, and silently not generating the
          rule left the iframe with no intrinsic size at all, collapsing to
          the browser's ~300x150 default (confirmed live: the preview
          showed visibly smaller than the actual page, not just a mismatched
          shape). The #view=Fit fragment additionally asks the browser's
          own PDF viewer to open at "fit whole page in view" zoom instead of
          its own default (often 100%-literal or fit-width), matching what
          a user sees in a real print preview. */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <iframe
          src={`${src}#view=Fit`}
          title={title || 'PDF preview'}
          className="bg-white rounded-2xl shadow-2xl border-0 w-auto h-auto max-w-full max-h-full"
          style={{ aspectRatio: orientation === 'landscape' ? '841.89 / 595.28' : '595.28 / 841.89' }}
        />
      </div>
    </div>
  );
}
