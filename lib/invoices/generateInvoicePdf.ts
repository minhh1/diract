// Builds a compliant Australian tax invoice PDF from scratch with pdf-lib --
// the same library/primitives lib/pdfeditor/applyEdits.ts already uses
// (PDFDocument, embedPng, drawText/drawRectangle/drawLine), just building a
// new document instead of editing one. Sections follow ATO tax-invoice
// requirements (ABN, fees ex-GST + GST + total inc. GST, unique invoice
// number) plus Legal Profession Uniform Law practice (itemised dated time
// entries, a costs-assessment/itemised-bill rights notice) -- researched
// this session, see the plan file for sources.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { totalDiscount } from "./apportionment";

export interface InvoiceTemplateDisplay {
  showStaffInitials: boolean;
  showLineDescriptions: boolean;
  showRatePerLine: boolean;
  showHoursPerLine: boolean;
  showAmountAndGstPerLine: boolean;
  showFeeSubtotal: boolean;
  showDisbursementSubtotal: boolean;
  showPriorBalance: boolean;
  showDueDate: boolean;
  showPaymentSummary: boolean;
  showAccountSummary: boolean;
}

export const DEFAULT_INVOICE_DISPLAY: InvoiceTemplateDisplay = {
  showStaffInitials: true,
  showLineDescriptions: true,
  showRatePerLine: false,
  showHoursPerLine: true,
  showAmountAndGstPerLine: true,
  showFeeSubtotal: true,
  showDisbursementSubtotal: true,
  showPriorBalance: false,
  showDueDate: true,
  showPaymentSummary: true,
  showAccountSummary: false,
};

export interface InvoiceFeeLine {
  date: string | null;
  staffInitials: string | null;
  description: string | null;
  rate: number | null;
  hours: number | null;
  originalAmount: number;
  billedAmount: number;
  // GST portion of billedAmount -- see lib/invoices/apportionment.ts's
  // splitGst(). billedAmount itself is always the ex-GST figure (matches
  // what feeds fees_total/subtotal), so a GST Inclusive line's full charged
  // amount is billedAmount + gstAmount, not billedAmount alone.
  gstAmount: number;
}

export interface InvoiceDisbursementLine {
  date: string | null;
  description: string | null;
  amount: number;
  gstAmount: number;
}

export interface GenerateInvoicePdfInput {
  company: { name: string; abn: string | null; address: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
  creditTerms: string;
  otherTerms: string;
  bankDetails: { accountName?: string; bsb?: string; accountNumber?: string; reference?: string } | null;
  display: InvoiceTemplateDisplay;
  invoice: {
    invoiceNumber: string;
    issueDate: string | null;
    dueDate: string | null;
    matterName: string | null;
    debtorName: string | null;
    subtotal: number;
    gst: number;
    totalIncGst: number;
    trustApplied: number;
    payments: number;
    amountDue: number;
    priorBalance: number;
  };
  feeLines: InvoiceFeeLine[];
  disbursementLines: InvoiceDisbursementLine[];
}

const PAGE_W = 595.28, PAGE_H = 841.89; // A4, points
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;
const MIN_Y = 90; // leave room for the footer notice on every page

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

// Wraps `text` to fit `maxWidth`, breaking on word boundaries -- pdf-lib has
// no built-in text wrapping.
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

export async function generateInvoicePdf(input: GenerateInvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoImage = input.company.logoBytes
    ? await (input.company.logoIsPng ? pdfDoc.embedPng(input.company.logoBytes) : pdfDoc.embedJpg(input.company.logoBytes))
    : null;

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  }

  function ensureRoom(needed: number) {
    if (y - needed < MIN_Y) newPage();
  }

  function text(str: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' } = {}) {
    const font = opts.bold ? bold : regular;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    const drawX = opts.align === 'right' ? x - font.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: drawX, y, size, font, color });
  }

  function hr(color: [number, number, number] = [0.85, 0.85, 0.87]) {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: rgb(...color) });
  }

  // ── Letterhead ─────────────────────────────────────────────────────
  if (logoImage) {
    const maxW = 160, maxH = 60;
    const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height, 1);
    const w = logoImage.width * scale, h = logoImage.height * scale;
    page.drawImage(logoImage, { x: MARGIN, y: y - h, width: w, height: h });
  }
  text(input.company.name, PAGE_W - MARGIN, 16, { bold: true, align: 'right' });
  y -= 20;
  if (input.company.abn) { text(`ABN ${input.company.abn}`, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] }); y -= 13; }
  if (input.company.address) {
    for (const line of wrapText(input.company.address, regular, 10, 220)) {
      text(line, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] });
      y -= 13;
    }
  }
  y -= 20;

  // ── Title + invoice meta ─────────────────────────────────────────────
  text('TAX INVOICE', MARGIN, 20, { bold: true });
  y -= 26;
  text(`Invoice number: ${input.invoice.invoiceNumber}`, MARGIN, 11);
  text(`Issue date: ${formatDate(input.invoice.issueDate)}`, MARGIN + 260, 11);
  y -= 16;
  if (input.display.showDueDate && input.invoice.dueDate) {
    text(`Due date: ${formatDate(input.invoice.dueDate)}`, MARGIN + 260, 11);
  }
  if (input.invoice.matterName) text(`Matter: ${input.invoice.matterName}`, MARGIN, 11);
  y -= 24;

  // ── Bill to ───────────────────────────────────────────────────────
  text('BILL TO', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] });
  y -= 14;
  text(input.invoice.debtorName || '—', MARGIN, 12, { bold: true });
  y -= 26;
  hr();
  y -= 20;

  // ── Fee lines ─────────────────────────────────────────────────────
  if (input.feeLines.length) {
    text('PROFESSIONAL FEES', MARGIN, 10, { bold: true, color: [0.3, 0.3, 0.34] });
    y -= 18;
    ensureRoom(60);
    ({ page, y } = drawLineItemTable(pdfDoc, page, y, input, regular));
    if (input.display.showFeeSubtotal) {
      const feesTotal = input.feeLines.reduce((s, l) => s + l.billedAmount, 0);
      ensureRoom(20);
      text('Fees subtotal', PAGE_W - MARGIN - 100, 10, { align: 'right', bold: true });
      text(money(feesTotal), PAGE_W - MARGIN, 10, { align: 'right', bold: true });
      y -= 16;
    }
    const discount = totalDiscount(input.feeLines.map(l => ({ id: '', originalAmount: l.originalAmount, billedAmount: l.billedAmount })));
    if (Math.abs(discount) > 0.004) {
      ensureRoom(20);
      const label = discount > 0 ? 'Fee discount applied' : 'Fee markup applied';
      text(label, PAGE_W - MARGIN - 100, 10, { align: 'right', color: [0.5, 0.2, 0.2] });
      text((discount > 0 ? '-' : '+') + money(Math.abs(discount)), PAGE_W - MARGIN, 10, { align: 'right', color: [0.5, 0.2, 0.2] });
      y -= 16;
    }
    y -= 10;
  }

  // ── Disbursements ─────────────────────────────────────────────────
  if (input.disbursementLines.length) {
    ensureRoom(60);
    text('DISBURSEMENTS', MARGIN, 10, { bold: true, color: [0.3, 0.3, 0.34] });
    y -= 18;
    ({ page, y } = drawDisbursementTable(pdfDoc, page, y, input, regular));
    if (input.display.showDisbursementSubtotal) {
      const disbTotal = input.disbursementLines.reduce((s, l) => s + l.amount, 0);
      ensureRoom(20);
      text('Disbursements subtotal', PAGE_W - MARGIN - 100, 10, { align: 'right', bold: true });
      text(money(disbTotal), PAGE_W - MARGIN, 10, { align: 'right', bold: true });
      y -= 16;
    }
    y -= 10;
  }

  // ── Totals ────────────────────────────────────────────────────────
  ensureRoom(140);
  hr();
  y -= 20;
  const totalsX = PAGE_W - MARGIN - 160;
  function totalRow(label: string, value: number, opts: { bold?: boolean } = {}) {
    text(label, totalsX, 11, opts);
    text(money(value), PAGE_W - MARGIN, 11, { align: 'right', ...opts });
    y -= 16;
  }
  if (input.display.showPriorBalance && input.invoice.priorBalance) totalRow('Opening balance', input.invoice.priorBalance);
  totalRow('Subtotal (ex. GST)', input.invoice.subtotal);
  totalRow('GST', input.invoice.gst);
  totalRow('Total (inc. GST)', input.invoice.totalIncGst, { bold: true });
  if (input.display.showPaymentSummary) {
    y -= 4;
    if (input.invoice.trustApplied) totalRow('Trust funds applied', -input.invoice.trustApplied);
    if (input.invoice.payments) totalRow('Payments received', -input.invoice.payments);
    totalRow('Amount due', input.invoice.amountDue, { bold: true });
  }
  y -= 20;

  // ── Terms / footer ────────────────────────────────────────────────
  ensureRoom(120);
  hr();
  y -= 18;
  if (input.creditTerms) {
    for (const line of wrapText(input.creditTerms, regular, 9, CONTENT_W)) { text(line, MARGIN, 9, { color: [0.4, 0.4, 0.45] }); y -= 12; }
    y -= 6;
  }
  if (input.bankDetails && (input.bankDetails.accountName || input.bankDetails.bsb || input.bankDetails.accountNumber)) {
    const parts = [
      input.bankDetails.accountName && `Account name: ${input.bankDetails.accountName}`,
      input.bankDetails.bsb && `BSB: ${input.bankDetails.bsb}`,
      input.bankDetails.accountNumber && `Account: ${input.bankDetails.accountNumber}`,
      input.bankDetails.reference && `Reference: ${input.bankDetails.reference}`,
    ].filter(Boolean).join('   ·   ');
    text(parts as string, MARGIN, 9, { color: [0.4, 0.4, 0.45] });
    y -= 16;
  }
  if (input.otherTerms) {
    for (const line of wrapText(input.otherTerms, regular, 9, CONTENT_W)) { text(line, MARGIN, 9, { color: [0.4, 0.4, 0.45] }); y -= 12; }
    y -= 6;
  }
  // Compliance notice -- always shown, not a display toggle, since it's a
  // client-rights disclosure (Legal Profession Uniform Law), not a
  // preference. Harmless boilerplate for non-legal invoices too.
  ensureRoom(30);
  for (const line of wrapText(
    'You have the right to request an itemised bill and to have this bill assessed under applicable legal costs legislation. Any request must be made within the time limits set out in that legislation.',
    regular, 8, CONTENT_W
  )) { text(line, MARGIN, 8, { color: [0.6, 0.6, 0.64] }); y -= 11; }

  return pdfDoc.save();
}

// Truncates `str` to fit `maxWidth` at `size` using the real font's glyph
// widths (binary-search-free: shrinks one character at a time, which is
// fine at invoice line-item lengths) rather than an approximate average
// character width, so right-aligned columns stay genuinely aligned.
function truncate(str: string, maxWidth: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  let end = str.length;
  while (end > 1 && font.widthOfTextAtSize(str.slice(0, end) + '…', size) > maxWidth) end--;
  return str.slice(0, end) + '…';
}

// Lays out the right-aligned numeric columns (Rate, Hours, GST, Amount)
// right-to-left so each column's reserved width is derived once instead of
// hardcoded per-column offsets that silently collide whenever a column is
// added/widened (confirmed live: GST and Hours previously landed on the
// same x when both were shown). Returns each shown column's right-edge x
// (for `x - font.widthOfTextAtSize(str, size)` right-alignment) plus the
// total reserved width, so the description column knows how much room it
// has left.
function rightColumnLayout(display: InvoiceTemplateDisplay) {
  const AMOUNT_W = 70, GST_W = 60, HOURS_W = 50, RATE_W = 60;
  let edge = 0;
  const amountX = PAGE_W - MARGIN - edge; edge += AMOUNT_W;
  const gstX = display.showAmountAndGstPerLine ? PAGE_W - MARGIN - edge : null;
  if (display.showAmountAndGstPerLine) edge += GST_W;
  const hoursX = display.showHoursPerLine ? PAGE_W - MARGIN - edge : null;
  if (display.showHoursPerLine) edge += HOURS_W;
  const rateX = display.showRatePerLine ? PAGE_W - MARGIN - edge : null;
  if (display.showRatePerLine) edge += RATE_W;
  return { amountX, gstX, hoursX, rateX, totalWidth: edge };
}

function drawLineItemTable(
  pdfDoc: PDFDocument, startPage: PDFPage, startY: number, input: GenerateInvoicePdfInput, font: PDFFont
): { page: PDFPage; y: number } {
  let page = startPage, y = startY;
  const size = 9;
  const cols = rightColumnLayout(input.display);

  for (const line of input.feeLines) {
    let x = MARGIN;
    page.drawText(formatDate(line.date), { x, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    x += 62;
    if (input.display.showStaffInitials && line.staffInitials) {
      page.drawText(line.staffInitials, { x, y, size, font, color: rgb(0.15, 0.15, 0.18) });
      x += 34;
    }
    if (input.display.showLineDescriptions && line.description) {
      const descMaxWidth = PAGE_W - MARGIN - x - cols.totalWidth - 8;
      page.drawText(truncate(line.description, descMaxWidth, font, size), { x, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showRatePerLine && line.rate != null && cols.rateX != null) {
      const str = money(line.rate);
      page.drawText(str, { x: cols.rateX - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showHoursPerLine && line.hours != null && cols.hoursX != null) {
      const str = line.hours.toFixed(2);
      page.drawText(str, { x: cols.hoursX - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showAmountAndGstPerLine && cols.gstX != null) {
      const gstStr = money(line.gstAmount);
      page.drawText(gstStr, { x: cols.gstX - font.widthOfTextAtSize(gstStr, size), y, size, font, color: rgb(0.5, 0.5, 0.55) });
      const str = money(line.billedAmount);
      page.drawText(str, { x: cols.amountX - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    y -= 14;
    if (y < MIN_Y) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  }
  return { page, y: y - 4 };
}

function drawDisbursementTable(
  pdfDoc: PDFDocument, startPage: PDFPage, startY: number, input: GenerateInvoicePdfInput, font: PDFFont
): { page: PDFPage; y: number } {
  let page = startPage, y = startY;
  const size = 9;
  const cols = rightColumnLayout(input.display);
  // Disbursements only ever show Amount(+GST) -- unlike drawLineItemTable,
  // never Rate/Hours -- so the description column's reserved width is just
  // those two, not cols.totalWidth (which also budgets for Rate/Hours on
  // the fee table above).
  const disbRightWidth = input.display.showAmountAndGstPerLine ? 130 : 70;
  for (const line of input.disbursementLines) {
    page.drawText(formatDate(line.date), { x: MARGIN, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    if (line.description) {
      const descMaxWidth = PAGE_W - MARGIN * 2 - 62 - disbRightWidth;
      page.drawText(truncate(line.description, descMaxWidth, font, size), { x: MARGIN + 62, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showAmountAndGstPerLine && cols.gstX != null) {
      const gstStr = money(line.gstAmount);
      page.drawText(gstStr, { x: cols.gstX - font.widthOfTextAtSize(gstStr, size), y, size, font, color: rgb(0.5, 0.5, 0.55) });
    }
    const str = money(line.amount);
    page.drawText(str, { x: cols.amountX - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    y -= 14;
    if (y < MIN_Y) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  }
  return { page, y: y - 4 };
}
