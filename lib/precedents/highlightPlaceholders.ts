// lib/precedents/highlightPlaceholders.ts
// Post-processes a generated "blank form" .docx (see
// lib/precedents/blankTemplate.ts) so every [Bracketed placeholder] --
// the letterhead/deed/court-form builders' own convention for "a solicitor
// still has to fill this in", see the `placeholder()` helper there -- is
// yellow-highlighted, not just bracketed. Requested (2026-08-02) so a blank
// template sent by the Teams/WhatsApp bot makes the still-needed fields
// visually obvious at a glance, not just readable if you look for the
// brackets.
//
// Runs entirely on the FINAL rendered word/document.xml, after Docxtemplater
// has already substituted every {{tag}} -- deliberately, so this needs no
// changes to contentXml.ts/deedDocx.ts/courtFormDocx.ts/letterheadClassify.ts,
// none of which know or care that a "blank form" run is any different from a
// real one. A placeholder can end up either as an entire run on its own (most
// content-block fields) or embedded mid-run alongside fixed label text (e.g.
// a letterhead's own "Our Ref: {{our_ref}}" paragraph, which Docxtemplater
// fills within that SAME run -- "Our Ref: [Our reference]"), so this splits
// any run containing one or more bracket pairs into plain/highlighted/plain
// runs instead of assuming the whole run is a placeholder.
//
// Deliberately scoped to whichever bytes THIS module is handed -- never call
// it on a real issued document (lib/precedents/issuePrecedent.ts never does):
// a firm's own drafted wording occasionally uses square brackets for a
// defined term ("[the Company]"), which is exactly the kind of literal text
// a blank form's OWN placeholders are indistinguishable from without the
// separate context of "this document only exists to show what's still
// missing" -- true for a blank form, not for a filled one.
import PizZip from "pizzip";

const BRACKET_RE = /\[[^\[\]]+\]/g;
const RUN_RE = /<w:r>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g;

function withHighlight(rPr: string): string {
  const stripped = rPr.replace(/<w:highlight\s+[^>]*\/>/g, "");
  if (!stripped) return '<w:rPr><w:highlight w:val="yellow"/></w:rPr>';
  return stripped.replace("</w:rPr>", '<w:highlight w:val="yellow"/></w:rPr>');
}

function splitRun(runXml: string): string {
  const tMatch = runXml.match(/<w:t([^>]*)>([^<]*)<\/w:t>/);
  if (!tMatch) return runXml;
  const [, tAttrs, text] = tMatch;
  if (!BRACKET_RE.test(text)) return runXml;
  BRACKET_RE.lastIndex = 0;

  const rPrMatch = runXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  const rPr = rPrMatch ? rPrMatch[0] : "";
  const highlightedRPr = withHighlight(rPr);
  const spaceAttr = tAttrs.includes("xml:space") ? tAttrs : ` xml:space="preserve"${tAttrs}`;

  const segments: { text: string; highlight: boolean }[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(BRACKET_RE)) {
    if (m.index! > lastIndex) segments.push({ text: text.slice(lastIndex, m.index), highlight: false });
    segments.push({ text: m[0], highlight: true });
    lastIndex = m.index! + m[0].length;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), highlight: false });

  return segments
    .map((seg) => `<w:r>${seg.highlight ? highlightedRPr : rPr}<w:t${spaceAttr}>${seg.text}</w:t></w:r>`)
    .join("");
}

export function highlightBracketedPlaceholders(docxBytes: Buffer): Buffer {
  const zip = new PizZip(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return docxBytes;
  const xml = docFile.asText();
  if (!/\[[^\[\]]+\]/.test(xml)) return docxBytes;

  const newXml = xml.replace(RUN_RE, splitRun);
  if (newXml === xml) return docxBytes;

  zip.file("word/document.xml", newXml);
  return zip.generate({ type: "nodebuffer" });
}
