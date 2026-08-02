// lib/precedents/crossRefCheck/documentModel.ts
// One paragraph walk, shared by the numbering engine, reference detection
// and markup, so all three agree on what "paragraph 42" means. Offsets are
// absolute into the original document.xml string, not just the body, so
// markup can splice a paragraph's new XML straight back in without having
// to re-find it.
export interface DocParagraph {
  index: number;
  /** Absolute offset of the paragraph's opening <w:p ...> in document.xml. */
  start: number;
  /** Absolute offset just past the paragraph's closing </w:p>. */
  end: number;
  /** The full <w:p ...>...</w:p>, exactly as it appears in document.xml. */
  xml: string;
  styleId: string | null;
  /** Concatenated run text, entities decoded, tags stripped. */
  text: string;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function extractParagraphs(documentXml: string): DocParagraph[] {
  const paragraphs: DocParagraph[] = [];
  const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  let m: RegExpExecArray | null;
  let index = 0;
  while ((m = pRe.exec(documentXml))) {
    const xml = m[0];
    const pPrMatch = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(xml);
    const styleId = pPrMatch ? /<w:pStyle w:val="([^"]+)"/.exec(pPrMatch[1])?.[1] ?? null : null;
    const runs = xml.match(/<w:t\b[^>]*>([^<]*)<\/w:t>/g) ?? [];
    const text = decodeXmlEntities(
      runs.map(r => /<w:t\b[^>]*>([^<]*)<\/w:t>/.exec(r)?.[1] ?? "").join("")
    );
    paragraphs.push({ index, start: m.index, end: m.index + xml.length, xml, styleId, text });
    index++;
  }
  return paragraphs;
}
