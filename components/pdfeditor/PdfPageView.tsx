// components/pdfeditor/PdfPageView.tsx
// Renders one PDF page: the pdf.js canvas bitmap, pdf.js's own TextLayer (correctly
// positioned per-run text spans — reused rather than hand-computing span boxes),
// an overlay for committed annotations (highlight/textbox/draw/signature), and an
// interaction layer that captures pointer events for the active annotation tool.
// All PDF-space <-> screen-space conversion goes through the page's pdf.js
// viewport (convertToPdfPoint / convertToViewportPoint) — no hand-rolled matrices.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFPageProxy } from "pdfjs-dist";
import { TextCursor } from "lucide-react";
import type { CheckboxOp, CheckboxStyle, DrawOp, HighlightOp, ImageOp, PdfEditOp, TextBoxOp, TextRun, ToolId } from "@/lib/pdfeditor/types";
import { matchStandardFont, standardFontCss } from "@/lib/pdfeditor/fontMatch";

// Shared offscreen canvas for text-width measurement — used to auto-grow the
// inline-edit input as the user types and to size the matching post-commit
// overlay, so the two line up with no visual jump between them.
let measureCanvas: HTMLCanvasElement | null = null;

// Real ☐/☒/⊠/☑ Unicode glyphs for the committed-checkbox render below, drawn
// from the same bundled symbol font applyEdits.ts embeds into the saved PDF
// (see its own top-of-file comment, including why this is a .ttf and not a
// .woff/.woff2, and why it's DejaVu Sans rather than a Noto symbol font) —
// loaded once per session via the Font Loading API (not a CSS @font-face,
// since there's no stylesheet to put one in here) and cached module-wide the
// same way measureCanvas above is, rather than per-PdfPageView-instance
// (every page would otherwise redo it).
const CHECKBOX_FONT_FAMILY = "PdfEditorCheckboxSymbols";
const CHECKBOX_EMPTY_CHAR = "☐"; // U+2610 -- every style's unchecked state
const CHECKBOX_X_CHAR = "☒"; // U+2612 -- "ballot-x" style, checked
const CHECKBOX_SQUARED_TIMES_CHAR = "⊠"; // U+22A0 -- "squared-times" style, checked
const CHECKBOX_CHECK_CHAR = "☑"; // U+2611 -- "ballot-check" style, checked
let checkboxFontLoadPromise: Promise<void> | null = null;
function ensureCheckboxFontLoaded(): Promise<void> {
  if (!checkboxFontLoadPromise) {
    checkboxFontLoadPromise = (async () => {
      const face = new FontFace(CHECKBOX_FONT_FAMILY, "url(/fonts/checkbox-symbols.ttf)");
      await face.load();
      document.fonts.add(face);
    })();
  }
  return checkboxFontLoadPromise;
}
// Single-glyph checkbox characters commonly used in generated business PDFs
// (ballot box, white square variants, shadowed/dingbat squares), plus plain
// bracket-style boxes some documents use instead of a real glyph. The
// "already checked" variants are recognized separately so a first click
// unchecks them (draws an empty box) rather than adding a redundant mark.
const CHECKBOX_EMPTY_GLYPH = /^[☐□▢▫❐❑❒⬜]$/u;
const CHECKBOX_CHECKED_GLYPH = /^[☑☒⬛]$/u;
function isCheckboxGlyph(str: string): boolean {
  const t = str.trim();
  if (t.length === 1 && (CHECKBOX_EMPTY_GLYPH.test(t) || CHECKBOX_CHECKED_GLYPH.test(t))) return true;
  return /^\[\s*\]$/.test(t) || /^\(\s*\)$/.test(t) || /^\[[xX]\]$/.test(t);
}
function isCheckedGlyph(str: string): boolean {
  const t = str.trim();
  return CHECKBOX_CHECKED_GLYPH.test(t) || /^\[[xX]\]$/.test(t);
}

// Side length (PDF points) for a checkbox freehand-placed via the "Checkbox"
// tool, where there's no source glyph to size it from. Confirmed against a
// real contract's own checkbox, not just eyeballed: measured its actual
// rendered outer border-to-border footprint via pixel analysis (pngjs
// against a 400dpi render of the original page) at ~9.9-10.1pt on both
// sides, i.e. already matches -- close enough that most placements need no
// further resizing.
const DEFAULT_CHECKBOX_SIZE_PDF = 10;

// How far (PDF points) the checkbox's whiteout extends past its own drawn
// box -- FLAT amounts, not proportional to the box's own size, because the
// two are unrelated: DEFAULT_CHECKBOX_SIZE_PDF above is how big the NEW
// drawn box looks, but the ORIGINAL checkbox it needs to fully hide could be
// a different size entirely, positioned wherever the user's click happened
// to land relative to its true (unknown -- see CheckboxOp's doc comment)
// center. Kept modest in BOTH directions: swept 18 different checkbox/label
// pairs across a real contract (pngjs pixel analysis against a 400dpi
// render, cross-checked with `pdftotext -bbox` for each label's real
// position) rather than trusting just the one location tried earlier, and
// found the real minimum gap to a label's first letter is ~3.25pt ("fixed
// floor coverings", tightest of the 18) and the real minimum row-to-row
// spacing is ~13.5pt (the inclusions grid) -- both tighter than they first
// looked from a single sample, and both tighter than a 5pt/3pt pad (10pt box
// + that padding = 16pt tall, taller than the 13.5pt row spacing it needs to
// fit inside). See applyEdits.ts's matching save-time constants.
const CHECKBOX_WHITEOUT_PAD_X_PDF = 2.5;
const CHECKBOX_WHITEOUT_PAD_Y_PDF = 1.5;

function measureTextWidth(text: string, fontSizePx: number, fontFamily: string): number {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d")!;
  ctx.font = `${fontSizePx}px ${fontFamily}`;
  return ctx.measureText(text || " ").width;
}

// Ink-box ratios (per 1px of font size) for a checkbox glyph -- used instead
// of measureTextWidth above for that one case, since Canvas 2D's plain
// .width is an ADVANCE metric (how much horizontal space the character
// reserves) rather than how big the shape actually drawn inside it is.
// Confirmed directly against this font's own glyph data (fontkit, matching
// applyEdits.ts's own computeGlyphPlacement) that the visible box on every
// one of these glyphs is only ~80% of that advance width -- sizing off it
// rendered a checkbox that looked visibly smaller than the box it was meant
// to fill. actualBoundingBox{Left,Right,Ascent,Descent} are Canvas's own ink
// metrics, the browser-side equivalent of the font's real glyph bbox.
function measureGlyphInkRatios(glyph: string, fontFamily: string): { widthRatio: number; heightRatio: number } {
  if (!measureCanvas) measureCanvas = document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d")!;
  const probeSize = 100;
  ctx.font = `${probeSize}px ${fontFamily}`;
  const m = ctx.measureText(glyph);
  return {
    widthRatio: (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) / probeSize,
    heightRatio: (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) / probeSize,
  };
}

// Reads the current browser text selection as a [start, end) character range
// relative to `container`'s concatenated text content — the standard technique
// for mapping window.getSelection() (which is per-text-node) onto a flat
// string offset, used to know which part of a text box's runs to reformat.
function getSelectionOffsetsWithin(container: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const preRange = document.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(range.startContainer, range.startOffset);
  const start = preRange.toString().length;
  const end = start + range.toString().length;
  return end > start ? { start, end } : null;
}

function runsSliceAllTrue(runs: TextRun[], start: number, end: number, key: "bold" | "italic" | "underline"): boolean {
  let pos = 0;
  for (const r of runs) {
    const runStart = pos, runEnd = pos + r.text.length;
    pos = runEnd;
    if (runEnd <= start || runStart >= end) continue;
    if (!r[key]) return false;
  }
  return true;
}

// Splits runs at [start, end) and applies `patch` only to the covered slice,
// then merges back-to-back runs left with identical formatting.
function splitAndPatchRuns(runs: TextRun[], start: number, end: number, patch: Partial<TextRun>): TextRun[] {
  const out: TextRun[] = [];
  let pos = 0;
  for (const run of runs) {
    const runStart = pos, runEnd = pos + run.text.length;
    pos = runEnd;
    if (runEnd <= start || runStart >= end || !run.text) { out.push(run); continue; }

    const cuts = [runStart, Math.max(runStart, start), Math.min(runEnd, end), runEnd].filter((v, i, arr) => arr.indexOf(v) === i).sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const from = cuts[i], to = cuts[i + 1];
      const segText = run.text.slice(from - runStart, to - runStart);
      if (!segText) continue;
      const inSelection = from >= start && to <= end;
      out.push(inSelection ? { ...run, ...patch, text: segText } : { ...run, text: segText });
    }
  }
  const merged: TextRun[] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && last.bold === r.bold && last.italic === r.italic && last.underline === r.underline) {
      last.text += r.text;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

// pdfjs-dist doesn't re-export TextContent/TextItem from its top-level types
// module — shapes mirrored here from display/api.d.ts (str/transform/width/
// height/fontName/hasEOL, plus the page's fontName -> fontFamily style map).
interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
}
interface PdfTextContent {
  items: (PdfTextItem | Record<string, unknown>)[];
  styles: Record<string, { fontFamily: string; ascent: number; descent: number; vertical: boolean }>;
}

interface Props {
  pdfPage: PDFPageProxy;
  pageIndex: number; // 0-indexed
  scale: number;
  ops: PdfEditOp[]; // all pages' ops
  activeTool: ToolId;
  checkboxStyle: CheckboxStyle; // which mark a freshly-placed checkbox uses -- see the toolbar's own style picker in PdfEditor.tsx
  placeChecked: boolean; // whether a freshly-placed checkbox starts checked (the default) or already unchecked -- see EMPTY_BOX_CHOICE in PdfEditor.tsx
  pendingSignature: string | null;
  onAddOp: (op: PdfEditOp) => void;
  onUpdateOp: (id: string, patch: Partial<PdfEditOp>) => void; // reposition/resize/reformat an existing op
  onDeleteOp: (id: string) => void;
  onPlacementComplete: () => void; // called after a discrete placement (textbox/signature) so the toolbar can revert to "select"
}

function opBoundingBox(viewport: any, o: HighlightOp | TextBoxOp | ImageOp | DrawOp, scale: number) {
  if (o.type === "highlight" || o.type === "image") return pdfRectToScreen(viewport, o.x, o.y, o.width, o.height);
  if (o.type === "textbox") {
    const [sx, sy] = viewport.convertToViewportPoint(o.x, o.y);
    const totalChars = o.runs.reduce((n, r) => n + r.text.length, 0);
    const approxWidth = totalChars * o.fontSize * scale * 0.55;
    return { left: sx, top: sy - o.fontSize * scale, width: approxWidth, height: o.fontSize * scale * 1.2 };
  }
  const screenPts = o.points.map((p) => viewport.convertToViewportPoint(p.x, p.y));
  const xs = screenPts.map((p: number[]) => p[0]);
  const ys = screenPts.map((p: number[]) => p[1]);
  return { left: Math.min(...xs), top: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function pdfRectToScreen(viewport: any, x: number, y: number, width: number, height: number) {
  const [sx1, sy1] = viewport.convertToViewportPoint(x, y);
  const [sx2, sy2] = viewport.convertToViewportPoint(x + width, y + height);
  return {
    left: Math.min(sx1, sx2), top: Math.min(sy1, sy2),
    width: Math.abs(sx2 - sx1), height: Math.abs(sy2 - sy1),
  };
}

const rgbCss = (c: [number, number, number]) => `rgb(${c[0] * 255}, ${c[1] * 255}, ${c[2] * 255})`;

export default function PdfPageView({
  pdfPage, pageIndex, scale, ops, activeTool, checkboxStyle, placeChecked, pendingSignature, onAddOp, onUpdateOp, onDeleteOp, onPlacementComplete,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  // Kicks off (once, module-wide -- see ensureCheckboxFontLoaded) loading the
  // symbol font the committed-checkbox render below needs. Fire-and-forget:
  // the glyph briefly renders in a fallback font/tofu box until this
  // resolves, then the browser repaints it in place on its own once the
  // FontFace is registered -- no state/re-render needed here for that.
  useEffect(() => { ensureCheckboxFontLoaded(); }, []);

  // ── Annotation selection / drag / delete (select tool only) ─────────────
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  // Text boxes default to drag-to-move (like every other annotation); the
  // toolbar's cursor button switches a box into a text-select mode instead,
  // where dragging over its words selects a substring to bold/italicize/
  // underline via TextBoxToolbar. The two gestures both start with
  // pointerdown-and-drag so they can't be active at once. (Deliberately not a
  // double-click gesture: two ordinary clicks in quick succession — e.g.
  // reselecting a box to drag it again — reads as a double-click too, which
  // made the box seem to randomly get "stuck" unable to move.)
  const [textSelectId, setTextSelectId] = useState<string | null>(null);
  const dragStateRef = useRef<{ id: string; startClientX: number; startClientY: number; startX: number; startY: number; moved: boolean } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (activeTool !== "select") { setSelectedOpId(null); setTextSelectId(null); }
  }, [activeTool]);

  // If a different annotation (or nothing) becomes selected, exit text-select
  // mode for whichever box was previously in it.
  useEffect(() => {
    setTextSelectId((prev) => (prev && prev !== selectedOpId ? null : prev));
  }, [selectedOpId]);

  useEffect(() => {
    if (!selectedOpId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      const isEditingText = active instanceof HTMLElement && (active.isContentEditable || active.tagName === "INPUT" || active.tagName === "TEXTAREA");
      if (isEditingText) return;
      onDeleteOp(selectedOpId);
      setSelectedOpId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedOpId, onDeleteOp]);

  // Set for one tick after a real drag (moved past the 2px threshold) ends,
  // then cleared the moment it's read — lets a click handler that ALSO wants
  // to run on a plain click (checkbox toggle below) tell "this was a click"
  // apart from "this was the tail end of a drag". dragStateRef itself can't
  // answer that: onDragEnd already nulls it out before the browser's own
  // click event (which always fires after pointerup) gets a chance to see it.
  const justDraggedRef = useRef(false);

  const beginDrag = (id: string, startX: number, startY: number, e: React.PointerEvent) => {
    if (activeTool !== "select" || textSelectId === id) return; // in text-select mode, let native selection happen instead
    e.stopPropagation();
    setSelectedOpId(id);
    dragStateRef.current = { id, startClientX: e.clientX, startClientY: e.clientY, startX, startY, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    const dx = e.clientX - ds.startClientX;
    const dy = e.clientY - ds.startClientY;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) ds.moved = true;
    setDragOffset({ id: ds.id, dx, dy });
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const ds = dragStateRef.current;
    if (!ds) return;
    dragStateRef.current = null;
    setDragOffset(null);
    if (!ds.moved) return;
    justDraggedRef.current = true;
    const dx = e.clientX - ds.startClientX;
    const dy = e.clientY - ds.startClientY;
    const [origSx, origSy] = viewport.convertToViewportPoint(ds.startX, ds.startY);
    const [newX, newY] = viewport.convertToPdfPoint(origSx + dx, origSy + dy);
    onUpdateOp(ds.id, { x: newX, y: newY });
  };

  // ── Text box resize (drag a handle to scale font size) ──────────────────
  const resizeStateRef = useRef<{ id: string; startClientY: number; startFontSize: number } | null>(null);
  const [resizePreview, setResizePreview] = useState<{ id: string; fontSize: number } | null>(null);

  const beginResize = (o: TextBoxOp, e: React.PointerEvent) => {
    e.stopPropagation();
    resizeStateRef.current = { id: o.id, startClientY: e.clientY, startFontSize: o.fontSize };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onResizeMove = (e: React.PointerEvent) => {
    const rs = resizeStateRef.current;
    if (!rs) return;
    const dy = e.clientY - rs.startClientY;
    const fontSize = Math.min(96, Math.max(6, rs.startFontSize + dy / scale));
    setResizePreview({ id: rs.id, fontSize });
  };
  const onResizeEnd = (e: React.PointerEvent) => {
    const rs = resizeStateRef.current;
    if (!rs) return;
    resizeStateRef.current = null;
    const dy = e.clientY - rs.startClientY;
    const fontSize = Math.min(96, Math.max(6, rs.startFontSize + dy / scale));
    setResizePreview(null);
    onUpdateOp(rs.id, { fontSize });
  };

  function TextBoxToolbar({ o }: { o: TextBoxOp }) {
    if (selectedOpId !== o.id) return null;
    const btnStyle = (active: boolean): React.CSSProperties => ({
      width: 22, height: 22, borderRadius: 6, border: "none", cursor: "pointer",
      background: active ? "#1e293b" : "#f1f5f9", color: active ? "white" : "#334155",
      fontSize: 12, lineHeight: "22px", padding: 0,
    });
    // If part of the text is selected, the format toggle only applies to that
    // slice; otherwise it applies to the whole box (matches common word-processor
    // behavior: format the selection if there is one, else format everything).
    const applyFormat = (key: "bold" | "italic" | "underline") => {
      const container = textBoxRefs.current[o.id];
      const sel = container ? getSelectionOffsetsWithin(container) : null;
      if (sel) {
        const allSet = runsSliceAllTrue(o.runs, sel.start, sel.end, key);
        onUpdateOp(o.id, { runs: splitAndPatchRuns(o.runs, sel.start, sel.end, { [key]: !allSet }) });
      } else {
        const allSet = o.runs.every((r) => r[key]);
        onUpdateOp(o.id, { runs: o.runs.map((r) => ({ ...r, [key]: !allSet })) });
      }
    };
    const bold = o.runs.every((r) => r.bold);
    const italic = o.runs.every((r) => r.italic);
    const underline = o.runs.every((r) => r.underline);
    return (
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{
          position: "absolute", left: 0, top: -30, display: "flex", gap: 3, alignItems: "center",
          background: "white", padding: 3, borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
        }}
      >
        <button title="Bold" style={{ ...btnStyle(bold), fontWeight: 700 }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat("bold")}>B</button>
        <button title="Italic" style={{ ...btnStyle(italic), fontStyle: "italic" }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat("italic")}>I</button>
        <button title="Underline" style={{ ...btnStyle(underline), textDecoration: "underline" }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat("underline")}>U</button>
        <button
          title={textSelectId === o.id ? "Done selecting text, box is draggable again" : "Select part of the text to format"}
          style={btnStyle(textSelectId === o.id)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setTextSelectId((prev) => (prev === o.id ? null : o.id))}
        >
          <TextCursor size={13} />
        </button>
        <input
          type="number" min={6} max={96} title="Font size"
          value={Math.round(resizePreview?.id === o.id ? resizePreview.fontSize : o.fontSize)}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (!isNaN(v)) onUpdateOp(o.id, { fontSize: Math.min(96, Math.max(6, v)) });
          }}
          style={{ width: 36, height: 22, borderRadius: 6, border: "1px solid #e2e8f0", fontSize: 11, textAlign: "center", padding: 0, marginLeft: 2 }}
        />
      </div>
    );
  }

  function DeleteBadge({ id }: { id: string }) {
    if (selectedOpId !== id) return null;
    return (
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDeleteOp(id); setSelectedOpId(null); }}
        title="Delete"
        style={{
          position: "absolute", top: -8, right: -8, width: 18, height: 18, borderRadius: 9999,
          background: "#1e293b", color: "white", fontSize: 12, lineHeight: "16px", textAlign: "center",
          cursor: "pointer", border: "2px solid white", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", padding: 0,
        }}
      >
        ×
      </button>
    );
  }

  const contentRef = useRef<PdfTextContent | null>(null);
  const textDivsRef = useRef<HTMLElement[]>([]);
  const textItemsRef = useRef<PdfTextItem[]>([]);

  // Inline text-run editing: a floating <input> overlaid on the clicked run
  // (the underlying span is hidden while it's open) rather than making
  // pdf.js's own transform-scaled span directly contentEditable — that combo
  // (CSS transform + contentEditable) is a known source of broken caret/focus
  // behavior across browsers, which is why the plain-input version below is
  // used instead.
  const [editingRun, setEditingRun] = useState<{
    index: number; value: string; left: number; top: number; fontSizePx: number; fontFamily: string; minWidth: number;
    // So the live input previews bold/italic the same way the committed
    // overlay renders it (see matchStandardFont's real-font-flags support) --
    // without these the input rendered plain the entire time you were
    // typing, only the text you'd already committed once before showed
    // formatting at all.
    fontWeight: number; fontStyle: "italic" | "normal";
  } | null>(null);
  const editingRunRef = useRef(editingRun);
  useEffect(() => { editingRunRef.current = editingRun; }, [editingRun]);

  // Read via refs inside long-lived span click handlers to avoid stale closures.
  const activeToolRef = useRef(activeTool);
  const opsRef = useRef(ops);
  const onAddOpRef = useRef(onAddOp);
  const onDeleteOpRef = useRef(onDeleteOp);
  const onUpdateOpRef = useRef(onUpdateOp);
  const checkboxStyleRef = useRef(checkboxStyle);
  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { opsRef.current = ops; }, [ops]);
  useEffect(() => { onAddOpRef.current = onAddOp; }, [onAddOp]);
  useEffect(() => { onDeleteOpRef.current = onDeleteOp; }, [onDeleteOp]);
  useEffect(() => { onUpdateOpRef.current = onUpdateOp; }, [onUpdateOp]);
  useEffect(() => { checkboxStyleRef.current = checkboxStyle; }, [checkboxStyle]);

  const viewport = useMemo(() => pdfPage.getViewport({ scale }), [pdfPage, scale]);
  const pageOps = useMemo(() => ops.filter((o) => o.page === pageIndex), [ops, pageIndex]);

  // pdf.js parses a font's REAL weight/italic-angle off its FontDescriptor
  // (see FontFaceObject's own .bold/.italic getters in pdfjs-dist) and
  // registers the resolved font object on the page's commonObjs once
  // rendering/text-content has resolved it -- far more reliable than
  // matchStandardFont's own name-substring fallback below, which silently
  // mismatches on plenty of real-world subset-embedded fonts whose resolved
  // CSS family string never says "Bold"/"Italic" at all. `.get` throws if the
  // font hasn't been registered yet (shouldn't happen here, since this is
  // only ever called after this page's own render+getTextContent resolved),
  // hence the guard rather than trusting `.has` alone across a race.
  function getRealFontFlags(fontName: string): { bold?: boolean; italic?: boolean } | undefined {
    try {
      if (!pdfPage.commonObjs.has(fontName)) return undefined;
      const fontObj = pdfPage.commonObjs.get(fontName) as { bold?: boolean; italic?: boolean; name?: string; fallbackName?: string };
      // pdf.js's own .bold/.italic getters come off the font's real
      // FontDescriptor (explicit weight/flags) -- confirmed live that plenty
      // of real-world generated PDFs embed the correct bold/italic font FILE
      // without also bothering to set that descriptor metadata, leaving
      // these undefined even for unmistakably bold text (e.g. an embedded
      // subset literally named "AAAAAJ+Arial-BoldMT" still had .bold ===
      // undefined here). `.name`/`.fallbackName` carry the font's real
      // resolved PostScript name, which is far more reliable for this than
      // the coarse family string pdf.js exposes via TextContent.styles (used
      // for family SELECTION elsewhere) -- for a subset-embedded font that's
      // frequently just a generic fallback like "sans-serif" with no
      // style information in it at all, which is exactly what silently
      // defeated matchStandardFont's own name heuristic before this existed.
      // Union both signals -- either saying yes is enough.
      const realName = (fontObj.name || fontObj.fallbackName || "").toLowerCase();
      return {
        bold: !!fontObj.bold || /bold|black|heavy|semibold|demibold|extrabold/.test(realName),
        italic: !!fontObj.italic || /italic|oblique/.test(realName),
      };
    } catch {
      return undefined;
    }
  }

  // ── Render canvas bitmap + pdf.js TextLayer ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    let renderTask: any;
    let textLayer: any;

    (async () => {
      try {
        setReady(false);
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        renderTask = pdfPage.render({ canvas, viewport });
        await renderTask.promise;
        if (cancelled) return;

        const rawContent = await pdfPage.getTextContent();
        if (cancelled) return;
        const content = rawContent as unknown as PdfTextContent;
        contentRef.current = content;
        const textItems = content.items.filter((it): it is PdfTextItem => "str" in it);
        textItemsRef.current = textItems;

        const container = textLayerRef.current;
        if (!container) return;
        container.innerHTML = "";

        const { TextLayer } = await import("pdfjs-dist");
        textLayer = new TextLayer({ textContentSource: rawContent, container, viewport });
        await textLayer.render();
        if (cancelled) return;

        const textDivs = textLayer.textDivs as HTMLElement[];
        textDivsRef.current = textDivs;

        textDivs.forEach((span, i) => {
          const item = textItems[i];
          if (!item) return;
          span.dataset.originalText = item.str;
          const checkbox = isCheckboxGlyph(item.str);
          span.style.cursor = checkbox ? "pointer" : "text";
          span.addEventListener("click", () => {
            if (activeToolRef.current !== "select") return;
            if (checkbox) toggleCheckbox(i);
            else openRunEditor(i);
          });
          span.addEventListener("mouseenter", () => {
            if (activeToolRef.current !== "select" || editingRunRef.current?.index === i) return;
            span.style.outline = "1px dashed #94a3b8";
            span.style.outlineOffset = "1px";
          });
          span.addEventListener("mouseleave", () => {
            if (editingRunRef.current?.index === i) return;
            span.style.outline = "";
          });
        });

        setReady(true);
      } catch (e: any) {
        // The cleanup below cancels an in-flight render/text-layer task whenever this
        // effect re-runs (e.g. page or zoom change before the previous render finished),
        // which rejects their promises with a cancellation exception — expected, not a bug.
        if (cancelled || e?.name === "RenderingCancelledException") return;
        console.error("PdfPageView render error:", e);
      }
    })();

    return () => {
      cancelled = true;
      renderTask?.cancel?.();
      textLayer?.cancel?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPage, viewport]);

  // ── Keep pdf.js's own spans in sync: hide any run that's edited or being
  // edited, since edited runs are rendered by our own overlay/input below
  // instead. Reusing the pdf.js span for edited text doesn't work well: its
  // CSS scale/position is calibrated for the *original* text's measured
  // width, so swapping in different text visually snaps to that old geometry.
  useEffect(() => {
    if (!ready) return;
    const editedIndices = new Set<number>();
    for (const op of pageOps) {
      // A checkbox placed via the tool (no source glyph) has no itemIndex --
      // nothing to hide, since there was never a pdf.js span for it.
      if (op.type === "text-edit" || (op.type === "checkbox" && op.itemIndex !== undefined)) editedIndices.add(op.itemIndex!);
    }

    textDivsRef.current.forEach((span, i) => {
      if (editingRun?.index === i || editedIndices.has(i)) {
        span.style.opacity = "0";
        return;
      }
      span.style.opacity = "";
      span.textContent = span.dataset.originalText || "";
      span.style.color = "";
      span.style.backgroundColor = "";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pageOps, editingRun?.index]);

  function commitRunEdit() {
    const er = editingRunRef.current;
    if (!er) return;
    setEditingRun(null);
    const item = textItemsRef.current[er.index];
    const span = textDivsRef.current[er.index];
    if (!item) return;

    const original = span?.dataset.originalText || item.str;
    if (er.value === original) {
      // Reverted back to the original text (e.g. typed a letter, then deleted
      // it) — actively remove any existing edit for this run instead of
      // leaving it in place; otherwise the revert is silently ignored and the
      // stale prior edit keeps getting saved.
      const existing = opsRef.current.find((o) => o.type === "text-edit" && o.page === pageIndex && o.itemIndex === er.index);
      if (existing) onDeleteOpRef.current(existing.id);
      return;
    }

    const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12;
    const fontFamily = contentRef.current?.styles?.[item.fontName]?.fontFamily;
    onAddOpRef.current({
      id: crypto.randomUUID(),
      type: "text-edit",
      page: pageIndex,
      itemIndex: er.index,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
      fontSize,
      font: matchStandardFont(fontFamily, item.transform, getRealFontFlags(item.fontName)),
      text: er.value,
      color: [0, 0, 0],
    });
  }

  // Force-commit an in-progress edit if the user switches tools mid-edit.
  useEffect(() => {
    if (activeTool !== "select" && editingRunRef.current) commitRunEdit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool]);

  // Checkbox GLYPHS (pdf.js found an actual ☐/☑/[x] character in the text
  // layer) toggle directly on click, no floating input. The first click on a
  // fresh glyph flips from whatever the ORIGINAL glyph showed (empty → checked,
  // already-checked → unchecked) and bakes the box's geometry, derived once
  // from that glyph's own bounding box, directly into the new CheckboxOp —
  // every click after that just flips the existing op's `checked` (handled by
  // the checkbox render block below now that an op exists, not this
  // function again — see its own onClick). Most real-world contracts don't
  // have a glyph here at all (checkboxes drawn as vector line-art instead,
  // invisible to pdf.js's text layer) — see the "Checkbox" tool's placement
  // handler in handlePointerUp for that case.
  function toggleCheckbox(i: number) {
    const item = textItemsRef.current[i];
    const span = textDivsRef.current[i];
    if (!item || !span) return;
    if (opsRef.current.some((o) => o.type === "checkbox" && o.page === pageIndex && o.itemIndex === i)) return;

    const wasChecked = isCheckedGlyph(span.dataset.originalText || item.str);
    // Same derivation as the old inline render/save-time geometry used to
    // recompute on every frame — now computed once, here, and stored directly
    // as the op's own box so render/save just draw x/y/width/height as-is.
    const boxSize = Math.min(item.width, item.height * 1.1);
    onAddOpRef.current({
      id: crypto.randomUUID(),
      type: "checkbox",
      page: pageIndex,
      itemIndex: i,
      x: item.transform[4] + (item.width - boxSize) / 2,
      y: item.transform[5] - item.height * 0.2,
      width: boxSize,
      height: boxSize,
      checked: !wasChecked,
      style: checkboxStyleRef.current,
    });
  }

  function openRunEditor(i: number) {
    const item = textItemsRef.current[i];
    const span = textDivsRef.current[i];
    if (!item || !span) return;
    if (editingRunRef.current && editingRunRef.current.index !== i) commitRunEdit();

    const existingEdit = opsRef.current.find((o) => o.type === "text-edit" && o.page === pageIndex && o.itemIndex === i);
    const currentText = existingEdit && existingEdit.type === "text-edit" ? existingEdit.text : (span.dataset.originalText || item.str);

    const [sx, sy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
    const fontSizePdf = Math.abs(item.transform[3]) || Math.abs(item.transform[0]) || 12;
    const fontSizePx = fontSizePdf * scale;
    // Use the same Standard-14 CSS approximation the committed overlay renders with
    // (rather than the raw pdf.js font-family string) so nothing visually jumps on commit.
    const rawFamily = contentRef.current?.styles?.[item.fontName]?.fontFamily;
    const css = standardFontCss(matchStandardFont(rawFamily, item.transform, getRealFontFlags(item.fontName)));
    const minWidth = Math.max(item.width * scale, 40);

    setEditingRun({
      index: i, value: currentText, left: sx, top: sy - fontSizePx, fontSizePx, minWidth,
      fontFamily: css.fontFamily, fontWeight: css.fontWeight, fontStyle: css.fontStyle,
    });
  }

  // ── Interaction layer: highlight drag / freehand draw / textbox & signature placement ──
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const drawPointsRef = useRef<{ x: number; y: number }[]>([]);
  const [livePreview, setLivePreview] = useState<{ kind: "rect" | "path"; rect?: any; points?: { x: number; y: number }[] } | null>(null);
  const [textBoxDraft, setTextBoxDraft] = useState<{ screenX: number; screenY: number; pdfX: number; pdfY: number } | null>(null);
  const [textBoxValue, setTextBoxValue] = useState("");
  const [draftBold, setDraftBold] = useState(false);
  const [draftItalic, setDraftItalic] = useState(false);
  const [draftUnderline, setDraftUnderline] = useState(false);
  const textBoxRefs = useRef<Record<string, HTMLElement | null>>({});

  const overlayPos = (e: React.PointerEvent) => {
    const rect = overlayRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (activeTool === "highlight") {
      dragRef.current = overlayPos(e);
      setLivePreview({ kind: "rect", rect: { left: dragRef.current.x, top: dragRef.current.y, width: 0, height: 0 } });
    } else if (activeTool === "draw") {
      drawPointsRef.current = [overlayPos(e)];
      setLivePreview({ kind: "path", points: [...drawPointsRef.current] });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (activeTool === "highlight" && dragRef.current) {
      const cur = overlayPos(e);
      const left = Math.min(dragRef.current.x, cur.x);
      const top = Math.min(dragRef.current.y, cur.y);
      setLivePreview({ kind: "rect", rect: { left, top, width: Math.abs(cur.x - dragRef.current.x), height: Math.abs(cur.y - dragRef.current.y) } });
    } else if (activeTool === "draw" && drawPointsRef.current.length) {
      drawPointsRef.current.push(overlayPos(e));
      setLivePreview({ kind: "path", points: [...drawPointsRef.current] });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (activeTool === "highlight" && dragRef.current) {
      const start = dragRef.current;
      const end = overlayPos(e);
      dragRef.current = null;
      setLivePreview(null);
      if (Math.abs(end.x - start.x) < 3 && Math.abs(end.y - start.y) < 3) return;
      const [px1, py1] = viewport.convertToPdfPoint(start.x, start.y);
      const [px2, py2] = viewport.convertToPdfPoint(end.x, end.y);
      const op: HighlightOp = {
        id: crypto.randomUUID(), type: "highlight", page: pageIndex,
        x: Math.min(px1, px2), y: Math.min(py1, py2),
        width: Math.abs(px2 - px1), height: Math.abs(py2 - py1),
        color: [1, 0.92, 0.23], opacity: 0.4,
      };
      onAddOp(op);
    } else if (activeTool === "draw" && drawPointsRef.current.length > 1) {
      const pdfPoints = drawPointsRef.current.map((p) => {
        const [px, py] = viewport.convertToPdfPoint(p.x, p.y);
        return { x: px, y: py };
      });
      drawPointsRef.current = [];
      setLivePreview(null);
      const op: DrawOp = { id: crypto.randomUUID(), type: "draw", page: pageIndex, points: pdfPoints, color: [0.9, 0.15, 0.15], strokeWidth: 1.5 };
      onAddOp(op);
    } else if (activeTool === "textbox" && !textBoxDraft) {
      const pos = overlayPos(e);
      const [pdfX, pdfY] = viewport.convertToPdfPoint(pos.x, pos.y);
      setTextBoxDraft({ screenX: pos.x, screenY: pos.y, pdfX, pdfY });
      setTextBoxValue("");
    } else if (activeTool === "checkbox") {
      const pos = overlayPos(e);
      const [pdfX, pdfY] = viewport.convertToPdfPoint(pos.x, pos.y);
      // Clicking back onto a checkbox this tool ALREADY placed (easy to do on
      // a form with a whole grid of them, one click apart) toggles that one
      // instead of stacking a second op on top of it -- hit-tested against
      // the same padded footprint the checkbox actually renders/whites out
      // to, not just its bare 10pt box, so this is forgiving of a slightly
      // imprecise re-click the same way the box's own whiteout already is.
      const hit = pageOps.find((existing): existing is PdfEditOp & { type: "checkbox" } =>
        existing.type === "checkbox" &&
        pdfX >= existing.x - CHECKBOX_WHITEOUT_PAD_X_PDF && pdfX <= existing.x + existing.width + CHECKBOX_WHITEOUT_PAD_X_PDF &&
        pdfY >= existing.y - CHECKBOX_WHITEOUT_PAD_Y_PDF && pdfY <= existing.y + existing.height + CHECKBOX_WHITEOUT_PAD_Y_PDF
      );
      if (hit) {
        onUpdateOp(hit.id, { checked: !hit.checked });
        return;
      }
      // Otherwise, before falling back to a generic click-centered box, check
      // whether this click actually landed on a REAL checkbox glyph pdf.js
      // found in the text layer (rare for a vector-drawn/scanned form -- most
      // real contracts have neither, see CheckboxOp's doc comment -- but some
      // documents genuinely do use one). If so, "identify" and use THAT
      // glyph's own real bounding box via the same toggleCheckbox the Select
      // tool's own span click listener already calls, rather than guessing a
      // default-sized box at the click point -- its geometry is exact where a
      // guess wouldn't be, and its current checked/unchecked state (from the
      // glyph's own original character, e.g. ☒ vs ☐) is known where a fresh
      // guess would just default to placeChecked instead.
      const glyphIndex = textItemsRef.current.findIndex((item, i) => {
        if (!item || !isCheckboxGlyph(textDivsRef.current[i]?.dataset.originalText || item.str)) return false;
        const x0 = item.transform[4], y0 = item.transform[5];
        return pdfX >= x0 - 2 && pdfX <= x0 + item.width + 2 && pdfY >= y0 - item.height * 0.3 && pdfY <= y0 + item.height * 1.1;
      });
      if (glyphIndex !== -1) {
        toggleCheckbox(glyphIndex);
        return;
      }
      // Places a checked box centered on the click point -- sidesteps
      // detecting the source document's own checkbox entirely (most real
      // contracts draw theirs as vector line-art or a scanned image, neither
      // of which pdf.js's text layer can see). Starts checked by default
      // (placing one is almost always "check this box") or unchecked if the
      // toolbar's "Empty box" choice is active (e.g. to visually uncheck a
      // box the source document already has marked).
      const size = DEFAULT_CHECKBOX_SIZE_PDF;
      const op: CheckboxOp = {
        id: crypto.randomUUID(), type: "checkbox", page: pageIndex,
        x: pdfX - size / 2, y: pdfY - size / 2, width: size, height: size, checked: placeChecked,
        style: checkboxStyle,
      };
      onAddOp(op);
      // Deliberately NOT onPlacementComplete() -- unlike a textbox or
      // signature (each a one-off placement that's done once you've typed/
      // signed), a real form usually has many checkboxes to get through in a
      // row. Staying in this tool (same as Highlight/Draw already do) means
      // one click each instead of re-selecting "Add checkbox" every time.
    } else if (activeTool === "signature" && pendingSignature) {
      const pos = overlayPos(e);
      const [pdfX, pdfY] = viewport.convertToPdfPoint(pos.x, pos.y);
      const width = 160, height = 60;
      const op: ImageOp = {
        id: crypto.randomUUID(), type: "image", page: pageIndex,
        x: pdfX, y: pdfY - height / 2, width, height, pngDataUrl: pendingSignature,
      };
      onAddOp(op);
      onPlacementComplete();
    }
  };

  const commitTextBox = () => {
    if (textBoxDraft && textBoxValue.trim()) {
      const fontSize = 12;
      const op: TextBoxOp = {
        id: crypto.randomUUID(), type: "textbox", page: pageIndex,
        x: textBoxDraft.pdfX, y: textBoxDraft.pdfY - fontSize, fontSize,
        runs: [{ text: textBoxValue, bold: draftBold, italic: draftItalic, underline: draftUnderline }],
        color: [0, 0, 0],
      };
      onAddOp(op);
    }
    setTextBoxDraft(null);
    setTextBoxValue("");
    setDraftBold(false);
    setDraftItalic(false);
    setDraftUnderline(false);
    onPlacementComplete();
  };

  return (
    <div
      className="relative bg-white shadow-md"
      style={{ width: viewport.width, height: viewport.height }}
      onClick={() => { if (activeTool === "select") { setSelectedOpId(null); setTextSelectId(null); } }}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Highlights render under the text so glyphs stay legible on top */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        {pageOps.filter((o): o is HighlightOp => o.type === "highlight").map((o) => {
          const r = pdfRectToScreen(viewport, o.x, o.y, o.width, o.height);
          const selected = selectedOpId === o.id;
          return (
            <div
              key={o.id}
              onClick={(e) => { if (activeTool !== "select") return; e.stopPropagation(); setSelectedOpId(o.id); }}
              style={{
                position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height,
                backgroundColor: rgbCss(o.color), opacity: o.opacity,
                pointerEvents: activeTool === "select" ? "auto" : "none",
                cursor: activeTool === "select" ? "pointer" : undefined,
                outline: selected ? "2px solid #3b82f6" : undefined, outlineOffset: 1,
              }}
            >
              <DeleteBadge id={o.id} />
            </div>
          );
        })}
      </div>

      <div ref={textLayerRef} className="textLayer" style={{ zIndex: 2, pointerEvents: activeTool === "select" ? "auto" : "none", ["--total-scale-factor" as any]: scale, ["--scale-factor" as any]: scale }} />

      {/* Committed inline text-run edits — rendered independently of pdf.js's own
          span (whose geometry is calibrated for the original text) so the visual
          position matches the live editing input exactly, with no jump on commit. */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        {pageOps.filter((o): o is PdfEditOp & { type: "text-edit" } => o.type === "text-edit").map((o) => {
          if (editingRun?.index === o.itemIndex) return null; // the floating input covers this one
          const [sx, sy] = viewport.convertToViewportPoint(o.x, o.y);
          const fontSizePx = o.fontSize * scale;
          const css = standardFontCss(o.font);
          // Cover at least the original glyph's width — otherwise a shorter
          // replacement leaves the old glyph's edges peeking out from behind it.
          const width = Math.max(o.width * scale, measureTextWidth(o.text, fontSizePx, css.fontFamily)) + 4;
          return (
            <div key={o.id} style={{
              position: "absolute", left: sx - 1, top: sy - fontSizePx, width, height: fontSizePx * 1.2,
              fontSize: fontSizePx, lineHeight: 1.2, whiteSpace: "pre", background: "white",
              color: rgbCss(o.color), fontFamily: css.fontFamily, fontWeight: css.fontWeight, fontStyle: css.fontStyle,
            }}>
              {o.text}
            </div>
          );
        })}

        {/* Committed checkboxes — real ☐/☒/⊠/☑ Unicode glyphs via the bundled
            symbol font (ensureCheckboxFontLoaded above), matching what
            applyEdits.ts embeds into the saved PDF exactly, rather than a
            hand-drawn rectangle + lines standing in for one (except
            "overlay-x", which IS still two drawn lines -- see its own branch
            below, and CheckboxStyle's doc comment for why). Geometry
            (x/y/width/height) is the box itself, computed once at creation
            time — see CheckboxOp's doc comment — not re-derived from a source
            glyph on every render. Click toggles checked; drag repositions;
            select-then-Delete or the badge removes it — same interaction set
            as every other placed annotation. */}
        {pageOps.filter((o): o is PdfEditOp & { type: "checkbox" } => o.type === "checkbox").map((o) => {
          const style: CheckboxStyle = o.style ?? "ballot-x";
          const r = pdfRectToScreen(viewport, o.x, o.y, o.width, o.height);
          const offset = dragOffset?.id === o.id ? dragOffset : null;
          const selected = selectedOpId === o.id;
          const commonProps = {
            onPointerDown: (e: React.PointerEvent) => beginDrag(o.id, o.x, o.y, e),
            onPointerMove: onDragMove,
            onPointerUp: onDragEnd,
            onClick: (e: React.MouseEvent) => {
              e.stopPropagation();
              if (justDraggedRef.current) { justDraggedRef.current = false; return; }
              if (activeTool !== "select") return;
              onUpdateOp(o.id, { checked: !o.checked });
            },
          };

          if (style === "overlay-x") {
            // No whiteout, no box background -- draws directly on top of
            // whatever's already there (see CheckboxStyle's doc comment).
            // Unchecked has nothing to actually draw (that's the point of
            // this style), but still needs SOME visible/clickable hit target
            // in the editor itself, or there'd be no way to select, drag, or
            // re-check it once toggled off -- a faint dashed placeholder,
            // never part of the saved PDF (applyEdits.ts's own "overlay-x"
            // branch draws nothing at all when unchecked).
            return (
              <div
                key={o.id}
                {...commonProps}
                title={activeTool === "select" ? "Click to toggle, drag to move" : undefined}
                style={{
                  position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height,
                  pointerEvents: activeTool === "select" ? "auto" : "none",
                  cursor: activeTool === "select" ? "pointer" : undefined,
                  transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
                  outline: selected ? "1.5px dashed #3b82f6" : !o.checked ? "1px dashed rgba(15, 23, 42, 0.35)" : undefined,
                  outlineOffset: 2,
                }}
              >
                {o.checked && (() => {
                  const inset = r.width * 0.12;
                  const thickness = Math.max(1, r.width * 0.14);
                  return (
                    <svg width={r.width} height={r.height} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                      <line x1={inset} y1={inset} x2={r.width - inset} y2={r.height - inset} stroke="#0f172a" strokeWidth={thickness} strokeLinecap="round" />
                      <line x1={inset} y1={r.height - inset} x2={r.width - inset} y2={inset} stroke="#0f172a" strokeWidth={thickness} strokeLinecap="round" />
                    </svg>
                  );
                })()}
                <DeleteBadge id={o.id} />
              </div>
            );
          }

          // A checkbox placed via the tool doesn't know the ORIGINAL vector-drawn
          // or scanned checkbox's real size underneath it (that's the whole
          // problem this tool exists to sidestep — see CheckboxOp's doc comment),
          // so a snug 1px whiteout risks leaving a sliver of the old box's border
          // peeking out around the new one on anything but a perfectly-sized,
          // perfectly-centered placement. Generously oversized instead — plain
          // white blends into the page background regardless, so there's no
          // downside to erasing more than strictly necessary here.
          const padX = CHECKBOX_WHITEOUT_PAD_X_PDF * scale;
          const padY = CHECKBOX_WHITEOUT_PAD_Y_PDF * scale;
          const glyph = !o.checked ? CHECKBOX_EMPTY_CHAR
            : style === "squared-times" ? CHECKBOX_SQUARED_TIMES_CHAR
            : style === "ballot-check" ? CHECKBOX_CHECK_CHAR
            : CHECKBOX_X_CHAR;
          // Sized off the glyph's own ACTUAL ink box (see
          // measureGlyphInkRatios's own doc comment) rather than its advance
          // width, same approach and same reasoning as applyEdits.ts's
          // matching save-time computeGlyphPlacement, so the live preview
          // always matches what actually gets saved. The larger of the two
          // ink ratios is the binding constraint (sizing off the smaller one
          // would let the OTHER dimension overflow the box before FILL_RATIO
          // is even applied), and FILL_RATIO nudges it a little past an exact
          // fit -- what actually reads as "filling" the box rather than
          // looking undersized inside its own outline. Centering itself,
          // unlike the PDF side's manual bbox-offset math, is just flexbox
          // here (see the container div below).
          const FILL_RATIO = 1.08;
          const { widthRatio, heightRatio } = measureGlyphInkRatios(glyph, CHECKBOX_FONT_FAMILY);
          const fontSizePx = (r.width / Math.max(widthRatio, heightRatio)) * FILL_RATIO;
          return (
            <div
              key={o.id}
              {...commonProps}
              title={activeTool === "select" ? "Click to toggle, drag to move" : undefined}
              style={{
                position: "absolute", left: r.left - padX, top: r.top - padY, width: r.width + padX * 2, height: r.height + padY * 2, background: "white",
                pointerEvents: activeTool === "select" ? "auto" : "none",
                cursor: activeTool === "select" ? "pointer" : undefined,
                transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
                outline: selected ? "1.5px dashed #3b82f6" : undefined, outlineOffset: 2,
              }}
            >
              <div style={{
                // No overflow:hidden here -- FILL_RATIO above deliberately
                // sizes the glyph a little BIGGER than r.width/r.height so it
                // reads as "filling" the box; clipping that back down to fit
                // exactly would cut off the very edges (most visibly the top
                // border line) that overflow was there to draw in the first
                // place. The surrounding whiteout padding already has room
                // for it -- that's what it's calibrated for.
                position: "absolute", left: padX, top: padY, width: r.width, height: r.height,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: CHECKBOX_FONT_FAMILY, fontSize: fontSizePx, lineHeight: 1, color: "#0f172a",
                pointerEvents: "none",
              }}>
                {glyph}
              </div>
              <DeleteBadge id={o.id} />
            </div>
          );
        })}
      </div>

      {/* Text boxes, freehand drawing, and placed signatures render above the text */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
        {pageOps.filter((o): o is TextBoxOp => o.type === "textbox").map((o) => {
          const [sx, sy] = viewport.convertToViewportPoint(o.x, o.y);
          const offset = dragOffset?.id === o.id ? dragOffset : null;
          const selected = selectedOpId === o.id;
          const textSelecting = textSelectId === o.id;
          const fontSizePx = (resizePreview?.id === o.id ? resizePreview.fontSize : o.fontSize) * scale;
          return (
            <div
              key={o.id}
              ref={(el) => { textBoxRefs.current[o.id] = el; }}
              onPointerDown={(e) => beginDrag(o.id, o.x, o.y, e)}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onClick={(e) => { e.stopPropagation(); if (activeTool === "select") setSelectedOpId(o.id); }}
              title={activeTool === "select" && !textSelecting ? "Drag to move, or use the toolbar's cursor button to select text for formatting" : undefined}
              style={{
                position: "absolute", left: sx, top: sy - fontSizePx,
                fontSize: fontSizePx, color: rgbCss(o.color), fontFamily: "Helvetica, Arial, sans-serif", whiteSpace: "pre",
                pointerEvents: activeTool === "select" ? "auto" : "none",
                // Default gesture is drag-to-move (like every other annotation). The toolbar's
                // cursor button switches to text-select mode instead, where dragging over the
                // words selects a substring to format — the two can't be active at once
                // (beginDrag no-ops while textSelecting, see above), so no gesture conflict.
                userSelect: textSelecting ? "text" : "none",
                cursor: activeTool === "select" ? (textSelecting ? "text" : "grab") : undefined,
                transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
                outline: selected ? "1.5px dashed #3b82f6" : undefined, outlineOffset: 3,
              }}
            >
              {o.runs.map((r, i) => (
                <span key={i} style={{ fontWeight: r.bold ? 700 : 400, fontStyle: r.italic ? "italic" : "normal", textDecoration: r.underline ? "underline" : "none" }}>
                  {r.text}
                </span>
              ))}
              <DeleteBadge id={o.id} />
              <TextBoxToolbar o={o} />
              {selected && (
                <div
                  onPointerDown={(e) => beginResize(o, e)}
                  onPointerMove={onResizeMove}
                  onPointerUp={onResizeEnd}
                  title="Drag to resize"
                  style={{
                    position: "absolute", right: -6, bottom: -6, width: 10, height: 10, borderRadius: 9999,
                    background: "#3b82f6", border: "1.5px solid white", cursor: "ns-resize", boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                  }}
                />
              )}
            </div>
          );
        })}
        {pageOps.filter((o): o is ImageOp => o.type === "image").map((o) => {
          const r = pdfRectToScreen(viewport, o.x, o.y, o.width, o.height);
          const offset = dragOffset?.id === o.id ? dragOffset : null;
          const selected = selectedOpId === o.id;
          return (
            <div
              key={o.id}
              onPointerDown={(e) => beginDrag(o.id, o.x, o.y, e)}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height,
                pointerEvents: activeTool === "select" ? "auto" : "none",
                cursor: activeTool === "select" ? "grab" : undefined,
                transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
                outline: selected ? "1.5px dashed #3b82f6" : undefined, outlineOffset: 3,
              }}
            >
              <img src={o.pngDataUrl} alt="Signature" draggable={false} style={{ width: "100%", height: "100%", pointerEvents: "none" }} />
              <DeleteBadge id={o.id} />
            </div>
          );
        })}
        <svg className="absolute inset-0" width={viewport.width} height={viewport.height}>
          {pageOps.filter((o): o is DrawOp => o.type === "draw").map((o) => {
            const pts = o.points.map((p) => viewport.convertToViewportPoint(p.x, p.y).join(",")).join(" ");
            const selected = selectedOpId === o.id;
            return (
              <g key={o.id}>
                {selected && (
                  <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={o.strokeWidth * scale + 4} strokeLinecap="round" strokeLinejoin="round" opacity={0.3} style={{ pointerEvents: "none" }} />
                )}
                <polyline points={pts} fill="none" stroke={rgbCss(o.color)} strokeWidth={o.strokeWidth * scale} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: "none" }} />
                {/* Wider invisible stroke so a thin freehand line is easy to click for selection */}
                <polyline
                  points={pts} fill="none" stroke="transparent" strokeWidth={Math.max(14, o.strokeWidth * scale + 10)}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ pointerEvents: activeTool === "select" ? "stroke" : "none", cursor: activeTool === "select" ? "pointer" : undefined }}
                  onClick={(e) => { e.stopPropagation(); setSelectedOpId(o.id); }}
                />
              </g>
            );
          })}
          {livePreview?.kind === "path" && (
            <polyline points={livePreview.points!.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="rgb(230,38,38)" strokeWidth={1.5 * scale} strokeLinecap="round" strokeLinejoin="round" />
          )}
        </svg>
        {selectedOpId && pageOps.filter((o) => o.id === selectedOpId && o.type === "draw").map((o) => {
          const box = opBoundingBox(viewport, o as DrawOp, scale);
          return (
            <div key={`badge-${o.id}`} style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, pointerEvents: "none" }}>
              <DeleteBadge id={o.id} />
            </div>
          );
        })}
      </div>

      {/* Inline text-run editor: a plain floating input standing in for the clicked run */}
      {editingRun && (
        <input
          autoFocus
          value={editingRun.value}
          onChange={(e) => setEditingRun({ ...editingRun, value: e.target.value })}
          onBlur={commitRunEdit}
          onKeyDown={(e) => {
            e.stopPropagation(); // don't let Backspace/Delete here reach the annotation-delete shortcut
            if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            if (e.key === "Escape") setEditingRun(null);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={{
            // Grows with what's typed (canvas-measured) rather than staying a fixed
            // width — otherwise typed text scrolls out of view inside a cramped box.
            position: "absolute", left: editingRun.left, top: editingRun.top,
            width: Math.max(editingRun.minWidth, measureTextWidth(editingRun.value, editingRun.fontSizePx, editingRun.fontFamily) + 10),
            fontSize: editingRun.fontSizePx, fontFamily: editingRun.fontFamily,
            fontWeight: editingRun.fontWeight, fontStyle: editingRun.fontStyle, color: "#0f172a",
            border: "1.5px solid #3b82f6", background: "white", padding: "0 2px", outline: "none", zIndex: 6,
          }}
        />
      )}

      {/* Interaction layer for drag/click-based tools */}
      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{ zIndex: 4, pointerEvents: activeTool === "select" ? "none" : "auto", cursor: activeTool === "select" ? "default" : "crosshair" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {livePreview?.kind === "rect" && (
          <div style={{ position: "absolute", left: livePreview.rect.left, top: livePreview.rect.top, width: livePreview.rect.width, height: livePreview.rect.height, backgroundColor: "rgba(250, 204, 21, 0.4)" }} />
        )}
        {textBoxDraft && (
          <>
            <div
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute", left: textBoxDraft.screenX, top: textBoxDraft.screenY - 14 * scale - 30,
                display: "flex", gap: 3, background: "white", padding: 3, borderRadius: 8, boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }}
            >
              <button title="Bold" onClick={() => setDraftBold((b) => !b)}
                style={{ width: 22, height: 22, borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 700,
                  background: draftBold ? "#1e293b" : "#f1f5f9", color: draftBold ? "white" : "#334155" }}>B</button>
              <button title="Italic" onClick={() => setDraftItalic((i) => !i)}
                style={{ width: 22, height: 22, borderRadius: 6, border: "none", cursor: "pointer", fontStyle: "italic",
                  background: draftItalic ? "#1e293b" : "#f1f5f9", color: draftItalic ? "white" : "#334155" }}>I</button>
              <button title="Underline" onClick={() => setDraftUnderline((u) => !u)}
                style={{ width: 22, height: 22, borderRadius: 6, border: "none", cursor: "pointer", textDecoration: "underline",
                  background: draftUnderline ? "#1e293b" : "#f1f5f9", color: draftUnderline ? "white" : "#334155" }}>U</button>
            </div>
            <input
              autoFocus
              value={textBoxValue}
              onChange={(e) => setTextBoxValue(e.target.value)}
              onBlur={commitTextBox}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTextBoxDraft(null); setTextBoxValue(""); onPlacementComplete(); } }}
              style={{
                position: "absolute", left: textBoxDraft.screenX, top: textBoxDraft.screenY - 14 * scale,
                fontSize: 12 * scale, border: "1px solid #3b82f6", background: "white", padding: "1px 3px", minWidth: 120,
                fontWeight: draftBold ? 700 : 400,
                fontStyle: draftItalic ? "italic" : "normal",
                textDecoration: draftUnderline ? "underline" : "none",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
