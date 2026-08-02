// lib/precedents/contentXml.ts
// Splices the composed letter body -- date/Our Ref (only for a "plain"
// letterhead with no dedicated tag for them), subject, salutation, the
// body text, and closing -- into the {{content}} tag's paragraph as raw
// OOXML, the same pattern lib/precedents/signoffXml.ts uses for {{signoff}}.
// This runs BEFORE Docxtemplater (see app/api/precedents/[id]/issue/route.ts),
// same as insertSignoffBlock.
//
// Previously this content was one flat \n-joined string, filled via
// Docxtemplater's `linebreaks: true` option -- which turns every \n into a
// <w:br/> INSIDE THE SAME paragraph and run. That meant every line shared
// one run's formatting (an embedded subject line could never be bold) and a
// blank "\n\n" gap between sections never got real paragraph spacing, so it
// looked tighter than the blank paragraphs used elsewhere in the letterhead.
// Real <w:p> elements per line/section, each reusing the {{content}} tag's
// own pPr (so they match the surrounding letterhead's font/spacing), fix
// both.
import PizZip from "pizzip";

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface ComposeContentInput {
  date?: string | null; // only set for a plain letterhead with no dedicated {{date}} tag
  ourRef?: string | null; // only set for a plain letterhead with no dedicated {{our_ref}} tag
  subject?: string | null; // only set when the letterhead has no dedicated {{subject}} tag
  salutation?: string | null; // only set when the letterhead has no dedicated {{salutation}} tag
  body: string;
  closing?: string | null; // only set when the letterhead has no dedicated closing text of its own
}

// Extracts the paragraph mark's run properties (font size/family etc.) from
// a pPr block and re-applies them to a new run, toggling bold on/off --
// same approach as letterheadClassify.ts's rebuildParagraph, so a generated
// paragraph looks like it was always part of the letterhead instead of
// falling back to the document's default font.
function runPropsFromPPr(pPr: string, bold: boolean): string {
  const markRprMatch = pPr.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/);
  let inner = (markRprMatch ? markRprMatch[1] : "")
    .replace(/<w:b\s*\/?>|<w:b\s+[^>]*?\/?>/g, "")
    .replace(/<w:bCs\s*\/?>|<w:bCs\s+[^>]*?\/?>/g, "");
  if (bold) inner = `<w:b/><w:bCs/>${inner}`;
  return inner ? `<w:rPr>${inner}</w:rPr>` : "";
}

function paragraphXml(pPr: string, text: string, bold: boolean): string {
  const rPr = runPropsFromPPr(pPr, bold);
  const lines = text.split("\n");
  const runs = lines
    .map((line, i) => `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>${i < lines.length - 1 ? "<w:br/>" : ""}`)
    .join("");
  return `<w:p>${pPr}${runs}</w:p>`;
}

function blankParagraphXml(pPr: string): string {
  return `<w:p>${pPr}</w:p>`;
}

function bodyParagraphs(body: string): string[] {
  return body.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
}

export function buildContentXml(pPr: string, input: ComposeContentInput): string {
  const parts: string[] = [];
  if (input.date) parts.push(paragraphXml(pPr, input.date, false));
  if (input.ourRef) parts.push(paragraphXml(pPr, `Our Ref: ${input.ourRef}`, false));
  if (input.date || input.ourRef) parts.push(blankParagraphXml(pPr));
  if (input.subject) {
    // Exactly one blank line above and below the subject heading -- the
    // "above" one only when something actually precedes it, since a leading
    // blank at the very top of the block is just a stray gap (the letter's
    // own top spacing is handled in lib/precedents/letterLayout.ts).
    if (parts.length && parts[parts.length - 1] !== blankParagraphXml(pPr)) parts.push(blankParagraphXml(pPr));
    parts.push(paragraphXml(pPr, input.subject, true));
    parts.push(blankParagraphXml(pPr));
  }
  if (input.salutation) {
    parts.push(paragraphXml(pPr, input.salutation, false));
    parts.push(blankParagraphXml(pPr));
  }
  const bodyParas = bodyParagraphs(input.body);
  bodyParas.forEach((para, i) => {
    parts.push(paragraphXml(pPr, para, false));
    if (i < bodyParas.length - 1) parts.push(blankParagraphXml(pPr));
  });
  if (input.closing) {
    parts.push(blankParagraphXml(pPr));
    parts.push(paragraphXml(pPr, input.closing, false));
  }
  return parts.join("");
}

// Replaces the whole paragraph containing {{contentTagKey}} with the built
// content XML -- same find-by-flattened-text approach as
// signoffXml.ts's insertSignoffBlock. A no-op (returns the original bytes)
// if the tag isn't found.
export function insertContentBlock(docxBytes: Buffer, contentTagKey: string, input: ComposeContentInput): Buffer {
  const zip = new PizZip(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return docxBytes;
  const xml = docFile.asText();

  const PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const tagRe = new RegExp(`\\{\\{\\s*${contentTagKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`);
  let replaced = false;
  const newXml = xml.replace(PARA_RE, (block) => {
    if (replaced) return block;
    const text = block.replace(/<[^>]+>/g, "");
    if (!tagRe.test(text)) return block;
    replaced = true;
    const pPrMatch = block.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
    const pPr = pPrMatch ? pPrMatch[0] : "";
    return buildContentXml(pPr, input);
  });
  if (!replaced) return docxBytes;

  zip.file("word/document.xml", newXml);
  return zip.generate({ type: "nodebuffer" });
}
