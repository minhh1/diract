// lib/precedents/letterLayout.ts
// Last-mile layout tidy-up applied to the firm's letterhead .docx right
// before it's filled (see lib/precedents/issuePrecedent.ts) -- the three
// things a generated letter kept getting wrong that neither the letterhead
// itself nor the composed content block (lib/precedents/contentXml.ts) is in
// a position to fix:
//
//   1. Breathing room at the top. Every letterhead's first letter line (its
//      Our Ref/date/address/content tag, whichever comes first) sat hard up
//      under the header art.
//   2. Exactly one blank line above and below the subject heading -- firms'
//      letterheads variously ship none, one, or three.
//   3. A stray label left in front of the address tag. letterheadClassify.ts
//      used to keep an address paragraph's "Attention:" prefix and append the
//      tag after it, which printed "Attention: 231 Moore Street" -- an
//      Attention line names a person, and nothing in the app ever collects
//      one, so the label is dropped and the address stands on its own.
//
// Everything here works on word/document.xml paragraphs directly (same
// approach as signoffXml.ts/contentXml.ts) and runs BEFORE Docxtemplater, so
// the tags it moves around are still literal {{...}} text at this point.
import PizZip from "pizzip";

const PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

// Requested (2026-08-02) as "at least 5 more empty rows on top" -- deliberately
// additive to whatever spacing the letterhead already has, rather than a
// target total, since a letterhead's own header art height varies.
export const TOP_SPACER_PARAGRAPHS = 5;

// A paragraph carrying nothing but whitespace AND no anchored content of its
// own -- an image, a page break, a field, a nested table are all things that
// flatten to empty text but are absolutely not spacers to be collapsed.
function isBlankSpacer(paraXml: string): boolean {
  if (paraXml.replace(/<[^>]+>/g, "").trim()) return false;
  return !/<w:(drawing|pict|object|br|fldChar|instrText|tbl)\b/.test(paraXml);
}

// A blank paragraph that inherits the anchor's own paragraph properties, so
// the gap matches the surrounding font size/line spacing instead of the
// document default. Numbering is dropped -- a blank paragraph inside a
// numbered list would otherwise print a stray bullet/number.
function blankLike(paraXml: string): string {
  const pPrMatch = paraXml.match(/<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
  const pPr = pPrMatch ? pPrMatch[0].replace(/<w:numPr\b[^>]*>[\s\S]*?<\/w:numPr>/g, "") : "";
  return `<w:p>${pPr}</w:p>`;
}

// Paragraphs inside a table cell are laid out by the cell, not by blank
// paragraphs around them -- adding/removing spacers there changes the cell's
// height rather than the letter's spacing, so those are left alone.
function insideTable(xml: string, paraStart: number): boolean {
  const before = xml.slice(0, paraStart);
  const opens = (before.match(/<w:tbl\b/g) || []).length;
  const closes = (before.match(/<\/w:tbl>/g) || []).length;
  return opens > closes;
}

function hasTag(text: string, tagKey: string): boolean {
  return new RegExp(`\\{\\{\\s*${tagKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`).test(text);
}

export interface LetterLayoutOptions {
  /** company_letterheads.address_tag_key -- the paragraph whose stray "Attention:"-style label is dropped. */
  addressTagKey: string;
  /**
   * Every tag that marks the start of the letter proper, in no particular
   * order (address/content/our_ref/date/...) -- the earliest paragraph
   * holding any of them is what the top spacing goes above.
   */
  letterTagKeys: string[];
  /** The subject heading's tag, when this letterhead has one of its own (a plain letterhead's subject lives in the content block instead). */
  subjectTagKey?: string | null;
}

export function normalizeLetterLayout(docxBytes: Buffer, opts: LetterLayoutOptions): Buffer {
  const zip = new PizZip(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return docxBytes;
  const xml = docFile.asText();
  const paras = [...xml.matchAll(PARA_RE)];
  if (!paras.length) return docxBytes;

  const texts = paras.map((m) => m[0].replace(/<[^>]+>/g, ""));
  const inTable = paras.map((m) => insideTable(xml, m.index!));
  const blank = paras.map((m) => isBlankSpacer(m[0]));

  const toDelete = new Set<number>();
  const insertBefore = new Map<number, string[]>();
  const toReplace = new Map<number, string>();
  const addBefore = (index: number, xmlToAdd: string[]) => {
    insertBefore.set(index, [...(insertBefore.get(index) || []), ...xmlToAdd]);
  };

  // 1. Drop a leftover label in front of the address tag ("Attention: {{address}}").
  const addressIdx = texts.findIndex((t) => hasTag(t, opts.addressTagKey));
  if (addressIdx !== -1 && /^\s*[^:{}]{1,40}:\s*\{\{/.test(texts[addressIdx])) {
    const paraXml = paras[addressIdx][0];
    // Only the label text is removed -- the run keeps its own formatting, so
    // the address still prints in whatever font the letterhead designed for it.
    toReplace.set(
      addressIdx,
      paraXml.replace(/(<w:t\b[^>]*>)([^<]*?):\s*(?=\{\{|<)/, "$1")
    );
  }

  // 2. Exactly one blank line above and below the subject heading.
  const subjectIdx = opts.subjectTagKey ? texts.findIndex((t) => hasTag(t, opts.subjectTagKey!)) : -1;
  if (subjectIdx !== -1 && !inTable[subjectIdx]) {
    let above = 0;
    while (subjectIdx - above - 1 >= 0 && blank[subjectIdx - above - 1]) above++;
    if (above === 0) addBefore(subjectIdx, [blankLike(paras[subjectIdx][0])]);
    // Keeps the one nearest the heading, drops the rest.
    for (let i = subjectIdx - above; i <= subjectIdx - 2; i++) toDelete.add(i);

    let below = 0;
    while (subjectIdx + below + 1 < paras.length && blank[subjectIdx + below + 1]) below++;
    if (below === 0 && subjectIdx + 1 < paras.length) addBefore(subjectIdx + 1, [blankLike(paras[subjectIdx][0])]);
    for (let i = subjectIdx + 2; i <= subjectIdx + below; i++) toDelete.add(i);
  }

  // 3. Breathing room above the first line of the letter itself.
  let firstLetterIdx = -1;
  for (let i = 0; i < texts.length; i++) {
    if (inTable[i]) continue;
    if (opts.letterTagKeys.some((key) => hasTag(texts[i], key))) { firstLetterIdx = i; break; }
  }
  if (firstLetterIdx !== -1) {
    const spacer = blankLike(paras[firstLetterIdx][0]);
    addBefore(firstLetterIdx, Array.from({ length: TOP_SPACER_PARAGRAPHS }, () => spacer));
  }

  if (!toDelete.size && !insertBefore.size && !toReplace.size) return docxBytes;

  let newXml = "";
  let lastEnd = 0;
  paras.forEach((m, i) => {
    const start = m.index!;
    newXml += xml.slice(lastEnd, start);
    for (const extra of insertBefore.get(i) || []) newXml += extra;
    if (!toDelete.has(i)) newXml += toReplace.get(i) ?? m[0];
    lastEnd = start + m[0].length;
  });
  newXml += xml.slice(lastEnd);

  zip.file("word/document.xml", newXml);
  return zip.generate({ type: "nodebuffer" });
}
