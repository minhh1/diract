// lib/precedents/courtFormDocx.ts
// Renders a court document as a .docx laid out the way the approved forms
// actually are.
//
// The UCPR forms are not flat prose. Form 3A is 13 tables: every section
// heading ("COURT DETAILS", "RELIEF CLAIMED") is a full-width single-cell
// row, and every field under it is a two-column row with the form's label in
// the left cell and the value in the right. Rendering those as "Court: [x]"
// paragraphs produces a document that reads correctly but does not look like
// the approved form, which is the thing a registry checks.
//
// So: headings and label/value lines become a real Word table, and everything
// else -- the pleadings, the notices, the numbered relief -- stays as
// paragraphs, which is what the form does too.
//
// Shared by every non-letterhead precedent (uses_letterhead = false), so
// fixing the layout here fixes the whole court set rather than one document.
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType, AlignmentType,
} from "docx";
import { classify } from "@/lib/precedents/courtFormLayout";
import { stripXmlIllegal, parseDeedBody } from "@/lib/precedents/deedDocx";

// half-points: 20 = 10pt body, 24 = 12pt heading.
const BODY_SIZE = 20;
const HEADING_SIZE = 24;
const FONT = "Arial";

// Twips. A4 portrait less 1" margins is about 9026 twips of text width.
// Column widths must be given explicitly and in DXA: with percentage widths
// the library emits <w:gridCol w:w="100"/>, i.e. columns 100 twips wide, and
// Word will not open the file.
const LABEL_WIDTH = 3070;
const VALUE_WIDTH = 5956;
const TABLE_WIDTH = LABEL_WIDTH + VALUE_WIDTH;

function run(text: string, bold = false, size = BODY_SIZE) {
  // Guard against characters XML forbids reaching the document -- see
  // stripXmlIllegal. A single one makes the whole file unreadable in Word.
  return new TextRun({ text: stripXmlIllegal(text), bold, size, font: FONT });
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const HAIRLINE = { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" };

/** Full-width shaded row -- how the forms present a section heading. */
function headingRow(text: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        shading: { type: ShadingType.CLEAR, fill: "D9D9D9" },
        margins: { top: 60, bottom: 60, left: 100, right: 100 },
        borders: { top: HAIRLINE, bottom: HAIRLINE, left: HAIRLINE, right: HAIRLINE },
        children: [new Paragraph({ children: [run(text, true, HEADING_SIZE)] })],
      }),
    ],
  });
}

/** Label in the left column, value in the right -- the forms' field layout. */
function kvRow(label: string, value: string): TableRow {
  const cell = (children: Paragraph[], width: number) =>
    new TableCell({
      width: { size: width, type: WidthType.DXA },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      borders: { top: NO_BORDER, bottom: HAIRLINE, left: NO_BORDER, right: NO_BORDER },
      children,
    });
  return new TableRow({
    children: [
      cell([new Paragraph({ children: [run(label)] })], LABEL_WIDTH),
      cell([new Paragraph({ children: [run(value)] })], VALUE_WIDTH),
    ],
  });
}

function buildTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [LABEL_WIDTH, VALUE_WIDTH],
    rows,
  });
}

/**
 * Builds the document. Consecutive heading and label/value blocks collapse
 * into one table -- Form 3A runs COURT DETAILS, TITLE OF PROCEEDINGS and
 * FILING DETAILS together in a single table, and blank lines between those
 * sections shouldn't split it.
 */
export async function buildCourtFormDocx(body: string): Promise<Buffer> {
  // A deed carries paragraph-style markers meant for the firm's own deed
  // template. Without one uploaded we still have to produce a readable
  // document, so the markers drive bold/heading here instead of being dropped
  // -- and they must not survive into the XML either way (see stripXmlIllegal).
  if (hasStyleMarkers(body)) return buildFromDeedStyles(body);

  const blocks = classify(body);
  const children: (Paragraph | Table)[] = [];

  let pending: TableRow[] = [];
  const flush = () => {
    if (pending.length) { children.push(buildTable(pending)); pending = []; }
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    if (b.kind === "section") { pending.push(headingRow(b.text)); continue; }
    if (b.kind === "kv") { pending.push(kvRow(b.label, b.value)); continue; }

    // A heading the pleading introduces: bold text in the flow, as the forms
    // present them inside PLEADINGS AND PARTICULARS.
    if (b.kind === "heading") {
      flush();
      children.push(new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [run(b.text, true)],
      }));
      continue;
    }

    // A blank line between a section heading and its own fields is spacing
    // inside one block; a blank line before the NEXT section heading ends the
    // block, so each section renders as its own table the way the forms lay
    // them out. Without this, PLEADINGS AND PARTICULARS lands as the last row
    // of the preceding table of money figures.
    if (!b.text) {
      const next = blocks.slice(i + 1).find(x => x.kind !== "para" || x.text);
      if (pending.length && next && next.kind === "kv") continue;
      flush();
      children.push(new Paragraph({ spacing: { after: 120 }, children: [] }));
      continue;
    }

    flush();
    children.push(new Paragraph({
      spacing: { after: 120 },
      alignment: AlignmentType.LEFT,
      children: [run(b.text)],
    }));
  }
  flush();

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}


/** Deed style ids that should render as a heading when there is no template. */
const DEED_HEADING_STYLES = new Set(["HLHeading"]);
const DEED_BOLD_STYLES = new Set([
  "HLList-Level1-Bold", "HLList-Level2-Bold",
  "HLListLevel2-NonumberingandBold", "HLList-Level1-Bold-Nonumbering-Nounderline",
]);

function hasStyleMarkers(body: string): boolean {
  return parseDeedBody(body).some(l => l.style);
}

/**
 * Fallback rendering for a deed when the firm has not uploaded a deed
 * template. The template is what supplies numbering and indentation, so
 * without one the best that can be done is honour the emphasis the styles
 * imply and keep the text readable -- which is far better than emitting the
 * marker names as visible text, and better than a file Word refuses to open.
 */
async function buildFromDeedStyles(body: string): Promise<Buffer> {
  const children = parseDeedBody(body).map(line => {
    if (!line.text.trim()) return new Paragraph({ spacing: { after: 120 }, children: [] });
    const heading = !!line.style && DEED_HEADING_STYLES.has(line.style);
    const bold = heading || (!!line.style && DEED_BOLD_STYLES.has(line.style));
    return new Paragraph({
      spacing: heading ? { before: 240, after: 120 } : { after: 120 },
      children: [run(line.text, bold, heading ? HEADING_SIZE : BODY_SIZE)],
    });
  });
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE } } } },
    sections: [{ children }],
  });
  return Packer.toBuffer(doc);
}
