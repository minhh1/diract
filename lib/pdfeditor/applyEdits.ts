// Flattens the editor's op log onto the original PDF bytes using pdf-lib and
// returns the resulting PDF. Pure function — no DOM, no pdf.js — so it can run
// entirely client-side right before the "Save" upload.
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { CheckboxStyle, PdfEditOp, StandardFontKey } from "./types";
import { withBoldItalic } from "./fontMatch";

// Standard-14 fonts (used for every other text op below) have no glyph for
// ☐/☒/⊠/☑ at all — that's the whole reason CheckboxOp was ever drawn as
// manual vector line-art in the first place. This ships DejaVu Sans (Bitstream
// Vera-derived license — see public/fonts/checkbox-symbols-LICENSE.txt) to
// draw the real Unicode glyphs instead. It's the one bundled font confirmed
// to actually have all four: Noto Sans Symbols 2 (tried first) is missing
// U+22A0 entirely — that codepoint sits in the Mathematical Operators block,
// outside every one of that font's own symbol subsets. Fetched and embedded
// lazily, once per applyEdits() call, only if the document actually has a
// checkbox op.
// A raw .ttf, not a .woff/.woff2 -- confirmed live that pdf-lib/fontkit
// happily PARSES a woff2 for metrics (widthOfTextAtSize etc. all returned
// correct values), but the font program it embeds into the saved PDF from
// one is invalid: Poppler refused to even open it ("Embedded font file may
// be invalid" / "Couldn't create a font"), which is presumably true of most
// other PDF renderers too, not just this one. A plain .ttf embeds and
// renders correctly.
const CHECKBOX_FONT_URL = "/fonts/checkbox-symbols.ttf";
const CHECKBOX_EMPTY = "☐"; // U+2610 BALLOT BOX -- the unchecked state for every glyph-based style below
const CHECKBOX_X = "☒"; // U+2612 BALLOT BOX WITH X -- "ballot-x" style
const CHECKBOX_SQUARED_TIMES = "⊠"; // U+22A0 SQUARED TIMES -- "squared-times" style
const CHECKBOX_CHECK = "☑"; // U+2611 BALLOT BOX WITH CHECK -- "ballot-check" style

const FONT_MAP: Record<StandardFontKey, StandardFonts> = {
  Helvetica: StandardFonts.Helvetica,
  "Helvetica-Bold": StandardFonts.HelveticaBold,
  "Helvetica-Oblique": StandardFonts.HelveticaOblique,
  "Helvetica-BoldOblique": StandardFonts.HelveticaBoldOblique,
  TimesRoman: StandardFonts.TimesRoman,
  "Times-Bold": StandardFonts.TimesRomanBold,
  "Times-Italic": StandardFonts.TimesRomanItalic,
  "Times-BoldItalic": StandardFonts.TimesRomanBoldItalic,
  Courier: StandardFonts.Courier,
  "Courier-Bold": StandardFonts.CourierBold,
  "Courier-Oblique": StandardFonts.CourierOblique,
  "Courier-BoldOblique": StandardFonts.CourierBoldOblique,
};

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function applyEdits(originalBytes: Uint8Array, ops: PdfEditOp[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();

  const embeddedFonts = new Map<StandardFontKey, PDFFont>();
  async function getFont(key: StandardFontKey): Promise<PDFFont> {
    let font = embeddedFonts.get(key);
    if (!font) {
      font = await pdfDoc.embedFont(FONT_MAP[key]);
      embeddedFonts.set(key, font);
    }
    return font;
  }

  // Only fetched/embedded if this document actually has a checkbox op --
  // most saves (a text edit, a highlight, a signature) never touch this.
  // Two font handles from the SAME bytes, for two different jobs: pdf-lib's
  // own PDFFont actually draws the glyph, but its width/height API
  // (widthOfTextAtSize etc.) only ever reports ADVANCE metrics -- how much
  // horizontal space the character reserves, not how big the shape drawn
  // inside it actually is. For a glyph with generous side-bearing like these
  // ballot-box ones (confirmed via fontkit directly: the visible box is only
  // ~80% of the advance width, on every one of them), sizing off advance
  // width alone renders a checkbox that looks visibly smaller than intended
  // -- keeping the raw fontkit Font object around too, and reading its own
  // per-glyph ink bbox (see computeCheckboxGlyphPlacement below), is what
  // actually fixes that.
  let checkboxFont: PDFFont | null = null;
  let checkboxRawFont: any = null;
  async function getCheckboxFont(): Promise<{ font: PDFFont; rawFont: any }> {
    if (checkboxFont && checkboxRawFont) return { font: checkboxFont, rawFont: checkboxRawFont };
    const res = await fetch(CHECKBOX_FONT_URL);
    const fontBytes = await res.arrayBuffer();
    pdfDoc.registerFontkit(fontkit);
    checkboxRawFont = fontkit.create(new Uint8Array(fontBytes));
    // subset: true -- this font ships ~2900 symbol glyphs; every saved PDF
    // only ever needs the 1-2 (☐/☒) actually used, so subsetting keeps the
    // embedded font down to a few KB instead of carrying the whole file.
    checkboxFont = await pdfDoc.embedFont(fontBytes, { subset: true });
    return { font: checkboxFont, rawFont: checkboxRawFont };
  }

  // Sizes AND positions a checkbox glyph off its own real ink bounding box
  // (via the raw fontkit font -- see getCheckboxFont's comment) rather than
  // pdf-lib's advance-width-only metrics, so the VISIBLE box this actually
  // draws matches the target box size, centered within it, regardless of a
  // given glyph's internal side-bearing. FILL_RATIO nudges it a little past
  // an exact fit, which is what actually reads as "filling" the box rather
  // than looking undersized inside its own outline -- kept small enough that
  // the resulting overflow stays well inside the whiteout pad's own margin.
  function computeGlyphPlacement(rawFont: any, glyph: string, boxX: number, boxY: number, boxWidth: number, boxHeight: number) {
    const FILL_RATIO = 1.08;
    const unitsPerEm = rawFont.unitsPerEm;
    const bbox = rawFont.layout(glyph).glyphs[0].bbox;
    const inkWidthRatio = (bbox.maxX - bbox.minX) / unitsPerEm;
    const inkHeightRatio = (bbox.maxY - bbox.minY) / unitsPerEm;
    // The larger of the two ratios is the binding constraint -- sizing off
    // the smaller one instead would let the OTHER dimension overflow the box
    // before FILL_RATIO is even applied.
    const size = (boxWidth / Math.max(inkWidthRatio, inkHeightRatio)) * FILL_RATIO;
    const inkWidth = inkWidthRatio * size;
    const inkHeight = inkHeightRatio * size;
    return {
      size,
      x: boxX + (boxWidth - inkWidth) / 2 - (bbox.minX / unitsPerEm) * size,
      y: boxY + (boxHeight - inkHeight) / 2 - (bbox.minY / unitsPerEm) * size,
    };
  }

  for (const op of ops) {
    const page = pages[op.page];
    if (!page) continue;

    if (op.type === "text-edit") {
      const font = await getFont(op.font);
      // No reliable way to know the true page background from the browser,
      // so the whiteout assumes white — documented limitation.
      page.drawRectangle({
        x: op.x - 1,
        y: op.y - op.height * 0.25,
        width: op.width + 2,
        height: op.height * 1.3,
        color: rgb(1, 1, 1),
      });
      page.drawText(op.text, { x: op.x, y: op.y, size: op.fontSize, font, color: rgb(...op.color) });
    } else if (op.type === "checkbox") {
      // x/y/width/height ARE the box itself (computed once at creation time —
      // either from a source glyph's own bounding box, for one pdf.js found in
      // the text layer, or a fixed default for one placed via the "Checkbox"
      // tool onto a vector-drawn or scanned checkbox pdf.js can't see at all —
      // see CheckboxOp's doc comment and PdfPageView.tsx's toggleCheckbox/
      // handlePointerUp). No further derivation here, unlike the old version
      // of this branch, so this always matches the live preview exactly. Side
      // length (10pt default) confirmed against a real contract's own
      // checkbox via pixel measurement (pngjs against a 400dpi render): its
      // outer border-to-border footprint measured ~9.9-10.1pt, i.e. already
      // matches.
      const style: CheckboxStyle = op.style ?? "ballot-x";

      if (style === "overlay-x") {
        // No whiteout, no box glyph -- draws directly on top of whatever's
        // already there (the document's own checkbox, left untouched) rather
        // than standing in for it entirely. Unchecked draws nothing at all;
        // there's no "empty" concept for a mark-only style.
        if (op.checked) {
          const inset = op.width * 0.12;
          const thickness = Math.max(1, op.width * 0.14);
          page.drawLine({
            start: { x: op.x + inset, y: op.y + inset },
            end: { x: op.x + op.width - inset, y: op.y + op.height - inset },
            thickness, color: rgb(0, 0, 0),
          });
          page.drawLine({
            start: { x: op.x + inset, y: op.y + op.height - inset },
            end: { x: op.x + op.width - inset, y: op.y + inset },
            thickness, color: rgb(0, 0, 0),
          });
        }
      } else {
        // Whiteout first — FLAT pads (see PdfPageView.tsx's matching
        // constants/comment), not proportional to this box's own size: a
        // placed checkbox has no way to know the real size of the
        // vector-drawn or scanned checkbox it's covering underneath. Kept
        // modest in BOTH directions: swept 18 different checkbox/label pairs
        // across a real contract (pngjs pixel analysis against a 400dpi
        // render, cross-checked with pdftotext -bbox for each label's real
        // position) rather than trusting just the one location tried
        // earlier, and found the real minimum gap to a label's first letter
        // is ~3.25pt ("fixed floor coverings", tightest of the 18) and the
        // real minimum row-to-row spacing is ~13.5pt (the inclusions grid) --
        // both tighter than they first looked from a single sample, and both
        // tighter than a 5pt/3pt pad (10pt box + that padding = 16pt tall,
        // taller than the 13.5pt row spacing it needs to fit inside).
        const whiteoutPadX = 2.5;
        const whiteoutPadY = 1.5;
        page.drawRectangle({
          x: op.x - whiteoutPadX, y: op.y - whiteoutPadY, width: op.width + whiteoutPadX * 2, height: op.height + whiteoutPadY * 2,
          color: rgb(1, 1, 1),
        });
        // Real glyphs (via the embedded symbol font above), not a hand-drawn
        // rectangle + diagonal lines — see computeGlyphPlacement's own doc
        // comment for how this is sized/positioned off the glyph's actual
        // ink, not pdf-lib's advance-width-only metrics.
        const { font, rawFont } = await getCheckboxFont();
        const glyph = !op.checked ? CHECKBOX_EMPTY
          : style === "squared-times" ? CHECKBOX_SQUARED_TIMES
          : style === "ballot-check" ? CHECKBOX_CHECK
          : CHECKBOX_X;
        const placement = computeGlyphPlacement(rawFont, glyph, op.x, op.y, op.width, op.height);
        page.drawText(glyph, {
          x: placement.x, y: placement.y, size: placement.size, font, color: rgb(0, 0, 0),
        });
      }
    } else if (op.type === "highlight") {
      page.drawRectangle({
        x: op.x, y: op.y, width: op.width, height: op.height,
        color: rgb(...op.color), opacity: op.opacity,
      });
    } else if (op.type === "textbox") {
      let x = op.x;
      for (const run of op.runs) {
        if (!run.text) continue;
        const font = await getFont(withBoldItalic("Helvetica", run.bold, run.italic));
        page.drawText(run.text, { x, y: op.y, size: op.fontSize, font, color: rgb(...op.color) });
        const width = font.widthOfTextAtSize(run.text, op.fontSize);
        if (run.underline) {
          const underlineY = op.y - op.fontSize * 0.12;
          page.drawLine({
            start: { x, y: underlineY },
            end: { x: x + width, y: underlineY },
            thickness: Math.max(0.5, op.fontSize * 0.05),
            color: rgb(...op.color),
          });
        }
        x += width;
      }
    } else if (op.type === "draw") {
      for (let i = 1; i < op.points.length; i++) {
        page.drawLine({
          start: op.points[i - 1],
          end: op.points[i],
          thickness: op.strokeWidth,
          color: rgb(...op.color),
        });
      }
    } else if (op.type === "image") {
      const image = await pdfDoc.embedPng(dataUrlToBytes(op.pngDataUrl));
      page.drawImage(image, { x: op.x, y: op.y, width: op.width, height: op.height });
    }
  }

  return pdfDoc.save();
}
