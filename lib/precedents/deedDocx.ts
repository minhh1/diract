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
import { DEED_STYLES } from "@/lib/precedents/deedTemplateStyles";

const MARK = "\u0001";
// Splits a line into left and right cells. A second control character, for
// the same reason as MARK: nothing typed into a deed can contain one. Both are
// stripped before the text reaches the XML (see stripXmlIllegal).
const COL = "\u0002";

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

/**
 * A two-column line, used for signing blocks where two officers sign side by
 * side. Rendered as a borderless table row so the columns line up the way a
 * firm's own execution page does; stacking them reads as one long list and
 * loses which signature belongs to which officer.
 */
/**
 * Ends the cover page. A deed's first page carries the title and the footer
 * and nothing else; the parties and the operative provisions start overleaf.
 */
export const DEED_PAGE_BREAK = "\u0003";

export function deedColumns(left: string, right: string): string {
  return `${left}${COL}${right}`;
}

/** Whether a line is a two-column row. */
export function isColumnLine(text: string): boolean {
  return text.includes(COL);
}

/** Strips style markers, for anything that wants the plain words. */
export function stripStyleMarkers(body: string): string {
  return body.replace(/[^]*/g, "");
}

/**
 * Removes characters XML 1.0 forbids outright. Control characters below 0x20
 * other than tab, newline and carriage return are not merely discouraged --
 * they cannot be represented at all, and a document containing one is
 * rejected by Word as unreadable rather than being shown with odd glyphs.
 * The style marker is one of them, so it must never reach the output.
 */
export function stripXmlIllegal(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

// 1.35 cm in twips (1 cm = 567 twips). Every numbered level hangs by this
// much, and each level's left indent is one step further in, so level 2's
// text starts where level 1's text started and so on. Without this the levels
// are independent and (i)/(ii)/(iii) sits under the wrong column.
const STEP = 765;

/** Which numbered level a style sits at, or null if it isn't a numbered list. */
function styleLevel(styleId: string): number | null {
  const m = /Level\s*-?\s*([1-5])/i.exec(styleId);
  if (m) return Number(m[1]);
  if (/Recital-Level2/i.test(styleId)) return 2;
  if (/Recital-Level3/i.test(styleId)) return 3;
  if (/Recital/i.test(styleId)) return 1;
  return null;
}

/**
 * Explicit indents on every numbered paragraph.
 *
 * The template's own numbering decides these otherwise, and a firm's levels
 * are often set independently of each other -- which is how (i)/(ii)/(iii)
 * ends up indented to level 3 rather than level 4. Stating them here makes
 * the levels share an alignment grid: level n starts at n x 1.35 cm and hangs
 * back 1.35 cm, so each level's text begins exactly where the level above it
 * began.
 */
function indentXml(styleId: string | null): string {
  if (!styleId) return "";
  const level = styleLevel(styleId);
  if (!level) return "";
  return `<w:ind w:left="${level * STEP}" w:hanging="${STEP}"/>`;
}

function escapeXml(s: string): string {
  return stripXmlIllegal(s)
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
  const direct = byName.get(normalise(wanted));
  if (direct) return direct;
  // Fall back to the other names this style is known by, so a template that
  // predates the generic naming still resolves.
  const entry = DEED_STYLES.find(s => s.id === wanted || normalise(s.name) === normalise(wanted));
  for (const alias of entry?.aliases ?? []) {
    const hit = byName.get(normalise(alias));
    if (hit) return hit;
  }
  return null;
}

/** One borderless two-column row; widths are half the A4 text width each. */
function columnRowXml(styleId: string | null, left: string, right: string): string {
  const cell = (t: string) =>
    `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="4513"/>` +
    `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>` +
    `</w:tcPr>${paragraphXml(styleId, t)}</w:tc>`;
  return `<w:tr>${cell(left)}${cell(right)}</w:tr>`;
}

function columnTableXml(rows: string): string {
  return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="9026"/>` +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>` +
    `<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="4513"/><w:gridCol w:w="4513"/></w:tblGrid>${rows}</w:tbl>`;
}

function paragraphXml(styleId: string | null, text: string): string {
  const pPr = styleId
    ? `<w:pPr><w:pStyle w:val="${escapeXml(styleId)}"/>${indentXml(styleId)}</w:pPr>`
    : "";
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

  // Consecutive two-column lines collapse into one table, so a signing block
  // stays a single aligned unit rather than a run of one-row tables.
  const lines = parseDeedBody(body);
  let paragraphs = "";
  let pendingRows = "";
  const flushRows = () => { if (pendingRows) { paragraphs += columnTableXml(pendingRows); pendingRows = ""; } };
  for (const l of lines) {
    const style = l.style ? resolveStyleId(l.style, templateStyles, byName) : null;
    if (isColumnLine(l.text)) {
      const [left, right] = l.text.split(COL);
      pendingRows += columnRowXml(style, left, right ?? "");
      continue;
    }
    flushRows();
    if (l.text === DEED_PAGE_BREAK) {
      paragraphs += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      continue;
    }
    paragraphs += paragraphXml(style, l.text);
  }
  flushRows();

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
