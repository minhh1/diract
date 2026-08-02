// lib/precedents/deedDocx.ts
// Builds a deed by putting our content into the firm's own deed template.
//
// The problem this solves: a deed's numbering and indentation live in the
// template's named styles, but BodyTemplateSegment is text-or-field and has
// nowhere to say "this paragraph is HL List - Level 2 - Bold". Rather than
// change that shared type -- it is used by the letter path, the issue
// pipeline and body-template detection, none of which have paragraph styles --
// a deed marks the style inline at the start of the line.
//
// The marker is a control character (U+0001) plus the style id. Control
// characters never occur in legal prose, so nothing a solicitor types can
// collide with one, and a renderer that doesn't know about them can strip
// /[^]*/ and be left with clean text.
//
// Generation keeps the template's section properties -- page size, margins and
// the header/footer references -- and replaces the body content. So the deed
// comes out on the firm's page setup, with the firm's headers and footers and
// the firm's numbering, and only the words are ours.
import PizZip from "pizzip";

const MARK = "";

/** Prefixes a line so the deed renderer knows which style to apply. */
export function styled(styleId: string, text: string): string {
  return `${MARK}${styleId}${MARK}${text}`;
}

export interface DeedLine {
  /** Style id to apply, or null for the template's default paragraph style. */
  style: string | null;
  text: string;
}

/** Splits a deed body into styled lines. */
export function parseDeedBody(body: string): DeedLine[] {
  return body.split("\n").map(raw => {
    const m = /^([^]*)([\s\S]*)$/.exec(raw);
    return m ? { style: m[1] || null, text: m[2] } : { style: null, text: raw };
  });
}

/** Strips style markers, for anything that wants the plain words. */
export function stripStyleMarkers(body: string): string {
  return body.replace(/[^]*/g, "");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Resolves the style id to use for a line. The library authors against the
 * default scheme's ids, but a firm's own template may name the same styles
 * differently, so fall back to matching on the style NAME before giving up and
 * leaving the paragraph unstyled.
 */
function resolveStyleId(wanted: string, templateStyles: Record<string, string>, byName: Map<string, string>): string | null {
  if (templateStyles[wanted]) return wanted;
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return byName.get(normalise(wanted)) ?? null;
}

function paragraphXml(styleId: string | null, text: string): string {
  const pPr = styleId ? `<w:pPr><w:pStyle w:val="${escapeXml(styleId)}"/></w:pPr>` : "";
  if (!text) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/**
 * @param templateBytes the firm's uploaded deed template
 * @param body          the deed, with style markers from styled()
 */
export function buildDeedDocx(templateBytes: Buffer, body: string): Buffer {
  const zip = new PizZip(templateBytes);
  const docFile = zip.file("word/document.xml");
  if (!docFile) throw new Error("The deed template has no document body.");
  const xml = docFile.asText();

  // Map the template's styles so content authored against the default ids
  // still lands on a firm's equivalently named styles.
  const templateStyles: Record<string, string> = {};
  const stylesXml = zip.file("word/styles.xml")?.asText() ?? "";
  const styleRe = /<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g;
  let sm: RegExpExecArray | null;
  const byName = new Map<string, string>();
  while ((sm = styleRe.exec(stylesXml))) {
    const name = /<w:name w:val="([^"]+)"/.exec(sm[2])?.[1] ?? "";
    templateStyles[sm[1]] = name;
    if (name) byName.set(name.toLowerCase().replace(/[^a-z0-9]/g, ""), sm[1]);
  }
  // The library's ids are also names, so a template using different ids but
  // the same names still resolves.
  for (const [id, name] of Object.entries(templateStyles)) {
    const k = id.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!byName.has(k)) byName.set(k, id);
    void name;
  }

  const paragraphs = parseDeedBody(body)
    .map(l => paragraphXml(l.style ? resolveStyleId(l.style, templateStyles, byName) : null, l.text))
    .join("");

  // Keep the template's sectPr: it carries the page size, margins and the
  // header/footer relationships, so dropping it would lose the firm's own
  // page setup and branding along with it.
  const sectPr = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(xml)?.[0] ?? "";
  const bodyOpen = xml.indexOf("<w:body>");
  const bodyClose = xml.lastIndexOf("</w:body>");
  if (bodyOpen < 0 || bodyClose < 0) throw new Error("The deed template's body could not be read.");

  const rebuilt =
    xml.slice(0, bodyOpen + "<w:body>".length) +
    paragraphs +
    sectPr +
    xml.slice(bodyClose);

  zip.file("word/document.xml", rebuilt);
  // DEFLATE explicitly -- PizZip stores uncompressed by default.
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * Authors one styled paragraph of a deed as body-template segments.
 *
 * The style marker has to sit at the very start of the line, so it is folded
 * into the first text segment; fields then follow inline as normal. Each line
 * ends with a newline, which is what parseDeedBody splits on.
 *
 * Typed loosely against the segment shape rather than importing
 * BodyTemplateSegment, so this module stays free of the letter path's types.
 */
export function deedLine<T extends { type: string }>(
  styleId: string | null,
  parts: (string | T)[]
): T[] {
  const out: T[] = [];
  const prefix = styleId ? `${MARK}${styleId}${MARK}` : "";
  let first = true;
  for (const p of parts) {
    if (typeof p === "string") {
      out.push({ type: "text", text: (first ? prefix : "") + p } as unknown as T);
      first = false;
    } else {
      if (first) {
        out.push({ type: "text", text: prefix } as unknown as T);
        first = false;
      }
      out.push(p);
    }
  }
  if (first) out.push({ type: "text", text: prefix } as unknown as T);
  out.push({ type: "text", text: "\n" } as unknown as T);
  return out;
}
