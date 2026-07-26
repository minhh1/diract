// lib/precedents/signoffXml.ts
// Builds the signoff block for an issued precedent (Name in bold, then
// Position / Company Name / Contact Number / Contact Email each on their own
// line) and splices it into the letterhead's {{signoff}} tag paragraph as raw
// OOXML -- docxtemplater's plain-text tag substitution applies one uniform
// run formatting to a whole tag's value, so it can't make just the name bold
// within the same {{content}} tag the rest of the letter uses. This runs
// BEFORE Docxtemplater (see app/api/precedents/[id]/issue/route.ts): by the
// time Docxtemplater renders {{address}}/{{content}}, the {{signoff}} tag
// text is already gone, replaced by real formatted paragraphs, so there's
// nothing left for it to touch.
import PizZip from "pizzip";

export interface SignoffPerson {
  name: string;
  position?: string | null;
  companyName?: string | null;
  contactNumber?: string | null;
  contactEmail?: string | null;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function plainParagraph(text: string): string {
  return `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function boldParagraph(text: string): string {
  return `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function signoffParagraphs(person: SignoffPerson): string {
  const lines = [person.position, person.companyName, person.contactNumber, person.contactEmail].filter(Boolean) as string[];
  return boldParagraph(person.name) + lines.map(plainParagraph).join("");
}

// Blank paragraph between signers, none after the last one.
export function buildSignoffXml(people: SignoffPerson[]): string {
  return people.map(signoffParagraphs).join("<w:p/>");
}

// Replaces the whole paragraph containing the {{signoffTagKey}} placeholder
// with the built signoff XML. A no-op (returns the original bytes) if the tag
// isn't found -- e.g. a letterhead uploaded before this tag existed and not
// yet re-uploaded.
export function insertSignoffBlock(docxBytes: Buffer, signoffTagKey: string, people: SignoffPerson[]): Buffer {
  const zip = new PizZip(docxBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) return docxBytes;
  const xml = docFile.asText();

  const PARA_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  const tagRe = new RegExp(`\\{\\{\\s*${signoffTagKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`);
  const replacement = buildSignoffXml(people);
  let replaced = false;
  const newXml = xml.replace(PARA_RE, (block) => {
    if (replaced) return block;
    const text = block.replace(/<[^>]+>/g, "");
    if (!tagRe.test(text)) return block;
    replaced = true;
    return replacement;
  });
  if (!replaced) return docxBytes;

  zip.file("word/document.xml", newXml);
  return zip.generate({ type: "nodebuffer" });
}
