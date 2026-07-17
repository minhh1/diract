// lib/docxCleanup.ts
// Post-render cleanup for generated documents. Plain {{tag}} mail-merge
// substitution leaves the original document's whitespace/paragraph
// structure untouched, so a tag left blank (or explicitly marked "Not
// applicable") either leaves an empty line (when the tag was the whole
// content of its paragraph, e.g. a dedicated address line) or a stray
// double space (when it sat inline within a sentence). This module removes
// both, without touching paragraphs that were always meant to be blank.
import PizZip from "pizzip";

const TAG_RE = /\{\{\s*[^{}]+?\s*\}\}/g;
const PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

// Must run on the ORIGINAL (pre-render) word/document.xml — after rendering,
// a paragraph that's now blank could either have always been blank (leave
// it alone) or have contained only a tag that rendered empty (remove it).
// Only the pre-render text can tell these apart.
export function findSoleTagParagraphs(rawDocXml: string): Set<number> {
  const indexes = new Set<number>();
  let m: RegExpExecArray | null;
  let idx = 0;
  PARA_RE.lastIndex = 0;
  while ((m = PARA_RE.exec(rawDocXml)) !== null) {
    const text = m[0].replace(/<[^>]+>/g, "");
    const hasTag = new RegExp(TAG_RE.source).test(text);
    const withoutTags = text.replace(new RegExp(TAG_RE.source, "g"), "").trim();
    if (hasTag && withoutTags === "") indexes.add(idx);
    idx++;
  }
  return indexes;
}

function cleanupRenderedXml(renderedDocXml: string, soleTagParagraphIndexes: Set<number>): string {
  let idx = 0;
  let out = renderedDocXml.replace(PARA_RE, (block) => {
    const isSoleTagPara = soleTagParagraphIndexes.has(idx);
    idx++;
    if (!isSoleTagPara) return block;
    // Confirm it actually rendered blank before removing — a sole-tag
    // paragraph whose tag got a real value should stay exactly as is.
    const visibleText = block.replace(/<[^>]+>/g, "").trim();
    return visibleText === "" ? "" : block;
  });

  // Inline blanks (a tag inside a sentence rendering to "") leave a doubled
  // space rather than a whole empty paragraph — collapse those too.
  out = out.replace(/(<w:t[^>]*>)([^<]*)(<\/w:t>)/g, (_full, open, text, close) => {
    return `${open}${text.replace(/ {2,}/g, " ")}${close}`;
  });

  return out;
}

export function cleanupDocxBuffer(bytes: Buffer, soleTagParagraphIndexes: Set<number>): Buffer {
  const zip = new PizZip(bytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return bytes;
  zip.file("word/document.xml", cleanupRenderedXml(docFile.asText(), soleTagParagraphIndexes));
  return zip.generate({ type: "nodebuffer" });
}
