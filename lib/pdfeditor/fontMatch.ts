import type { StandardFontKey } from "./types";

// Best-effort match from a pdf.js text run's font info to one of pdf-lib's
// Standard-14 fonts. pdf.js can't give us the document's real embedded font
// program in the browser, so we fall back to substring heuristics on the
// resolved CSS font-family string (e.g. "Arial-BoldMT,Arial,sans-serif",
// or just a generic "serif"/"sans-serif"/"monospace" for subset-embedded
// fonts pdf.js can't identify). Visually close, not pixel-identical — see
// the "Known limitations" note in the PDF editor plan.
export function matchStandardFont(fontFamily: string | undefined, transform?: number[]): StandardFontKey {
  const f = (fontFamily || "").toLowerCase();
  const bold = /bold|black|heavy|semibold|demibold|extrabold/.test(f);
  let italic = /italic|oblique/.test(f);
  if (!italic && transform && transform.length >= 4 && transform[0] !== 0) {
    // Some PDFs render "faux" italics as a skewed transform on a non-italic-named
    // font rather than switching fonts — a shear component here (without pdf.js
    // having already folded it into the family name above) is that signal.
    const shear = transform[2] / transform[0];
    if (Math.abs(shear) > 0.08) italic = true;
  }

  if (/courier|mono|consolas|menlo|monaco|lucida console|andale|inconsolata|source code/.test(f)) {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }

  // (?<!sans-)serif: matches standalone "serif" (and named serif fonts) but not
  // the "serif" inside the generic "sans-serif" fallback — a lookAHEAD here would
  // check the wrong side of the match and let "sans-serif" through by mistake,
  // which was silently routing plain sans-serif embedded fonts to Times.
  if (/times|(?<!sans-)serif|georgia|garamond|cambria|minion|constantia|palatino|book antiqua|bookman|cardo|cochin|didot|baskerville|caslon|hoefler|rockwell|calisto|century schoolbook|goudy/.test(f)) {
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

// CSS-side approximation of a StandardFontKey, for screen previews (the live
// inline-edit input and the post-commit overlay) so they render visually
// consistent with each other. Independent of the pdf-lib embedding above.
export function standardFontCss(key: StandardFontKey): { fontFamily: string; fontWeight: number; fontStyle: "italic" | "normal" } {
  const family = key.startsWith("Courier")
    ? "Courier New, Courier, monospace"
    : key.startsWith("Times")
    ? "Times New Roman, Times, serif"
    : "Helvetica, Arial, sans-serif";
  return { fontFamily: family, fontWeight: isBoldFont(key) ? 700 : 400, fontStyle: isItalicFont(key) ? "italic" : "normal" };
}

// Bold/italic toggles for the "Add text box" tool — read/derived off the
// StandardFontKey itself rather than tracked as separate booleans, so there's
// one source of truth for which pdf-lib Standard-14 font gets embedded.
export function isBoldFont(key: StandardFontKey): boolean {
  return key.includes("Bold");
}
export function isItalicFont(key: StandardFontKey): boolean {
  return key.includes("Oblique") || key.includes("Italic");
}
export function withBoldItalic(key: StandardFontKey, bold: boolean, italic: boolean): StandardFontKey {
  const family = key.startsWith("Courier") ? "Courier" : key.startsWith("Times") ? "Times" : "Helvetica";
  if (family === "Courier") {
    if (bold && italic) return "Courier-BoldOblique";
    if (bold) return "Courier-Bold";
    if (italic) return "Courier-Oblique";
    return "Courier";
  }
  if (family === "Times") {
    if (bold && italic) return "Times-BoldItalic";
    if (bold) return "Times-Bold";
    if (italic) return "Times-Italic";
    return "TimesRoman";
  }
  if (bold && italic) return "Helvetica-BoldOblique";
  if (bold) return "Helvetica-Bold";
  if (italic) return "Helvetica-Oblique";
  return "Helvetica";
}
