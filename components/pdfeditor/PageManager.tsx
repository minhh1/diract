// components/pdfeditor/PageManager.tsx
// Full-screen modal for restructuring the document's pages: append pages from
// another uploaded PDF, remove a page, and drag a thumbnail to any position to
// reorder. "Apply" builds the final PDF with pdf-lib (copyPages per entry, in
// the current thumbnail order) and hands the new bytes back to PdfEditor as
// its new working copy — the same in-memory-until-Save model already used for
// annotations. The caller is responsible for clearing the ops log on apply,
// since page indices are invalidated by any reorder/removal.
"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { X, Upload, Loader2, GripVertical } from "lucide-react";
import { loadPdfDocument } from "@/lib/pdfeditor/loadPdf";

interface PageEntry {
  id: string;
  kind: "current" | "external";
  pageIndex: number; // 0-indexed within its source
  sourceId?: string; // groups pages that came from the same uploaded file
  bytes?: Uint8Array; // only for kind "external"
  thumbnail: string | null;
}

interface Props {
  pages: PDFPageProxy[]; // the current document's already-loaded pages
  originalBytes: Uint8Array;
  onApply: (newBytes: Uint8Array) => void;
  onCancel: () => void;
}

async function renderThumbnail(page: PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 0.22 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport }).promise;
  return canvas.toDataURL("image/png");
}

export default function PageManager({ pages, originalBytes, onApply, onCancel }: Props) {
  const [entries, setEntries] = useState<PageEntry[]>([]);
  const [adding, setAdding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dropzoneActive, setDropzoneActive] = useState(false);
  const [fileInsertIndex, setFileInsertIndex] = useState<number | null>(null);
  const [insertLine, setInsertLine] = useState<{ left: number; top: number; height: number } | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Initial entries: one per current page, thumbnails filled in as they render.
  useEffect(() => {
    let cancelled = false;
    setEntries(pages.map((_, i) => ({ id: `current-${i}`, kind: "current", pageIndex: i, thumbnail: null })));
    (async () => {
      for (let i = 0; i < pages.length; i++) {
        const thumbnail = await renderThumbnail(pages[i]);
        if (cancelled) return;
        const id = `current-${i}`;
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, thumbnail } : e)));
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages]);

  // insertAt: page position to insert at (undefined = append at the end, used
  // by the "Add pages" button which has no drop position to go on).
  const addFilePages = async (file: File, insertAt?: number) => {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      setError("Please add a .pdf file");
      return;
    }
    setError(null);
    setAdding(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await loadPdfDocument(bytes);
      const sourceId = crypto.randomUUID();
      for (let i = 0; i < doc.numPages; i++) {
        const page = await doc.getPage(i + 1);
        const thumbnail = await renderThumbnail(page);
        const newEntry: PageEntry = { id: crypto.randomUUID(), kind: "external", pageIndex: i, sourceId, bytes, thumbnail };
        setEntries((prev) => {
          if (insertAt === undefined) return [...prev, newEntry];
          // Each subsequent page of this file goes right after the previous one.
          const at = Math.min(insertAt + i, prev.length);
          const next = [...prev];
          next.splice(at, 0, newEntry);
          return next;
        });
      }
    } catch (e: any) {
      setError(e?.message || "Could not read that PDF");
    } finally {
      setAdding(false);
    }
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => (prev.length <= 1 ? prev : prev.filter((e) => e.id !== id)));
  };

  const handleDragStart = (index: number) => { dragIndexRef.current = index; };

  // Dragging a thumbnail (internal reorder) highlights the target card as a
  // drop target; dragging a file in from outside instead shows a prominent
  // vertical bar exactly between two cards (computed from the hovered card's
  // rect, on whichever side the cursor is closer to), so it can be dropped at
  // a specific spot rather than always landing at the end. A subtle border
  // tint alone was too easy to miss, hence a floating bar instead.
  const handleDragOverCard = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIndexRef.current !== null) {
      setDragOverIndex(index);
      return;
    }
    if (!e.dataTransfer.types.includes("Files")) return;
    setDropzoneActive(false); // the precise line takes over from the generic banner
    const cardRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const gridRect = gridRef.current!.getBoundingClientRect();
    const isAfter = e.clientX - cardRect.left > cardRect.width / 2;
    setFileInsertIndex(isAfter ? index + 1 : index);
    setInsertLine({
      left: (isAfter ? cardRect.right : cardRect.left) - gridRect.left,
      top: cardRect.top - gridRect.top,
      height: cardRect.height,
    });
  };

  const handleCardDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDropzoneActive(false);
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);

    if (from !== null) {
      if (from === index) return;
      setEntries((prev) => {
        const next = [...prev];
        const [moved] = next.splice(from, 1);
        next.splice(index, 0, moved);
        return next;
      });
      return;
    }

    const insertAt = fileInsertIndex ?? index;
    setFileInsertIndex(null);
    setInsertLine(null);
    const file = e.dataTransfer.files?.[0];
    if (file) addFilePages(file, insertAt);
  };

  const handleZoneDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndexRef.current === null && e.dataTransfer.types.includes("Files")) setDropzoneActive(true);
  };
  const handleZoneDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropzoneActive(false);
    if (dragIndexRef.current !== null) return; // an internal reorder drop, not a file drop
    const insertAt = fileInsertIndex ?? undefined;
    setFileInsertIndex(null);
    setInsertLine(null);
    const file = e.dataTransfer.files?.[0];
    if (file) addFilePages(file, insertAt);
  };

  const handleApply = async () => {
    setApplying(true);
    setError(null);
    try {
      const { PDFDocument } = await import("pdf-lib");
      const outDoc = await PDFDocument.create();
      const currentDoc = await PDFDocument.load(originalBytes);
      const externalDocCache = new Map<string, Awaited<ReturnType<typeof PDFDocument.load>>>();

      for (const entry of entries) {
        if (entry.kind === "current") {
          const [copied] = await outDoc.copyPages(currentDoc, [entry.pageIndex]);
          outDoc.addPage(copied);
        } else {
          let doc = externalDocCache.get(entry.sourceId!);
          if (!doc) {
            doc = await PDFDocument.load(entry.bytes!);
            externalDocCache.set(entry.sourceId!, doc);
          }
          const [copied] = await outDoc.copyPages(doc, [entry.pageIndex]);
          outDoc.addPage(copied);
        }
      }
      const newBytes = await outDoc.save();
      onApply(newBytes);
    } catch (e: any) {
      setError(e?.message || "Could not apply page changes");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col relative"
        onDragOver={handleZoneDragOver}
        onDragLeave={() => { setDropzoneActive(false); setFileInsertIndex(null); setInsertLine(null); }}
        onDrop={handleZoneDrop}
      >
        {dropzoneActive && (
          <div className="absolute inset-0 z-10 bg-indigo-600/10 border-4 border-dashed border-indigo-400 rounded-2xl flex items-center justify-center pointer-events-none">
            <p className="text-indigo-700 text-sm font-bold bg-white px-6 py-3 rounded-full shadow-lg">Drop a PDF to add its pages</p>
          </div>
        )}

        <div className="flex items-center justify-between p-5 border-b border-slate-100 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Manage pages</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Drag to reorder, add pages from another PDF, or remove a page.</p>
          </div>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-50">
            <X size={18} />
          </button>
        </div>

        {error && <div className="mx-5 mt-4 px-4 py-2.5 bg-red-50 text-red-600 text-[12px] rounded-xl shrink-0">{error}</div>}

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div ref={gridRef} className="relative grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {insertLine && (
              <div
                className="absolute w-1 bg-indigo-500 rounded-full pointer-events-none z-20 shadow-[0_0_0_3px_rgba(99,102,241,0.25)]"
                style={{ left: insertLine.left - 2, top: insertLine.top, height: insertLine.height }}
              />
            )}
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                draggable
                onDragStart={() => handleDragStart(i)}
                onDragOver={(e) => handleDragOverCard(e, i)}
                onDrop={(e) => handleCardDrop(e, i)}
                onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); setFileInsertIndex(null); setInsertLine(null); }}
                className={`relative group border rounded-xl overflow-hidden bg-slate-50 cursor-grab active:cursor-grabbing transition-all ${
                  dragOverIndex === i ? "border-indigo-400 ring-2 ring-indigo-200" : "border-slate-200"
                }`}
              >
                <div className="aspect-[3/4] flex items-center justify-center bg-white">
                  {entry.thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={entry.thumbnail} alt={`Page ${i + 1}`} className="max-w-full max-h-full object-contain" draggable={false} />
                  ) : (
                    <Loader2 size={18} className="animate-spin text-slate-300" />
                  )}
                </div>
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-white/90 rounded-full px-2 py-0.5 text-[10px] font-bold text-slate-500">
                  <GripVertical size={11} className="text-slate-300" />
                  {i + 1}
                </div>
                <button
                  onClick={() => removeEntry(entry.id)}
                  disabled={entries.length <= 1}
                  title="Remove page"
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-white/90 text-slate-500 hover:text-red-500 hover:bg-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                >
                  <X size={13} />
                </button>
              </div>
            ))}

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={adding}
              className="aspect-[3/4] border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 transition-all"
            >
              {adding ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
              <span className="text-[11px] font-medium">Add pages</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) addFilePages(f); e.target.value = ""; }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 border-t border-slate-100 shrink-0">
          <button onClick={onCancel} className="px-4 py-2 text-[12px] font-medium text-slate-500 hover:text-slate-800">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="flex items-center gap-2 px-5 py-2.5 text-[12px] font-medium bg-slate-900 text-white rounded-full disabled:opacity-50"
          >
            {applying ? <Loader2 size={14} className="animate-spin" /> : null}
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
