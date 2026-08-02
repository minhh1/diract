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

// Three more control characters, for the party-details block at the top of a
// deed (see partyRow/ruleAbove/BOLD_MARK below) -- same reasoning as MARK and
// COL: never typed by a solicitor, stripped before the XML is written.
const RULE = "\u0006";
const PARTY_COL = "\u0008";
/** Toggles bold on/off within a run of text -- see runsXml. */
export const BOLD_MARK = "\u0007";

/**
 * Marks a paragraph as carrying a horizontal rule and 1.5-line spacing, the
 * way the title, "Parties" and the line closing the parties table all do on
 * the firm's own deeds. weight 0 is spacing with no visible rule (the "Date"
 * line, which sits under the title's own rule with nothing repeated above
 * it); 4 and 8 are single-line borders of that weight, matching a thin rule
 * under the title against the heavier one that brackets the parties table.
 */
export function ruleAbove(weight: 0 | 4 | 8, text: string): string {
  return `${RULE}${weight}${text}`;
}

/** One row of the parties table: a label ("Name", "Address", "Shortname") and, appended by the caller, its value. */
export function partyRow(label: string): string {
  return `${label}${PARTY_COL}`;
}

/** Whether a line is a parties-table row. */
function isPartyColumnLine(text: string): boolean {
  return text.includes(PARTY_COL);
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

// 1.35 cm in twips (1 cm = 567 twips).
//
// Levels 1 and 2 share one marker column, then each level from 3 on steps in
// by one STEP. This looked like an odd guess until the firm gave the exact
// geometry directly: level 1 and level 2 numbered items both have their
// marker at the margin (0), level 3's at 1.35cm, level 4's at 2.70cm -- and
// separately confirmed by the template's own numbering.xml, where "HL List -
// Level 1" and "HL List - Level 2" turned out to define IDENTICAL indents.
// Text always sits exactly one STEP to the right of its own marker, so
// w:hanging is the constant STEP at every level; only the marker's position
// (and therefore w:left, which is marker + STEP) changes.
const STEP = 765;

// Half-points (OOXML's font-size unit): 10pt, matching the body text. A
// numbering level's marker carries its own size in numbering.xml, set
// independently of the paragraph text next to it -- this firm's level 2 is
// 11pt there against a 10pt body -- so left alone the number and the word
// beside it don't match.
const MARKER_SIZE = 20;

/** Which numbered level a style sits at, or null if it isn't a numbered list. */
function styleLevel(styleId: string): number | null {
  const m = /Level\s*-?\s*([1-5])/i.exec(styleId);
  if (m) return Number(m[1]);
  if (/Recital-Level2/i.test(styleId)) return 2;
  if (/Recital-Level3/i.test(styleId)) return 3;
  if (/Recital/i.test(styleId)) return 1;
  return null;
}

/** Twips from the margin to this level's TEXT (one STEP right of its marker). */
function textPosition(level: number): number {
  return Math.max(1, level - 1) * STEP;
}

/**
 * Explicit indents on every numbered paragraph.
 *
 * The template's own numbering decides these otherwise, and a firm's levels
 * are often set independently of each other -- which is how (i)/(ii)/(iii)
 * ends up indented to the wrong column. Stating them here instead makes every
 * level line up on one grid: a numbered paragraph's marker sits STEP to the
 * left of its text (w:hanging = STEP, constant), and an unnumbered paragraph
 * at the same level sits flush with that text, first line included --
 * w:firstLine="0" rather than a hang, because it has no marker to hang past.
 *
 * This only fixes where the WRAPPED line sits. The marker's own tab is a
 * separate problem -- see patchNumberingTabs below.
 */
function indentXml(styleId: string | null): string {
  if (!styleId) return "";
  const level = styleLevel(styleId);
  if (!level) return "";
  const left = textPosition(level);
  if (/no\s*-?numbering/i.test(styleId)) {
    return `<w:ind w:left="${left}" w:firstLine="0"/>`;
  }
  return `<w:ind w:left="${left}" w:hanging="${STEP}"/>`;
}

/**
 * Where the auto-number's own tab lands is not decided by the paragraph's
 * w:ind at all -- it comes from the numbering level's own w:tabs (or, when a
 * level defines none, the document's default tab grid). A paragraph-level
 * w:tabs override was tried here and made no difference under LibreOffice:
 * the number is a field the numbering definition controls, not the
 * paragraph. So the level itself has to carry the right tab stop, or the
 * marker's text lands short of where the wrapped line below it indents to --
 * exactly the "(a)" that doesn't line up with its own second line.
 *
 * Walks a style's basedOn chain to find the numId + ilvl it numbers with.
 * Needed because a level's own style often declares only the ilvl (its
 * marker shape) and inherits the numId -- which abstractNum, and so which
 * other levels it shares an alignment grid with -- from a style above it.
 */
function resolveNumbering(stylesXml: string, styleId: string): { numId: string; ilvl: string } | null {
  let id: string | null = styleId;
  let ilvl: string | null = null;
  const seen = new Set<string>();
  while (id && !seen.has(id)) {
    seen.add(id);
    const escaped: string = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m: RegExpExecArray | null = new RegExp(`<w:style\\b[^>]*w:styleId="${escaped}"[^>]*>([\\s\\S]*?)</w:style>`).exec(stylesXml);
    if (!m) return null;
    const body: string = m[1];
    const numPr = /<w:numPr>([\s\S]*?)<\/w:numPr>/.exec(body)?.[1];
    if (numPr) {
      if (ilvl === null) ilvl = /<w:ilvl w:val="(\d+)"/.exec(numPr)?.[1] ?? "0";
      const numId = /<w:numId w:val="(\d+)"/.exec(numPr)?.[1];
      if (numId && numId !== "0") return { numId, ilvl: ilvl ?? "0" };
    }
    id = /<w:basedOn w:val="([^"]+)"/.exec(body)?.[1] ?? null;
  }
  return null;
}

/**
 * Rewrites the tab stop (and, for good measure, the indent) on every
 * numbering level actually used in this deed, so the number's own tab lands
 * exactly where paragraphXml's w:ind puts the wrapped text -- see
 * resolveNumbering above for why this can't be done at the paragraph level.
 * Scoped to the levels used rather than every level in the template's
 * numbering.xml, so an unrelated list elsewhere in the template (if the firm
 * ever adds one) is left alone.
 */
function patchNumberingTabs(zip: PizZip, stylesXml: string, styleIds: Set<string>): void {
  const numberingFile = zip.file("word/numbering.xml");
  if (!numberingFile) return;
  let numberingXml = numberingFile.asText();

  const numIdToAbstract = new Map<string, string>();
  const numRe = /<w:num w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g;
  let nm: RegExpExecArray | null;
  while ((nm = numRe.exec(numberingXml))) {
    const absId = /<w:abstractNumId w:val="(\d+)"/.exec(nm[2])?.[1];
    if (absId) numIdToAbstract.set(nm[1], absId);
  }

  let changed = false;
  for (const styleId of styleIds) {
    const level = styleLevel(styleId);
    if (!level || /no\s*-?numbering/i.test(styleId)) continue;
    const ref = resolveNumbering(stylesXml, styleId);
    if (!ref) continue;
    const absId = numIdToAbstract.get(ref.numId);
    if (!absId) continue;
    const left = textPosition(level);
    const newIndTabs = `<w:tabs><w:tab w:val="num" w:pos="${left}"/></w:tabs><w:ind w:left="${left}" w:hanging="${STEP}"/>`;

    const absEscaped = absId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const absRe = new RegExp(`(<w:abstractNum w:abstractNumId="${absEscaped}"[^>]*>)([\\s\\S]*?)(<\\/w:abstractNum>)`);
    const absMatch = absRe.exec(numberingXml);
    if (!absMatch) continue;

    const lvlRe = new RegExp(`<w:lvl w:ilvl="${ref.ilvl}"[^>]*>[\\s\\S]*?<\\/w:lvl>`);
    const lvlMatch = lvlRe.exec(absMatch[2]);
    if (!lvlMatch) continue;

    let patchedLvl = /<w:pPr>[\s\S]*?<\/w:pPr>/.test(lvlMatch[0])
      ? lvlMatch[0].replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, `<w:pPr>${newIndTabs}</w:pPr>`)
      : lvlMatch[0].replace(/<w:rPr>/, `<w:pPr>${newIndTabs}</w:pPr><w:rPr>`);

    // The marker's own size, not just its position: a template's numbering.xml
    // sets this per level independently of the body text (this firm's level 2
    // is 11pt against a 10pt body), so left alone the number reads a different
    // size to the words next to it. w:sz/w:szCs come after w:rFonts and before
    // anything else CT_RPr allows here, so appending just inside the closing
    // tag (once any existing size is stripped) keeps valid element order.
    const sizeXml = `<w:sz w:val="${MARKER_SIZE}"/><w:szCs w:val="${MARKER_SIZE}"/>`;
    if (/<w:rPr>[\s\S]*?<\/w:rPr>/.test(patchedLvl)) {
      patchedLvl = patchedLvl.replace(/<w:rPr>([\s\S]*?)<\/w:rPr>/, (_m, inner: string) => {
        const stripped = inner.replace(/<w:sz w:val="\d+"\/>/g, "").replace(/<w:szCs w:val="\d+"\/>/g, "");
        return `<w:rPr>${stripped}${sizeXml}</w:rPr>`;
      });
    } else {
      patchedLvl = patchedLvl.replace(/<\/w:lvl>$/, `<w:rPr>${sizeXml}</w:rPr></w:lvl>`);
    }

    const newAbsBody = absMatch[2].slice(0, lvlMatch.index) + patchedLvl + absMatch[2].slice(lvlMatch.index + lvlMatch[0].length);
    numberingXml = numberingXml.slice(0, absMatch.index) + absMatch[1] + newAbsBody + absMatch[3]
      + numberingXml.slice(absMatch.index + absMatch[0].length);
    changed = true;
  }

  if (changed) zip.file("word/numbering.xml", numberingXml);
}

function escapeXml(s: string): string {
  return stripXmlIllegal(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Where the party's name goes in an uploaded execution block.
 *
 * A firm's execution page is parsed out of a real signing page from a real
 * matter, so its blocks arrive with actual names in them. Parsing
 * (executionTemplateParse.ts) replaces the name it finds with this token;
 * generation replaces the token with whichever party this deed's own block
 * is for. Both are text-node-scoped (replaceTextInRuns), so the substitution
 * can never land inside a tag and corrupt the XML.
 */
export const EXECUTION_PARTY_TOKEN = "[PARTY_NAME]";

/**
 * Finds `search` across `<w:t>` runs and replaces it with `replacement`.
 * Scoped to text nodes so a search string that happens to match part of an
 * attribute value or a tag name can't corrupt the markup around it.
 *
 * The search can span more than one run. Word routinely splits a phrase it
 * would read as one word across several runs -- a formatting change
 * mid-name, a spell-check marker, a save from an earlier edit -- so "Cao
 * Development B Pty Ltd ACN 676 277 991" is not one `<w:t>` in a real
 * signing page, it is several. A single-run regex finds nothing in that
 * case, silently leaves the real name in place, and every deed generated
 * from the block would carry a stranger's name. This walks the runs in
 * order, matches against their concatenated text, and if the match crosses
 * a run boundary keeps whatever the boundary runs had before/after the
 * match in their own formatting, drops the runs fully inside it, and puts
 * the replacement in the first run of the match, in that run's own
 * formatting.
 */
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export function replaceTextInRuns(xml: string, search: string, replacement: string): string {
  if (!search) return xml;

  const RUN = /<w:t\b[^>]*>([^<]*)<\/w:t>/g;
  interface Run { start: number; end: number; decoded: string; }
  const runs: Run[] = [];
  let rm: RegExpExecArray | null;
  // Matching and splicing both happen in DECODED space: a run's raw XML text
  // can itself contain entities (a name with "&" is not rare), and comparing
  // against a decoded search string would silently miss it. Everything
  // spliced back in -- prefix, replacement and suffix alike -- is re-encoded
  // once on the way out.
  while ((rm = RUN.exec(xml))) runs.push({ start: rm.index, end: rm.index + rm[0].length, decoded: decodeXmlEntities(rm[1]) });
  if (!runs.length) return xml;

  let pos = 0;
  const spans = runs.map(r => { const s = pos; pos += r.decoded.length; return { start: s, end: pos }; });
  const concatenated = runs.map(r => r.decoded).join("");

  const matches: number[] = [];
  let cursor = 0;
  let matchAt = concatenated.indexOf(search, cursor);
  while (matchAt >= 0) { matches.push(matchAt); cursor = matchAt + search.length; matchAt = concatenated.indexOf(search, cursor); }

  let out = xml;
  // Rebuild from the last match backwards: replacing one match changes the
  // string's length, which would invalidate the xml offsets already found
  // for the others if applied forwards.
  for (let mi = matches.length - 1; mi >= 0; mi--) {
    const matchStart = matches[mi];
    const matchEnd = matchStart + search.length;
    const firstRunIdx = spans.findIndex(s => matchStart >= s.start && matchStart < s.end);
    const lastRunIdx = spans.findIndex(s => matchEnd > s.start && matchEnd <= s.end);
    if (firstRunIdx < 0 || lastRunIdx < 0) continue;

    const firstRun = runs[firstRunIdx];
    const lastRun = runs[lastRunIdx];
    const prefix = firstRun.decoded.slice(0, matchStart - spans[firstRunIdx].start);
    const suffix = lastRun.decoded.slice(matchEnd - spans[lastRunIdx].start);

    // The first run keeps its prefix + the replacement, in its own
    // formatting; any run strictly inside the match is dropped entirely;
    // the last run keeps only its suffix. Splicing spliceStart..spliceEnd
    // removes exactly firstRun's <w:t>, every run between, and lastRun's
    // <w:t> -- everything else (the <w:r>/<w:rPr> wrappers on either side)
    // is untouched because it sits outside that range.
    const firstOpenTag = /^<w:t\b[^>]*>/.exec(xml.slice(firstRun.start, firstRun.end))![0];
    const replacementXml =
      `${firstOpenTag}${escapeXml(prefix)}${escapeXml(replacement)}${escapeXml(suffix)}</w:t>`;
    out = out.slice(0, firstRun.start) + replacementXml + out.slice(lastRun.end);
  }
  return out;
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

// The parties table at the top of a deed: "Name"/"Address"/"Shortname" down
// the left, the party's own details on the right. Indented one STEP in from
// the margin (the same step every numbered level uses), so it starts under
// where the "Parties" heading's own text sits rather than under its marker.
// The label column is sized around "Shortname" -- the longest of the three
// labels -- so it, the widest label, leaves exactly one STEP before the
// value column starts; "Name" and "Address" end up with more breathing room,
// which is the firm's own template's own effect, not an inconsistency in it.
const PARTY_TABLE_INDENT = STEP;
const PARTY_LABEL_COL = 1848;
// 9026 is the same A4-less-margins width EXEC_TOTAL uses further down this
// file -- duplicated rather than shared because EXEC_TOTAL isn't declared
// until after this point, and reordering the file for one shared number
// isn't worth it.
const PARTY_VALUE_COL = 9026 - PARTY_TABLE_INDENT - PARTY_LABEL_COL;

// Explicit Arial 10 (not inherited from the template's default paragraph
// style), so the table reads consistently whatever a firm's own Normal
// style happens to be.
const PARTY_FONT: RunFont = { family: "Arial", size: 20 };

function partyColumnRowXml(left: string, right: string): string {
  const cell = (t: string, width: number) =>
    `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/>` +
    `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>` +
    `</w:tcPr>${paragraphXml(null, t, PARTY_FONT, true)}</w:tc>`;
  return `<w:tr>${cell(left, PARTY_LABEL_COL)}${cell(right, PARTY_VALUE_COL)}</w:tr>`;
}

function partyColumnTableXml(rows: string): string {
  return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${PARTY_LABEL_COL + PARTY_VALUE_COL}"/>` +
    `<w:tblInd w:w="${PARTY_TABLE_INDENT}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>` +
    `<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${PARTY_LABEL_COL}"/><w:gridCol w:w="${PARTY_VALUE_COL}"/></w:tblGrid>${rows}</w:tbl>`;
}

/**
 * A definitions clause reads "Term means ..." or "Term has the meaning given
 * in ...", with the defined term as the first words of the paragraph. Bolding
 * it is what lets a reader scan the Definitions clause for the term they're
 * after, rather than reading every line start to finish. Anchored to the
 * start of the paragraph, so an unrelated sentence that happens to use
 * "means" mid-way through is never affected -- a definition is the only thing
 * that opens this way in this library's content.
 */
const DEFINED_TERM_RE = /^([^]+?)(\s+(?:means\b|has the meaning\b)[^]*)$/;

/** Forces a run to a specific font/size regardless of the template's own default -- used for the parties table, which must read Arial 10 whatever the surrounding style is. */
interface RunFont { family: string; size: number; }

function runsXml(text: string, font?: RunFont): string {
  const fontXml = font ? `<w:rFonts w:ascii="${font.family}" w:hAnsi="${font.family}"/><w:sz w:val="${font.size}"/><w:szCs w:val="${font.size}"/>` : "";
  // Explicit bold spans (the parties table's values) take priority over the
  // definitions auto-bold below -- the two never occur in the same text, but
  // if they ever did, an author who went to the trouble of marking a span
  // explicitly meant something more specific than the "Term means" guess.
  if (text.includes(BOLD_MARK)) {
    return text
      .split(BOLD_MARK)
      .map((t, i) => {
        if (!t) return "";
        const rPr = i % 2 === 1 ? `<w:rPr><w:b/>${fontXml}</w:rPr>` : (fontXml ? `<w:rPr>${fontXml}</w:rPr>` : "");
        return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`;
      })
      .join("");
  }
  const m = DEFINED_TERM_RE.exec(text);
  if (!m) {
    const rPr = fontXml ? `<w:rPr>${fontXml}</w:rPr>` : "";
    return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
  }
  const [, term, rest] = m;
  return (
    `<w:r><w:rPr><w:b/>${fontXml}</w:rPr><w:t xml:space="preserve">${escapeXml(term)}</w:t></w:r>` +
    `<w:r>${fontXml ? `<w:rPr>${fontXml}</w:rPr>` : ""}<w:t xml:space="preserve">${escapeXml(rest)}</w:t></w:r>`
  );
}

const LINE_SPACING_150 = `<w:spacing w:line="360" w:lineRule="auto"/>`;
// 480 = 2.0x -- the parties table's rows (Name/Address/Shortname) want more
// room than the 1.5x everything else in this block uses.
const LINE_SPACING_200 = `<w:spacing w:line="480" w:lineRule="auto"/>`;

function paragraphXml(styleId: string | null, text: string, font?: RunFont, spacing?: boolean): string {
  // ruleAbove() prefixes a weight + the rest of the text -- see its own
  // comment. Stripped here rather than left for runsXml, since it describes
  // the paragraph, not a run within it.
  //
  // Only weight 0 (Date) and 4 (the title) get the 1.5-line spacing: they
  // sit above the parties table and want the room. Weight 8 marks the rule
  // that brackets "Parties" and the one that closes the table -- the closing
  // one in particular needs to sit right against the blank row above it and
  // Background below, not add a line of its own on top of them.
  let ruleXml = "";
  if (text.startsWith(RULE)) {
    const weight = text[1];
    ruleXml =
      (weight !== "0" ? `<w:pBdr><w:top w:val="single" w:sz="${weight}" w:space="1" w:color="auto"/></w:pBdr>` : "") +
      (weight === "8" ? "" : LINE_SPACING_150);
    text = text.slice(2);
  } else if (spacing) {
    ruleXml = LINE_SPACING_200;
  }
  const pPrInner = (styleId ? `<w:pStyle w:val="${escapeXml(styleId)}"/>` : "") + ruleXml + (styleId ? indentXml(styleId) : "");
  const pPr = pPrInner ? `<w:pPr>${pPrInner}</w:pPr>` : "";
  if (!text) return `<w:p>${pPr}</w:p>`;
  return `<w:p>${pPr}${runsXml(text, font)}</w:p>`;
}

/**
 * @param templateBytes       the firm's uploaded deed template
 * @param body                the deed, with style markers from styled()
 * @param executionOverrides  key (see ExecutionSpec.key) -> the firm's own
 *   execution block, as parsed by executionTemplateParse.ts. Where a key has
 *   an override, that OOXML is spliced in verbatim in place of our own
 *   generated table -- keeping the firm's own columns, spacer width, bold and
 *   italic runs, blank rows and signature rule, whatever they are. A key with
 *   no override falls back to the built-in block for that kind.
 */
export function buildDeedDocx(
  templateBytes: Buffer,
  body: string,
  executionOverrides?: Record<string, string>
): Buffer {
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
  let pendingPartyRows = "";
  const usedStyles = new Set<string>();
  const flushRows = () => { if (pendingRows) { paragraphs += columnTableXml(pendingRows); pendingRows = ""; } };
  const flushPartyRows = () => { if (pendingPartyRows) { paragraphs += partyColumnTableXml(pendingPartyRows); pendingPartyRows = ""; } };
  for (const l of lines) {
    const style = l.style ? resolveStyleId(l.style, templateStyles, byName) : null;
    if (style) usedStyles.add(style);
    if (isPartyColumnLine(l.text)) {
      flushRows();
      const [left, right] = l.text.split(PARTY_COL);
      pendingPartyRows += partyColumnRowXml(left, right ?? "");
      continue;
    }
    flushPartyRows();
    if (isColumnLine(l.text)) {
      const [left, right] = l.text.split(COL);
      pendingRows += columnRowXml(style, left, right ?? "");
      continue;
    }
    flushRows();
    if (l.text.startsWith(COVER)) {
      try {
        const spec = JSON.parse(l.text.slice(1)) as CoverSpec;
        paragraphs += coverXml(spec);
        setFooterDocumentName(zip, spec.title);
      } catch { /* malformed: skip */ }
      continue;
    }
    if (l.text.startsWith(EXEC)) {
      try {
        const spec = JSON.parse(l.text.slice(1)) as ExecutionSpec;
        const override = executionOverrides?.[spec.key];
        paragraphs += override
          ? replaceTextInRuns(override, EXECUTION_PARTY_TOKEN, escapeXml(spec.party))
          : executionXml(spec);
      } catch { /* malformed: skip */ }
      continue;
    }
    if (l.text === DEED_PAGE_BREAK) {
      paragraphs += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
      continue;
    }
    paragraphs += paragraphXml(style, l.text);
  }
  flushRows();
  flushPartyRows();
  patchNumberingTabs(zip, stylesXml, usedStyles);

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

// ---------------------------------------------------------------------------
// Execution blocks
//
// A signing block is a three-column table, not prose: the witness details run
// down the left, the signatory signs on the right, and a narrow spacer between
// them keeps the two apart so it reads clearly. Built here rather than as
// styled lines because the cells need their own runs -- the opening verb and
// the party's name are bold while the rest of the sentence is not, and a
// signature rule needs room to sign above it.
// ---------------------------------------------------------------------------

/** Marks a line as an execution block; the payload is the spec as JSON. */
const EXEC = String.fromCharCode(4);

const EXEC_FONT = "Arial";
const EXEC_SIZE = 20;          // half-points: 10pt
const EXEC_TOTAL = 9026;       // A4 less 1 inch margins, in twips
const EXEC_SPACER = 397;       // 0.7 cm
const EXEC_SIDE = Math.floor((EXEC_TOTAL - EXEC_SPACER) / 2);

export interface ExecutionSpec {
  /**
   * Which uploaded block, if any, replaces this one. Matches the keys
   * executionTemplateParse.ts stores an uploaded template's blocks under --
   * "individual_deed" | "individual_agreement" | "company_127_two_officers" |
   * "company_127_sole_director" | "company_126_authorised" -- so the two
   * stay in lockstep by construction rather than by convention.
   */
  key: string;
  /** "Executed by" or "Signed, sealed and delivered by" -- rendered bold. */
  opener: string;
  /** The signing party, rendered bold. */
  party: string;
  /** " in the presence of:" or the statutory words -- not bold. */
  tail: string;
  /** Left column: the witness's lines, or a second officer. */
  left: string[];
  /** Right column: the signatory's own lines. */
  right: string[];
}

export function deedExecution(spec: ExecutionSpec): string {
  return EXEC + JSON.stringify(spec);
}

function execRun(text: string, bold: boolean): string {
  return `<w:r><w:rPr><w:rFonts w:ascii="${EXEC_FONT}" w:hAnsi="${EXEC_FONT}"/>` +
    `${bold ? "<w:b/>" : ""}<w:sz w:val="${EXEC_SIZE}"/><w:szCs w:val="${EXEC_SIZE}"/></w:rPr>` +
    `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function execPara(runs: string): string {
  return `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${runs}</w:p>`;
}

/**
 * A signature rule: three empty lines to sign in, then the underscored line,
 * then its caption. The space above the rule is what makes a signing page
 * usable -- a rule with nothing above it cannot actually be signed.
 */
function signatureCell(caption: string): string {
  return (
    execPara("") + execPara("") + execPara("") +
    execPara(execRun("______________________________", false)) +
    execPara(execRun(caption, false))
  );
}

function execCell(width: number, content: string): string {
  return `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${width}"/>` +
    `<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>` +
    `</w:tcPr>${content || execPara("")}</w:tc>`;
}

function executionXml(spec: ExecutionSpec): string {
  // The opener is a row of the table rather than a paragraph above it, sitting
  // in column 1 with the other two blank. Outside the table it drifts out of
  // alignment with the block it introduces, and the block can break away from
  // it across a page.
  const openerRow =
    `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
    execCell(EXEC_SIDE, execPara(
      execRun(spec.opener + " ", true) + execRun(spec.party, true) + execRun(spec.tail, false)
    )) +
    execCell(EXEC_SPACER, "") +
    execCell(EXEC_SIDE, "") +
    `</w:tr>`;
  // cantSplit keeps a signing block whole: half a signature page at the foot
  // of one page and half at the head of the next is not signable.
  const row = `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
    execCell(EXEC_SIDE, spec.left.map(signatureCell).join("")) +
    execCell(EXEC_SPACER, "") +
    execCell(EXEC_SIDE, spec.right.map(signatureCell).join("")) +
    `</w:tr>`;
  return `<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="${EXEC_TOTAL}"/>` +
    // Fixed layout, or the renderer redistributes the columns to fit their
    // contents and the 0.7 cm spacer comes out far wider than asked for.
    `<w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>` +
    `<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>` +
    `<w:tblGrid><w:gridCol w:w="${EXEC_SIDE}"/><w:gridCol w:w="${EXEC_SPACER}"/><w:gridCol w:w="${EXEC_SIDE}"/></w:tblGrid>` +
    openerRow + row + `</w:tbl>` + execPara("");
}


// ---------------------------------------------------------------------------
// Cover page
//
// A deed's cover carries the title and the parties and nothing else. Measured
// from a firm's own deed: the title sits about a third of the way down, left
// aligned at 16pt, with the parties beneath it at 10.5pt. Written as explicit
// runs rather than styles because a cover page is a fixed piece of typography
// -- it isn't part of the numbered scheme the body styles describe.
// ---------------------------------------------------------------------------

const COVER = String.fromCharCode(5);
const COVER_TITLE_SIZE = 32;   // half-points: 16pt
const COVER_PARTY_SIZE = 21;   // half-points: 10.5pt

// Twips (1 pt = 20 twips), used as explicit paragraph spacing rather than
// blank paragraphs. A blank paragraph with no run has no explicit font size,
// so its height falls back to whatever the template's default run properties
// happen to be -- unreliable, and why the gap above the title collapsed
// instead of pushing it down a third of the page. Explicit spacing doesn't
// depend on any font.
//
// TOP positions the title down the page; BOTTOM is the gap between the
// parties and the page break that follows, so the cover page has breathing
// room at its foot rather than running straight into the break.
const COVER_GAP_TOP = 2400;
const COVER_GAP_BOTTOM = 2400;
const COVER_TITLE_TO_PARTIES_GAP = 240;

export interface CoverSpec {
  title: string;
  /** One line per party, in the order they appear in the deed. */
  parties: string[];
}

export function deedCover(spec: CoverSpec): string {
  return COVER + JSON.stringify(spec);
}

function coverPara(text: string, size: number, spacing: { before?: number; after?: number } = {}): string {
  const run = text
    ? `<w:r><w:rPr><w:rFonts w:ascii="${EXEC_FONT}" w:hAnsi="${EXEC_FONT}"/>` +
      `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`
    : "";
  const spacingAttrs = `${spacing.before !== undefined ? ` w:before="${spacing.before}"` : ""} w:after="${spacing.after ?? 0}"`;
  return `<w:p><w:pPr><w:spacing${spacingAttrs}/></w:pPr>${run}</w:p>`;
}

function coverXml(spec: CoverSpec): string {
  let out = coverPara(spec.title, COVER_TITLE_SIZE, {
    before: COVER_GAP_TOP,
    after: COVER_TITLE_TO_PARTIES_GAP,
  });
  spec.parties.forEach((p, i) => {
    const isLast = i === spec.parties.length - 1;
    out += coverPara(p, COVER_PARTY_SIZE, isLast ? { after: COVER_GAP_BOTTOM } : {});
  });
  return out;
}

/**
 * Puts the deed's name in the footer.
 *
 * A firm's footer shows the document name through a field, so left alone
 * every deed carries whatever the template was called ("Deed Template").
 *
 * The name goes into the field's cached result, not into the document's Title
 * property. Setting Title looked like the tidier fix and was worse: a footer
 * can carry several overlapping fields -- COMMENTS, DOCPROPERTY "Title" and
 * TITLE all appear in one real template -- and populating Title makes every
 * one of them resolve, printing the deed's name three times. Replacing the
 * cached result of the field that is actually displaying something changes
 * exactly what is on the page.
 */
function setDocVariable(zip: PizZip, name: string, value: string): void {
  const file = zip.file("word/settings.xml");
  if (!file) return;
  const xml = file.asText();
  const varRe = new RegExp(`(<w:docVar w:name="${name}" w:val=")[^"]*(")`);
  let updated: string;
  if (varRe.test(xml)) {
    updated = xml.replace(varRe, (_m, a, b) => `${a}${escapeXml(value)}${b}`);
  } else if (/<w:docVars>/.test(xml)) {
    updated = xml.replace("<w:docVars>", `<w:docVars><w:docVar w:name="${name}" w:val="${escapeXml(value)}"/>`);
  } else {
    updated = xml.replace(/<w:settings[^>]*>/, m =>
      `${m}<w:docVars><w:docVar w:name="${name}" w:val="${escapeXml(value)}"/></w:docVars>`);
  }
  if (updated !== xml) zip.file("word/settings.xml", updated);
}

function setFooterDocumentName(zip: PizZip, title: string): void {
  // The cached result alone is not enough: Word and LibreOffice both
  // recompute a DOCVARIABLE from the variable itself, so the stale name comes
  // straight back. Set the variable AND the cached text -- the variable is
  // what recomputation reads, the cached text is what shows before it runs.
  setDocVariable(zip, "FileName", title);
  for (const name of Object.keys(zip.files)) {
    if (!/^word\/(footer|header)\d*\.xml$/.test(name)) continue;
    const file = zip.file(name);
    if (!file) continue;
    const xml = file.asText();
    // Only touch a field that has a cached result to replace; one with none
    // is not what is showing the stale name.
    const updated = xml.replace(
      /(<w:instrText[^>]*>[^<]*DOCVARIABLE[^<]*<\/w:instrText>[\s\S]*?<w:fldChar w:fldCharType="separate"\/>[\s\S]*?<w:t[^>]*>)([^<]*)(<\/w:t>)/,
      (_m, before, _old, after) => `${before}${escapeXml(title)}${after}`
    );
    if (updated !== xml) zip.file(name, updated);
  }
}
