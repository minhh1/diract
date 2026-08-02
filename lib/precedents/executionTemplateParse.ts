// lib/precedents/executionTemplateParse.ts
// Reads an uploaded execution page as OOXML, not as text.
//
// The first version of this reduced the file to plain paragraph text, which
// is enough to find and classify a block but throws away everything that
// makes it the firm's own: bold and italic runs, the table a two-officer
// block signs in, the narrow spacer column between witness and signatory,
// blank rows used for spacing, and the signature rule itself. Uploading a
// template and getting our own layout back regardless defeats the point of
// uploading one.
//
// A real execution page is checked against the file that motivated this --
// each signing block turned out to be one <w:tbl>, opener row and signature
// rows together, with blank paragraphs between blocks for spacing. This
// walks the document body as its own paragraphs and tables (not a flat
// regex over the whole file, which cannot tell a paragraph inside a table
// cell from one that is not), groups them into blocks at each opening verb,
// and keeps every recognised block as the OOXML it already is -- untouched
// except for the party's name, replaced with a token so the same block can
// be reused for any party of that kind (see EXECUTION_PARTY_TOKEN in
// deedDocx.ts), and orphan control added if the source didn't already have
// it.
import PizZip from "pizzip";
import { executionBlockKey } from "@/lib/precedents/executionClauses";
import { replaceTextInRuns, EXECUTION_PARTY_TOKEN } from "@/lib/precedents/deedDocx";

interface BodyNode {
  kind: "p" | "tbl";
  xml: string;
}

/**
 * One paragraph, or one row of a table -- the unit blocks are actually
 * grouped at. A whole `<w:tbl>` is not atomic: the file this was built
 * against signs two different people in one physical table, as two separate
 * four-row groups rather than two tables, which is a natural way to lay out
 * a multi-party execution page in Word. Treating the table as one block
 * merged both signers into a single block that opened with the first and
 * trailed off with the second's opening line and nothing after it.
 *
 * A row atom carries `wrapper` -- the source table's own opening (everything
 * before its first `<w:tr>`, i.e. `<w:tbl><w:tblPr>...<w:tblGrid>...`) and
 * `</w:tbl>`. Rewrapping a chosen run of rows in their own wrapper is what
 * keeps the firm's own column widths and spacer: nothing here invents a
 * table shape, it only re-closes a subset of the rows the firm already laid
 * out.
 */
interface Atom {
  text: string;
  xml: string;
  wrapper?: { open: string; close: string };
}

/**
 * Splits body content into its top-level paragraphs and tables, in order.
 * Depth-tracked so a `<w:tbl>` nested inside a table cell (rare, but legal)
 * doesn't end the outer one early, and a `<w:p>` inside a table cell is never
 * mistaken for a top-level paragraph -- both would otherwise split a block in
 * the wrong place.
 */
function topLevelBodyNodes(body: string): BodyNode[] {
  const TOKEN = /<w:tbl\b[^>]*>|<\/w:tbl>|<w:p\b[^>]*>|<\/w:p>/g;
  const nodes: BodyNode[] = [];
  let tblDepth = 0;
  let tblStart = -1;
  let pStart = -1;
  let inP = false;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(body))) {
    const tok = m[0];
    if (tok.startsWith("<w:tbl")) {
      if (tblDepth === 0) tblStart = m.index;
      tblDepth++;
    } else if (tok === "</w:tbl>") {
      tblDepth--;
      if (tblDepth === 0) nodes.push({ kind: "tbl", xml: body.slice(tblStart, m.index + tok.length) });
    } else if (tblDepth === 0 && tok.startsWith("<w:p")) {
      pStart = m.index;
      inP = true;
    } else if (tblDepth === 0 && tok === "</w:p>" && inP) {
      nodes.push({ kind: "p", xml: body.slice(pStart, m.index + tok.length) });
      inP = false;
    }
  }
  return nodes;
}

/** Tag-stripped, entity-decoded text of an OOXML fragment. */
function xmlTextOf(fragment: string): string {
  return fragment
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

const OPENER_RE = /(?:executed by|signed,?\s+sealed\s+and\s+delivered\s+by)\b/i;
const PARTY_NAME_RE =
  /^\s*(?:executed by|signed,?\s+sealed\s+and\s+delivered\s+by)\s+(.+?)\s+(?:in the presence of|in accordance with)/i;

/**
 * Flattens the body into atoms: a standalone paragraph is one atom, and a
 * table becomes one atom per row, each carrying the table it came from so a
 * chosen run of rows can be rewrapped into a standalone table later.
 */
function bodyAtoms(body: string): Atom[] {
  const atoms: Atom[] = [];
  const ROW = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
  for (const node of topLevelBodyNodes(body)) {
    if (node.kind === "p") {
      atoms.push({ text: xmlTextOf(node.xml), xml: node.xml });
      continue;
    }
    const firstRow = node.xml.search(/<w:tr\b/);
    const wrapper = {
      open: firstRow >= 0 ? node.xml.slice(0, firstRow) : node.xml,
      close: "</w:tbl>",
    };
    let rm: RegExpExecArray | null;
    while ((rm = ROW.exec(node.xml))) atoms.push({ text: xmlTextOf(rm[0]), xml: rm[0], wrapper });
  }
  return atoms;
}

interface RawBlock {
  xml: string;
  text: string;
}

/**
 * Builds one block's XML from its atoms. A run of consecutive row atoms that
 * came from the same source table is rewrapped in that table's own opening
 * and closing tags, so the result is a standalone, valid table with the
 * firm's own columns and spacer width; a paragraph atom is used as-is.
 */
function assembleBlock(atoms: Atom[]): RawBlock {
  const pieces: { text: string; xml: string }[] = [];
  let i = 0;
  while (i < atoms.length) {
    const a = atoms[i];
    if (!a.wrapper) {
      pieces.push({ text: a.text, xml: a.xml });
      i++;
      continue;
    }
    const wrapper = a.wrapper;
    let rows = "";
    let text = "";
    while (i < atoms.length && atoms[i].wrapper === wrapper) {
      rows += atoms[i].xml;
      text += (text ? " " : "") + atoms[i].text;
      i++;
    }
    pieces.push({ text, xml: `${wrapper.open}${rows}${wrapper.close}` });
  }
  return {
    xml: pieces.map(p => p.xml).join(""),
    text: pieces.map(p => p.text).join(" ").trim(),
  };
}

/**
 * Groups atoms into blocks. An atom starts a new block when its own text
 * contains an opening verb -- true whether that verb sits in a standalone
 * paragraph above a table, in the first row of a table of its own, or in a
 * row partway through a table shared with other signatories -- and every
 * following atom belongs to that block until the next one starts.
 */
function groupIntoBlocks(atoms: Atom[]): RawBlock[] {
  const blocks: RawBlock[] = [];
  let current: Atom[] | null = null;
  for (const atom of atoms) {
    if (OPENER_RE.test(atom.text)) {
      if (current) blocks.push(assembleBlock(current));
      current = [atom];
    } else if (current) {
      current.push(atom);
    }
  }
  if (current) blocks.push(assembleBlock(current));
  return blocks;
}

function partyNameIn(text: string): string | null {
  return PARTY_NAME_RE.exec(text)?.[1]?.trim() ?? null;
}

/** Adds w:cantSplit to every row of a table that doesn't already have it. */
function ensureTableCantSplit(tblXml: string): string {
  return tblXml.replace(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g, row => {
    if (/<w:cantSplit\b/.test(row)) return row;
    if (/<w:trPr>/.test(row)) return row.replace("<w:trPr>", "<w:trPr><w:cantSplit/>");
    return row.replace(/^(<w:tr\b[^>]*>)/, "$1<w:trPr><w:cantSplit/></w:trPr>");
  });
}

/** Adds w:keepNext/w:keepLines to a standalone paragraph that doesn't have them. */
function ensureParagraphKeepTogether(p: string): string {
  if (/<w:keepNext\b/.test(p)) return p;
  const additions = "<w:keepNext/><w:keepLines/>";
  if (/<w:pPr>/.test(p)) return p.replace("<w:pPr>", `<w:pPr>${additions}`);
  return p.replace(/^(<w:p\b[^>]*>)/, `$1<w:pPr>${additions}</w:pPr>`);
}

/**
 * Keeps a block off a page split. A table's rows get cantSplit -- a row
 * cannot itself straddle a page -- and any paragraph outside a table (an
 * opener sitting above the table it introduces, say) gets keepNext/keepLines
 * so it stays with what follows it. This does not force an arbitrarily large
 * block onto one page; nothing in OOXML does. It stops the block breaking
 * inside a row or between an opener and its table, which is the achievable
 * form of "don't split a signing block".
 */
function applyOrphanControl(xml: string): string {
  return xml.replace(
    /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g,
    piece => (piece.startsWith("<w:tbl") ? ensureTableCantSplit(piece) : ensureParagraphKeepTogether(piece))
  );
}

export interface ExecutionTemplateParseResult {
  /** key (see ExecutionSpec.key) -> the block's OOXML, ready to splice into a deed. */
  blocks: Record<string, string>;
  /** Blocks found but not matched to a known party kind -- reported, not guessed at. */
  unrecognised: number;
}

/**
 * Reads every signing block out of an uploaded execution page.
 *
 * A block that recognises to a known party kind is kept as its own OOXML
 * with the party's name swapped for EXECUTION_PARTY_TOKEN and orphan control
 * added; everything else about it -- its table, columns, spacer width, bold
 * and italic runs, blank rows, whatever it uses for a signature line -- is
 * untouched. A block that doesn't recognise is counted, not stored: putting
 * the wrong statutory words under a party's name is worse than falling back
 * to the built-in block.
 */
export function extractExecutionBlocks(bytes: Buffer): ExecutionTemplateParseResult {
  const documentXml = new PizZip(bytes).file("word/document.xml")?.asText() ?? "";
  const bodyStart = documentXml.indexOf("<w:body>");
  const bodyEnd = documentXml.lastIndexOf("</w:body>");
  const body = bodyStart >= 0 && bodyEnd >= 0 ? documentXml.slice(bodyStart, bodyEnd) : documentXml;

  const blocks: Record<string, string> = {};
  let unrecognised = 0;
  for (const raw of groupIntoBlocks(bodyAtoms(body))) {
    const key = executionBlockKey(raw.text);
    if (!key) { unrecognised++; continue; }
    const name = partyNameIn(raw.text);
    const parameterised = name ? replaceTextInRuns(raw.xml, name, EXECUTION_PARTY_TOKEN) : raw.xml;
    blocks[key] = applyOrphanControl(parameterised);
  }
  return { blocks, unrecognised };
}
