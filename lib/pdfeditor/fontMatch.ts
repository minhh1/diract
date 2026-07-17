import type { StandardFontKey } from "./types";

// Best-effort match from a pdf.js text run's font info to one of pdf-lib's
// Standard-14 fonts. pdf.js can't give us the document's real embedded font
// program in the browser, so we fall back to substring heuristics on the
// resolved CSS font-family string (e.g. "Arial-BoldMT,Arial,sans-serif",
// or just a generic "serif"/"sans-serif"/"monospace" for subset-embedded
// fonts pdf.js can't identify). Visually close, not pixel-identical — see
// the "Known limitations" note in the PDF editor plan.
export function matchStandardFont(fontFamily: string | undefined): StandardFontKey {
  const f = (fontFamily || "").toLowerCase();
  const bold = /bold|black|heavy/.test(f);
  const italic = /italic|oblique/.test(f);

  if (/courier|mono/.test(f)) {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }

  if (/times|serif(?!-sans)|georgia|garamond|cambria|minion/.test(f)) {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "TimesRoman";
  }

  // Default: Helvetica/Arial/sans-serif family, which covers the vast
  // majority of body text in generated business documents.
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}
