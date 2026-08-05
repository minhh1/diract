// Shared types for the PDF editor's edit-op log. All geometry is in PDF user-space
// points (origin bottom-left, y-up) -- the same space pdf.js text items already use
// (item.transform/item.width) and the space pdf-lib's page.draw* methods expect.
// Screen/canvas pixel coordinates are converted to/from this space via the page's
// pdf.js viewport (convertToPdfPoint / convertToViewportPoint), never hand-rolled.

export type StandardFontKey =
  | "Helvetica" | "Helvetica-Bold" | "Helvetica-Oblique" | "Helvetica-BoldOblique"
  | "TimesRoman" | "Times-Bold" | "Times-Italic" | "Times-BoldItalic"
  | "Courier" | "Courier-Bold" | "Courier-Oblique" | "Courier-BoldOblique";

export type RGB = [number, number, number]; // 0-1 range, as pdf-lib's rgb() expects

export interface TextEditOp {
  id: string;
  type: "text-edit";
  page: number; // 0-indexed
  itemIndex: number; // index into that page's getTextContent() text items, for re-matching on re-render
  x: number;
  y: number; // baseline, PDF space
  width: number; // original run's width, used for the whiteout box
  height: number; // approx cap height, used for the whiteout box
  fontSize: number;
  font: StandardFontKey;
  text: string;
  color: RGB;
}

// Which mark a checked CheckboxOp draws -- see applyEdits.ts and
// PdfPageView.tsx's own CHECKBOX_* glyph constants for what each renders as.
// "overlay-x" is the odd one out: no box, no whiteout, just two diagonal
// lines drawn directly on top of whatever's already there -- for a document
// whose own checkbox is already visible and just needs a mark added, rather
// than one this tool is standing in for entirely.
export type CheckboxStyle = "ballot-x" | "squared-times" | "ballot-check" | "overlay-x";

// A checkbox mark: a hollow square + a checked-state glyph, drawn directly
// rather than a substituted text glyph from the SOURCE document's own font
// -- both because the Standard-14/WinAnsi fonts pdf-lib embeds can't render
// Unicode box glyphs (☐/☑/☒/⊠) at all, and because most real-world generated
// PDFs (this app's own contracts included) draw their checkboxes as vector
// line-art in the page content stream, not as text glyphs in the first
// place -- pdf.js's text layer never sees those at all, so there's nothing to
// click. x/y/width/height are the box's own bottom-left corner and side
// length in PDF space (not derived from any source glyph), so the exact same
// shape works whether this box was:
//   - toggled from a real checkbox glyph pdf.js DID find in the text layer
//     (itemIndex set, geometry computed once from that glyph's own bounding
//     box at creation time -- see toggleCheckbox in PdfPageView.tsx), or
//   - placed freehand via the "Checkbox" tool onto a vector-drawn or
//     scanned-image checkbox pdf.js can't see at all (itemIndex omitted,
//     geometry is just wherever the user clicked, sized to a fixed default).
export interface CheckboxOp {
  id: string;
  type: "checkbox";
  page: number;
  itemIndex?: number; // set only for a glyph-derived checkbox, for re-matching that glyph on re-render
  x: number;
  y: number;
  width: number;
  height: number;
  checked: boolean;
  style?: CheckboxStyle; // undefined (e.g. an older saved op) means "ballot-x", the original default
}

export interface HighlightOp {
  id: string;
  type: "highlight";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: RGB;
  opacity: number;
}

// A contiguous slice of a text box's text sharing one set of formatting -- lets
// the user bold/italicize/underline part of a text box rather than all of it.
// Rendered as sibling <span>s (so the browser's native text selection works
// over them without needing contentEditable) and drawn consecutively in
// applyEdits.ts with pdf-lib width-based x offsets.
export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean; // pdf-lib has no text-decoration; drawn as a manual line at save time
}

export interface TextBoxOp {
  id: string;
  type: "textbox";
  page: number;
  x: number;
  y: number;
  fontSize: number;
  runs: TextRun[]; // family is fixed to Helvetica for text boxes; only bold/italic/underline vary
  color: RGB;
}

export interface DrawOp {
  id: string;
  type: "draw";
  page: number;
  points: { x: number; y: number }[]; // PDF space, polyline
  color: RGB;
  strokeWidth: number;
}

export interface ImageOp {
  id: string;
  type: "image";
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pngDataUrl: string; // signature/stamp, drawn client-side
}

export type PdfEditOp = TextEditOp | HighlightOp | TextBoxOp | DrawOp | ImageOp | CheckboxOp;

export type ToolId = "select" | "edit-text" | "textbox" | "highlight" | "draw" | "signature" | "checkbox";
