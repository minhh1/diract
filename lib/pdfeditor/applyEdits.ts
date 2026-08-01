// Flattens the editor's op log onto the original PDF bytes using pdf-lib and
// returns the resulting PDF. Pure function — no DOM, no pdf.js — so it can run
// entirely client-side right before the "Save" upload.
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import type { PdfEditOp, StandardFontKey } from "./types";
import { withBoldItalic } from "./fontMatch";

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
      // of this branch, so this always matches the live preview exactly.
      // Whiteout first — covers a glyph-derived box's original glyph (a
      // placed one just paints over blank/already-erased space, harmless).
      page.drawRectangle({
        x: op.x - 1, y: op.y - 1, width: op.width + 2, height: op.height + 2,
        color: rgb(1, 1, 1),
      });
      page.drawRectangle({
        x: op.x, y: op.y, width: op.width, height: op.height,
        borderColor: rgb(0, 0, 0), borderWidth: Math.max(0.75, op.width * 0.08),
      });
      if (op.checked) {
        // Drawn as two literal diagonal lines rather than an "X" glyph, so the
        // mark's size is precisely controllable via the inset below (a glyph's
        // side-bearing makes that unreliable at any font size) — small inset
        // so the mark fills nearly the whole box, not just its middle third.
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
