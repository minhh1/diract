// lib/invoices/generateGenericInvoicePdf.ts
// A plain, generic invoice-style PDF for the document_export widget's
// 'invoice' style (see lib/dashboardWidgets/types.ts's DocumentExportWidget)
// -- deliberately NOT a reuse of generateInvoicePdf.ts/generateDetailedInvoicePdf.ts,
// which are tightly coupled to the Law-Firm invoice's fixed field/relation
// contract (matter/debtor relations, a separate invoice_line_items table,
// configurable multi-page fee/disbursement tables). This renders whatever a
// company_table_fields record maps onto: one line item per record (v1 --
// no header/detail child-table split), a totals block, done. Same pdf-lib
// primitives as the Law-Firm renderer (PDFDocument/drawText/drawRectangle/
// drawLine, StandardFonts) since those are the right tool for tabular
// financial layout, just none of that file's configurability.
import { PDFDocument, PDFFont, StandardFonts, rgb } from "pdf-lib";
import { taxLabelForScheme } from "./taxSchemes";

export interface GenericInvoiceLineItem {
  description: string;
  amount: number;
}

export interface GenericInvoiceInput {
  companyName: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  customerName: string | null;
  customerAddress: string | null;
  lineItems: GenericInvoiceLineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  taxScheme?: string | null;
  paymentDetails?: string | null;
}

const PAGE_W = 595.28, PAGE_H = 841.89; // A4, points
const MARGIN = 50;

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function truncate(text: string, maxWidth: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let result = text;
  while (result.length > 1 && font.widthOfTextAtSize(result + "…", size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return result + "…";
}

export async function generateGenericInvoicePdf(input: GenericInvoiceInput): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const dark = rgb(0.15, 0.15, 0.18);
  const gray = rgb(0.5, 0.5, 0.55);

  const text = (str: string, x: number, size: number, font: PDFFont, color = dark, atY?: number) => {
    page.drawText(str, { x, y: atY ?? y, size, font, color });
  };
  const rightText = (str: string, rightEdge: number, size: number, font: PDFFont, color = dark, atY?: number) => {
    const width = font.widthOfTextAtSize(str, size);
    page.drawText(str, { x: rightEdge - width, y: atY ?? y, size, font, color });
  };
  const hr = (atY: number) => {
    page.drawLine({ start: { x: MARGIN, y: atY }, end: { x: PAGE_W - MARGIN, y: atY }, thickness: 0.75, color: rgb(0.85, 0.85, 0.87) });
  };
  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // Header -- company name left, "INVOICE" title right.
  text(input.companyName || "Invoice", MARGIN, 16, bold);
  rightText("INVOICE", PAGE_W - MARGIN, 20, bold);
  y -= 30;

  // Meta block, right-aligned under the title.
  const metaLines: string[] = [];
  if (input.invoiceNumber) metaLines.push(`Invoice #: ${input.invoiceNumber}`);
  if (input.invoiceDate) metaLines.push(`Date: ${input.invoiceDate}`);
  if (input.dueDate) metaLines.push(`Due: ${input.dueDate}`);
  for (const line of metaLines) { rightText(line, PAGE_W - MARGIN, 10, regular, gray); y -= 14; }
  y -= 10;

  // Bill-to block.
  if (input.customerName || input.customerAddress) {
    text("BILL TO", MARGIN, 9, bold, gray);
    y -= 14;
    if (input.customerName) { text(input.customerName, MARGIN, 12, bold); y -= 16; }
    if (input.customerAddress) {
      for (const line of input.customerAddress.split("\n")) { text(line, MARGIN, 10, regular, gray); y -= 13; }
    }
    y -= 16;
  }

  hr(y);
  y -= 20;

  // Line items table.
  const descColRight = PAGE_W - MARGIN - 90;
  text("DESCRIPTION", MARGIN, 9, bold, gray);
  rightText("AMOUNT", PAGE_W - MARGIN, 9, bold, gray);
  y -= 6;
  hr(y);
  y -= 16;

  for (const item of input.lineItems) {
    ensureSpace(20);
    text(truncate(item.description || "", descColRight - MARGIN, regular, 10), MARGIN, 10, regular);
    rightText(money(item.amount), PAGE_W - MARGIN, 10, regular);
    y -= 18;
  }
  if (!input.lineItems.length) {
    text("No line items", MARGIN, 10, regular, gray);
    y -= 18;
  }

  y -= 6;
  hr(y);
  y -= 20;

  // Totals block -- two right-aligned columns (labels ending at
  // totalsLabelRight, values ending at the same PAGE_W - MARGIN edge every
  // line-item amount above uses) so every number in the document, line
  // items and totals alike, sits flush on one shared right edge. A light
  // background box groups the block visually as its own mini-table.
  const totalsValueRight = PAGE_W - MARGIN;
  const totalsLabelRight = totalsValueRight - 90;
  const totalsBoxLeft = totalsLabelRight - 70;
  const totalsRowH = 17;
  const totalsRows: { label: string; value: string; bold?: boolean; ruleAbove?: boolean }[] = [];
  if (input.subtotal != null) totalsRows.push({ label: "Subtotal", value: money(input.subtotal) });
  if (input.tax != null) totalsRows.push({ label: taxLabelForScheme(input.taxScheme), value: money(input.tax) });
  if (input.total != null) totalsRows.push({ label: "Total", value: money(input.total), bold: true, ruleAbove: totalsRows.length > 0 });

  if (totalsRows.length) {
    ensureSpace(totalsRows.length * totalsRowH + 26);
    const boxHeight = totalsRows.length * totalsRowH + 12;
    page.drawRectangle({ x: totalsBoxLeft, y: y - boxHeight + 6, width: totalsValueRight - totalsBoxLeft, height: boxHeight, color: rgb(0.97, 0.97, 0.98) });
    y -= 8;
    for (const row of totalsRows) {
      if (row.ruleAbove) {
        page.drawLine({ start: { x: totalsBoxLeft + 10, y: y + 12 }, end: { x: totalsValueRight - 10, y: y + 12 }, thickness: 0.75, color: rgb(0.8, 0.8, 0.83) });
      }
      const size = row.bold ? 12 : 10;
      const font = row.bold ? bold : regular;
      rightText(row.label, totalsLabelRight, size, font, row.bold ? dark : gray);
      rightText(row.value, totalsValueRight, size, font, dark);
      y -= totalsRowH;
    }
    y -= 14;
  }

  // Payment details -- static text set once in the widget's own settings
  // (not sourced from the record), printed below the totals so it's the
  // last thing on the page, matching where this appears on most invoices.
  if (input.paymentDetails) {
    ensureSpace(40);
    text("PAYMENT DETAILS", MARGIN, 9, bold, gray);
    y -= 14;
    for (const line of input.paymentDetails.split("\n")) {
      ensureSpace(14);
      text(line, MARGIN, 10, regular);
      y -= 14;
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
