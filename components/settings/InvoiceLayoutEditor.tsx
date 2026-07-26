// components/settings/InvoiceLayoutEditor.tsx
// Full-screen visual editor for one invoice template's layout: drag the
// logo/firm-details/title/bill-to blocks anywhere in the header, and
// reorder/resize the fee/disbursement table's numeric columns. Opened from
// TemplatesSection (InvoiceTemplateSettingsTab.tsx).
//
// Renders a REAL sample PDF via pdf.js -- same loader (lib/pdfeditor/loadPdf.ts)
// and coordinate-conversion approach (viewport.convertToViewportPoint /
// convertToPdfPoint) components/pdfeditor/PdfPageView.tsx already uses for
// the Precedents document editor, just with a smaller, purpose-built
// vocabulary of draggable elements (named header anchors) instead of a
// general annotation op log. While dragging, only the handle's outline
// moves (fast, local state); on drop the draft layout updates and a fresh
// preview PDF is fetched (debounced) and swapped in -- avoids needing to
// duplicate pdf-lib's text rendering as live HTML just for instant feedback.
"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { X, Loader2, GripVertical, RotateCcw } from "lucide-react";
import { loadPdfDocument } from "@/lib/pdfeditor/loadPdf";
import {
  DEFAULT_INVOICE_LAYOUT, type InvoiceLayout, type InvoiceLayoutColumn, type InvoiceTemplateDisplay,
} from "@/lib/invoices/generateInvoicePdf";
import type { InvoiceTemplateConfig } from "@/lib/invoices/types";

interface Props {
  template: InvoiceTemplateConfig;
  onClose: () => void;
  onSave: (layout: InvoiceLayout) => void;
}

type HandleId = 'logo' | 'firmDetails' | 'titleBlock' | 'billTo';

// Fixed nominal size for each handle's drag box -- these aren't exact text
// bounding boxes (pdf-lib text has no natural "box"), just enough to grab
// and see roughly what's being moved. `align: 'right'` means the anchor's
// x is the box's RIGHT edge (matches firmDetails being right-aligned in
// generateInvoicePdf.ts), everything else is left-aligned.
const HANDLES: { id: HandleId; label: string; align: 'left' | 'right'; w: number; h: number }[] = [
  { id: 'logo', label: 'Logo', align: 'left', w: 160, h: 60 },
  { id: 'firmDetails', label: 'Firm details', align: 'right', w: 220, h: 66 },
  { id: 'titleBlock', label: 'Title & invoice details', align: 'left', w: 340, h: 66 },
  { id: 'billTo', label: 'Bill to', align: 'left', w: 250, h: 60 },
];

const PREVIEW_SCALE = 1.15;
const PREVIEW_DEBOUNCE_MS = 400;

const COLUMN_LABELS: Record<InvoiceLayoutColumn['key'], string> = {
  amount: 'Amount', gst: 'GST', hours: 'Hours', rate: 'Rate',
};

function isColumnVisible(key: InvoiceLayoutColumn['key'], display: InvoiceTemplateDisplay): boolean {
  if (key === 'rate') return display.showRatePerLine;
  if (key === 'hours') return display.showHoursPerLine;
  return display.showAmountAndGstPerLine; // 'gst' | 'amount'
}

export default function InvoiceLayoutEditor({ template, onClose, onSave }: Props) {
  const [layout, setLayout] = useState<InvoiceLayout>(template.layout ?? DEFAULT_INVOICE_LAYOUT);
  const [pdfPage, setPdfPage] = useState<PDFPageProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchPreview = useCallback(async (draftLayout: InvoiceLayout): Promise<PDFPageProxy> => {
    const res = await fetch('/api/invoices/template-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display: template.display, layout: draftLayout }),
    });
    if (!res.ok) throw new Error('preview request failed');
    const buf = new Uint8Array(await res.arrayBuffer());
    const doc = await loadPdfDocument(buf);
    return doc.getPage(1);
  }, [template.display]);

  // Initial load.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const page = await fetchPreview(layout);
        if (active) { setPdfPage(page); setLoading(false); }
      } catch {
        if (active) { setError('Could not load the preview.'); setLoading(false); }
      }
    })();
    return () => { active = false; };
    // Deliberately empty deps -- this is the ONE initial fetch; every
    // subsequent layout change is handled by the debounced effect below,
    // not this one (re-running this on every keystroke would race with it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced re-preview whenever the draft layout changes after the first load.
  const firstRunRef = useRef(true);
  useEffect(() => {
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    setRefreshing(true);
    const t = setTimeout(async () => {
      try {
        const page = await fetchPreview(layout);
        setPdfPage(page);
        setError(null);
      } catch {
        setError('Could not refresh the preview.');
      } finally {
        setRefreshing(false);
      }
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [layout, fetchPreview]);

  const viewport = useMemo(() => pdfPage?.getViewport({ scale: PREVIEW_SCALE }) ?? null, [pdfPage]);

  // Render the canvas bitmap whenever a new preview page arrives.
  useEffect(() => {
    if (!pdfPage || !viewport || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const task = pdfPage.render({ canvas, viewport });
      await task.promise;
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [pdfPage, viewport]);

  // ── Drag handling for the 4 header anchors ──────────────────────────
  const dragStateRef = useRef<{ id: HandleId; startClientX: number; startClientY: number; startX: number; startY: number } | null>(null);
  const [dragOffsetPx, setDragOffsetPx] = useState<{ id: HandleId; dx: number; dy: number } | null>(null);

  const beginDrag = (id: HandleId, e: React.PointerEvent) => {
    const anchor = layout[id];
    dragStateRef.current = { id, startClientX: e.clientX, startClientY: e.clientY, startX: anchor.x, startY: anchor.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    setDragOffsetPx({ id: ds.id, dx: e.clientX - ds.startClientX, dy: e.clientY - ds.startClientY });
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds || !viewport) return;
    dragStateRef.current = null;
    setDragOffsetPx(null);
    const dx = e.clientX - ds.startClientX, dy = e.clientY - ds.startClientY;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return; // click, not a drag
    const [origSx, origSy] = viewport.convertToViewportPoint(ds.startX, ds.startY);
    const [newX, newY] = viewport.convertToPdfPoint(origSx + dx, origSy + dy);
    setLayout(prev => ({ ...prev, [ds.id]: { ...prev[ds.id], x: newX, y: newY } }));
  };

  const handleScreenRect = (handle: typeof HANDLES[number]) => {
    if (!viewport) return null;
    const anchor = layout[handle.id];
    const x0 = handle.align === 'right' ? anchor.x - handle.w : anchor.x;
    const [sx1, sy1] = viewport.convertToViewportPoint(x0, anchor.y);
    const [sx2, sy2] = viewport.convertToViewportPoint(x0 + handle.w, anchor.y - handle.h);
    return { left: Math.min(sx1, sx2), top: Math.min(sy1, sy2), width: Math.abs(sx2 - sx1), height: Math.abs(sy2 - sy1) };
  };

  const columnEditor = (title: string, key: 'feeColumns' | 'disbColumns') => (
    <ColumnEditor
      title={title}
      columns={layout[key]}
      display={template.display}
      onChange={cols => setLayout(prev => ({ ...prev, [key]: cols }))}
    />
  );

  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-6xl h-[90vh] rounded-[32px] shadow-2xl flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-light uppercase tracking-wide text-slate-900">Edit layout — {template.name}</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Drag the header blocks below, or reorder/resize the table columns on the right.</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-300 hover:text-black"><X size={18} /></button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center">
            {loading ? (
              <div className="self-center"><Loader2 size={24} className="animate-spin text-slate-400" /></div>
            ) : error && !pdfPage ? (
              <p className="self-center text-[12px] text-rose-500">{error}</p>
            ) : (
              <div className="relative shrink-0 shadow-lg" style={{ width: viewport?.width, height: viewport?.height }}>
                <canvas ref={canvasRef} className="absolute inset-0" />
                {refreshing && (
                  <div className="absolute top-2 right-2 bg-white/90 rounded-full p-1.5 shadow"><Loader2 size={14} className="animate-spin text-indigo-500" /></div>
                )}
                {viewport && HANDLES.map(h => {
                  const rect = handleScreenRect(h);
                  if (!rect) return null;
                  const offset = dragOffsetPx?.id === h.id ? dragOffsetPx : null;
                  return (
                    <div
                      key={h.id}
                      onPointerDown={e => beginDrag(h.id, e)}
                      onPointerMove={onDragMove}
                      onPointerUp={onDragEnd}
                      className="absolute border-2 border-dashed border-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/20 transition-colors cursor-move flex items-start justify-start"
                      style={{
                        left: rect.left + (offset?.dx ?? 0), top: rect.top + (offset?.dy ?? 0),
                        width: rect.width, height: rect.height,
                      }}
                    >
                      <span className="text-[9px] font-bold text-indigo-700 bg-white/95 px-1.5 py-0.5 rounded-br-md pointer-events-none">{h.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-72 shrink-0 border-l border-slate-100 p-5 space-y-5 overflow-y-auto">
            {columnEditor('Fee table columns', 'feeColumns')}
            {columnEditor('Disbursement table columns', 'disbColumns')}
            <button
              onClick={() => setLayout(DEFAULT_INVOICE_LAYOUT)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-slate-600"
            >
              <RotateCcw size={12} /> Reset to default
            </button>
          </div>
        </div>

        <div className="shrink-0 flex gap-3 p-5 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-50 text-slate-600 rounded-full text-[11px] font-bold uppercase tracking-widest hover:bg-slate-100 transition-all">
            Cancel
          </button>
          <button onClick={() => onSave(layout)} className="flex-1 py-3 bg-indigo-600 text-white rounded-full text-[11px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all">
            Save layout
          </button>
        </div>
      </div>
    </div>
  );
}

function ColumnEditor({
  title, columns, display, onChange,
}: { title: string; columns: InvoiceLayoutColumn[]; display: InvoiceTemplateDisplay; onChange: (cols: InvoiceLayoutColumn[]) => void }) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [resizePreview, setResizePreview] = useState<{ idx: number; width: number } | null>(null);
  const resizeStateRef = useRef<{ idx: number; startClientX: number; startWidth: number } | null>(null);

  const handleDrop = (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) { setDragIdx(null); return; }
    const next = [...columns];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(targetIdx, 0, moved);
    onChange(next);
    setDragIdx(null);
  };

  const beginResize = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    resizeStateRef.current = { idx, startClientX: e.clientX, startWidth: columns[idx].width };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const rs = resizeStateRef.current;
    if (!rs) return;
    setResizePreview({ idx: rs.idx, width: Math.round(Math.min(200, Math.max(30, rs.startWidth + (e.clientX - rs.startClientX)))) });
  };
  const onResizeEnd = (e: React.PointerEvent) => {
    const rs = resizeStateRef.current;
    if (!rs) return;
    resizeStateRef.current = null;
    const width = Math.round(Math.min(200, Math.max(30, rs.startWidth + (e.clientX - rs.startClientX))));
    setResizePreview(null);
    onChange(columns.map((c, i) => i === rs.idx ? { ...c, width } : c));
  };

  return (
    <div>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">{title}</p>
      <div className="flex flex-col gap-1.5">
        {columns.map((col, i) => {
          if (!isColumnVisible(col.key, display)) return null;
          const width = resizePreview?.idx === i ? resizePreview.width : col.width;
          return (
            <div
              key={col.key}
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => handleDrop(i)}
              className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-full pl-2 pr-2 py-1.5 text-[11px] font-semibold text-slate-600 cursor-grab"
            >
              <GripVertical size={11} className="text-slate-300 shrink-0" />
              <span className="flex-1">{COLUMN_LABELS[col.key]}</span>
              <span className="text-slate-300 shrink-0">{width}pt</span>
              <span
                onPointerDown={e => beginResize(i, e)}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeEnd}
                title="Drag to resize"
                className="w-3 h-4 shrink-0 cursor-ew-resize text-slate-300 hover:text-indigo-500 flex items-center justify-center select-none"
              >
                ‖
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-300 mt-1.5">Drag to reorder, drag the ‖ handle to resize. Columns not shown are hidden by "What to include" below.</p>
    </div>
  );
}
