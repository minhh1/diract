// Shared types for the PDF editor's edit-op log. All geometry is in PDF user-space
// points (origin bottom-left, y-up) — the same space pdf.js text items already use
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

// A detected checkbox-glyph run, toggled by click. Drawn as a hollow square
// (not a substituted text glyph) so it's independent of font/encoding — the
// Standard-14/WinAnsi fonts pdf-lib embeds can't render Unicode box glyphs
// (☐/☑/☒) at all — and so the "X" can be centered exactly within the box
// regardless of how the original glyph measured.
export interface CheckboxOp {
  id: string;
  type: "checkbox";
  page: number;
  itemIndex: number; // index into that page's getTextContent() text items, for re-matching on re-render
  x: number;
  y: number; // baseline, PDF space — same convention as TextEditOp
  width: number; // original glyph's width, used to size the drawn box
  height: number; // approx cap height, used to size the drawn box
  checked: boolean;
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

// A contiguous slice of a text box's text sharing one set of formatting — lets
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

export type ToolId = "select" | "edit-text" | "textbox" | "highlight" | "draw" | "signature";
