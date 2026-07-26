// lib/precedents/letterheadTag.ts
// Auto-inserts the two mail-merge tags an uploaded letterhead needs, so a firm
// never has to hand-edit their Word letterhead to add {{tag}} placeholders
// themselves (see app/api/precedents/letterhead/route.ts, the only caller).
// A letterhead's logo/address/footer artwork almost always lives either in
// Word's real Header/Footer parts (untouched by anything here) or as the
// leading content of the body (a logo image, firm name/address lines) with
// the rest of the page left blank for the letter -- either way, the point
// where OUR content belongs is always "right before the body's trailing
// section properties", since that's simultaneously "after any existing
// content" and "at the very start" when there is none. Uses the same
// text-based XML manipulation style as lib/docxCleanup.ts and
// app/api/document-templates/upload/route.ts's extractTags, not a full XML
// parser -- consistent with how this codebase already treats word/document.xml.
import PizZip from "pizzip";

function tagParagraphXml(tagKey: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">{{${tagKey}}}</w:t></w:r></w:p>`;
}

function hasTag(docXml: string, tagKey: string): boolean {
  const textOnly = docXml.replace(/<[^>]+>/g, "");
  const re = new RegExp(`\\{\\{\\s*${tagKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`);
  return re.test(textOnly);
}

// Inserts <w:p> paragraphs for whichever of addressTagKey/contentTagKey
// aren't already present somewhere in the document (a firm that hand-authored
// its own {{address}}/{{content}} tags keeps them as-is), immediately before
// the body's own trailing <w:sectPr> (or at the very end of the body if this
// document has none, which shouldn't happen for a real Word doc but is
// handled defensively). Address is inserted above content, matching a formal
// letter's layout (inside address, then the rest of the letter).
export function insertLetterTags(docxBytes: Buffer, addressTagKey: string, contentTagKey: string): Buffer {
  const zip = new PizZip(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return docxBytes;
  const xml = docFile.asText();

  const needsAddress = !hasTag(xml, addressTagKey);
  const needsContent = !hasTag(xml, contentTagKey);
  if (!needsAddress && !needsContent) return docxBytes;

  const bodyOpenMatch = xml.match(/<w:body\b[^>]*>/);
  const bodyCloseIdx = xml.lastIndexOf("</w:body>");
  if (!bodyOpenMatch || bodyCloseIdx === -1) return docxBytes;

  const bodyContentStart = bodyOpenMatch.index! + bodyOpenMatch[0].length;
  const bodyInner = xml.slice(bodyContentStart, bodyCloseIdx);

  // The body's OWN trailing section properties are always the last <w:sectPr>
  // textually, even in a multi-section document (earlier section breaks live
  // inside a paragraph's <w:pPr>, which always sits before this one).
  const sectPrIdx = bodyInner.lastIndexOf("<w:sectPr");
  const insertAt = sectPrIdx === -1 ? bodyInner.length : sectPrIdx;

  const toInsert = [needsAddress ? tagParagraphXml(addressTagKey) : "", needsContent ? tagParagraphXml(contentTagKey) : ""].join("");
  const newBodyInner = bodyInner.slice(0, insertAt) + toInsert + bodyInner.slice(insertAt);
  const newXml = xml.slice(0, bodyContentStart) + newBodyInner + xml.slice(bodyCloseIdx);

  zip.file("word/document.xml", newXml);
  return zip.generate({ type: "nodebuffer" });
}
