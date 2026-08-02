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

// half-points: 20 = 10pt body, 24 = 12pt heading.
const BODY_SIZE = 20;
const HEADING_SIZE = 24;
const FONT = "Arial";

/**
 * The field labels the approved forms use. Only a line whose label is in this
 * set becomes a table row.
 *
 * An allow-list rather than a "Word: value" pattern on purpose: prose in these
 * documents is full of colons ("Note: the deponent must sign each page",
 * "You can respond in one of the following ways:") and a pattern match turns
 * those into table rows, wrecking the layout. The labels are finite and come
 * from the forms, so listing them is both safer and self-documenting.
 */
const FORM_LABELS = new Set([
  // Court details
  "court", "division", "list", "registry", "case number",
  // Title of proceedings
  "first plaintiff", "first defendant", "second plaintiff", "second defendant",
  "plaintiff", "defendant", "applicant", "respondent", "appellant",
  "first applicant", "first respondent",
  // Filing / preparation details
  "filed for", "filed in relation to", "prepared for",
  "legal representative", "legal representative reference",
  "contact name and telephone", "contact email", "address for service",
  // Relief / liquidated claim
  "amount of claim", "interest", "filing fees", "service fees",
  "solicitors fees", "total",
  // Signature blocks
  "signature", "capacity", "date of signature",
  "signature of deponent", "signature of witness",
  // Deponent / affidavit
  "name", "address", "occupation", "date",
  "name of witness", "address of witness", "capacity of witness",
  // Registry address
  "street address", "postal address", "telephone",
  // Subpoena / notices
  "to", "last day for service", "date time and place for production",
  "person affected by orders sought", "order for discovery", "made on",
]);

/**
 * The forms' own structural section headings, which are shaded full-width
 * rows. An all-caps line that isn't one of these is a heading the pleading
 * itself introduces -- THE PARTIES, THE AGREEMENT, BREACH, PARTICULARS --
 * and in the approved forms those sit inside PLEADINGS AND PARTICULARS as
 * plain bold text, not as boxed sections. Shading them too was what made the
 * first attempt look unlike the form.
 */
const FORM_SECTIONS = new Set([
  "court details", "title of proceedings", "filing details", "preparation details",
  "type of claim", "relief claimed", "pleadings and particulars",
  "hearing details", "signature", "signature of legal representative",
  "notice to defendant", "notice to cross-defendant", "how to respond",
  "registry address", "affidavit verifying", "affidavit", "party details",
  "interpreter's affidavit",
  // Motions
  "person affected by orders sought", "orders sought",
  "notice to person affected by orders sought",
  // Appearance
  "appearance", "address for service",
  // Defence
  "defence", "affirmative defence",
  // Discovery
  "order for discovery", "solicitor's certificate", "schedule",
  "part 1 - documents in the party's possession that it does not object to producing",
  "part 2 - documents in the party's possession that it objects to producing",
  "part 3 - documents no longer in the party's possession",
  "notice to produce",
  // Subpoena
  "order to the subpoena recipient", "proposed access order",
  "notice to the subpoena recipient", "date, time and place for production",
  "issued by the court",
]);

type Block =
  | { kind: "section"; text: string }
  | { kind: "heading"; text: string }
  | { kind: "kv"; label: string; value: string }
  | { kind: "para"; text: string };

/**
 * A standalone all-caps line is a section heading ("COURT DETAILS"). A
 * trailing colon means it introduces a value on the same line, so it isn't
 * one. Same rule the browser preview uses, so the two agree.
 */
export function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 60 || t.endsWith(":")) return false;
  return /[A-Z]/.test(t) && t === t.toUpperCase();
}

/** "Registry: Sydney" -> a table row, but only for a known form label. */
function asKeyValue(line: string): { label: string; value: string } | null {
  const m = line.match(/^([^:]{1,60}):[ \t]*(.*)$/);
  if (!m) return null;
  const label = m[1].trim();
  // '#' marks an optional line on the forms; keep it in the label but ignore
  // it when matching.
  const normalised = label.replace(/^#/, "").trim().toLowerCase();
  if (!FORM_LABELS.has(normalised)) return null;
  return { label, value: m[2].trim() };
}

function classify(body: string): Block[] {
  const out: Block[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line) { out.push({ kind: "para", text: "" }); continue; }
    if (isHeadingLine(line)) {
      const isSection = FORM_SECTIONS.has(line.replace(/^#/, "").trim().toLowerCase());
      out.push({ kind: isSection ? "section" : "heading", text: line });
      continue;
    }
    const kv = asKeyValue(line);
    if (kv) { out.push({ kind: "kv", ...kv }); continue; }
    out.push({ kind: "para", text: line });
  }
  return out;
}

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
