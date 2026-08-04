"use client";

// Full-screen preview of a PDF, so a user can check a generated document in
// the tab instead of leaving the page (see InvoicesTab.tsx's "Preview PDF"
// row action). Not specific to invoices -- any `src` works.
//
// Renders every page to its own <canvas> via pdf.js instead of embedding the
// PDF in an <iframe> (the previous approach). The iframe route relied on
// each browser's OWN built-in PDF viewer to scale the document to fit --
// confirmed broken on iPadOS Safari specifically: its embedded viewer
// ignored both the CSS box size and the #view=Fit open-parameter hint and
// rendered the page at native zoom, visibly cropped on the right edge
// rather than fit to the box. That's a WebKit plugin quirk, not something
// any CSS on our side can control. Drawing the page ourselves with pdf.js
// (already a dependency here for the PDF editor, see lib/pdfeditor/loadPdf.ts)
// means we pick the scale, so it's correct on every platform by
// construction -- this is exactly "the same view as when preview about to
// print" a user gets from a real print-preview pane, not a viewer-dependent
// approximation of it.
import { useEffect, useRef, useState } from "react";
import { X, Download, FileText, Loader2 } from "lucide-react";
import { loadPdfDocument } from "@/lib/pdfeditor/loadPdf";
import type { PDFPageProxy } from "pdfjs-dist";

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
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const pagesRef = useRef<PDFPageProxy[]>([]);
  const renderTasksRef = useRef<(ReturnType<PDFPageProxy['render']> | null)[]>([]);
  const [pageCount, setPageCount] = useState(0);
  const [failed, setFailed] = useState(false);

  const renderAll = () => {
    const container = containerRef.current;
    if (!container) return;
    const availWidth = Math.max(200, container.clientWidth - 32);
    const dpr = window.devicePixelRatio || 1;
    pagesRef.current.forEach((page, i) => {
      const canvas = canvasRefs.current[i];
      if (!canvas) return;
      renderTasksRef.current[i]?.cancel?.();
      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = availWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: fitScale * dpr });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width / dpr}px`;
      canvas.style.height = `${viewport.height / dpr}px`;
      const task = page.render({ canvas, viewport });
      renderTasksRef.current[i] = task;
      task.promise.catch((e: any) => {
        if (e?.name !== 'RenderingCancelledException') console.error('PdfPreviewModal: page render failed', e);
      });
    });
  };

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: Awaited<ReturnType<typeof loadPdfDocument>> | null = null;
    (async () => {
      try {
        setFailed(false);
        setPageCount(0);
        const res = await fetch(src);
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        pdfDoc = await loadPdfDocument(bytes);
        if (cancelled) return;
        const pages = await Promise.all(
          Array.from({ length: pdfDoc.numPages }, (_, i) => pdfDoc!.getPage(i + 1))
        );
        if (cancelled) return;
        pagesRef.current = pages;
        canvasRefs.current = new Array(pages.length).fill(null);
        renderTasksRef.current = new Array(pages.length).fill(null);
        setPageCount(pages.length);
      } catch (e) {
        if (cancelled) return;
        console.error('PdfPreviewModal: failed to load PDF', e);
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      renderTasksRef.current.forEach(t => t?.cancel?.());
      pdfDoc?.loadingTask.destroy();
    };
  }, [src]);

  useEffect(() => {
    if (pageCount === 0) return;
    const raf = requestAnimationFrame(renderAll);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || pageCount === 0) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(renderAll);
    });
    ro.observe(container);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageCount]);

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
      <div ref={containerRef} className="flex-1 overflow-y-auto">
        {failed ? (
          <p className="text-center text-white/70 text-[12px] mt-16">Couldn't load the preview. Try the download button instead.</p>
        ) : pageCount === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={20} className="text-white/50 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 pb-6">
            {Array.from({ length: pageCount }).map((_, i) => (
              <canvas
                key={i}
                ref={el => { canvasRefs.current[i] = el; }}
                className="bg-white rounded-2xl shadow-2xl"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
