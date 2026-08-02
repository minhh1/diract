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

// half-points: 20 = 10pt body, 24 = 12pt heading.
const BODY_SIZE = 20;
const HEADING_SIZE = 24;
const FONT = "Arial";

function run(text: string, bold = false, size = BODY_SIZE) {
  return new TextRun({ text, bold, size, font: FONT });
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
      width: { size: width, type: WidthType.PERCENTAGE },
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      borders: { top: NO_BORDER, bottom: HAIRLINE, left: NO_BORDER, right: NO_BORDER },
      children,
    });
  return new TableRow({
    children: [
      cell([new Paragraph({ children: [run(label)] })], 34),
      cell([new Paragraph({ children: [run(value)] })], 66),
    ],
  });
}

function buildTable(rows: TableRow[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
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
