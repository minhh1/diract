// Builds the signed-off Bank Reconciliation PDF -- a summary page (opening
// cash book balance through to reconciliation balance, matching the
// Trust Account page's own live calculation), a Reconciled Receipts table, a
// Reconciled Payments table, and a sign-off page (Prepared by/Reviewed
// by/Name of Principal/Signature/Date). Same pdf-lib primitives as
// generateTrustLedgerPdf.ts.
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { wrapPdfText } from "./pdfTextWrap";
import { removeBlankPages } from "@/lib/pdf/removeBlankPages";

export interface BankReconciliationLine {
  date: string | null;
  description: string;
  reference: string | null;
  amount: number;
}

export interface GenerateBankReconciliationPdfInput {
  trustAccountName: string;
  periodStart: string | null;
  periodEnd: string | null;
  openingCashBookBalance: number;
  receiptsInPeriod: number;
  paymentsInPeriod: number;
  cashBookBalance: number;
  ledgerBalance: number;
  bankStatementBalance: number;
  unbankedReceipts: number;
  unpresentedPayments: number;
  reconciliationBalance: number;
  receiptRows: BankReconciliationLine[];
  paymentRows: BankReconciliationLine[];
  preparedBy: string | null;
  preparedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  company?: { name: string; abn: string | null };
}

const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape -- standardised orientation across every trust report
const MARGIN = 48;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return (d || '').slice(0, 10); }
}

export async function generateBankReconciliationPdf(input: GenerateBankReconciliationPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages: PDFPage[] = [];
  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  pages.push(page);
  let y = PAGE_H - MARGIN;
  const MIN_Y = MARGIN + 30;

  function newPage() { page = pdfDoc.addPage([PAGE_W, PAGE_H]); pages.push(page); y = PAGE_H - MARGIN; }
  function ensureRoom(needed: number) { if (y - needed < MIN_Y) newPage(); }

  function text(str: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right'; center?: boolean } = {}, atY?: number) {
    const font = opts.bold ? bold : regular;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    let drawX = x;
    if (opts.align === 'right') drawX = x - font.widthOfTextAtSize(str, size);
    else if (opts.center) drawX = x - font.widthOfTextAtSize(str, size) / 2;
    page.drawText(str, { x: drawX, y: atY ?? y, size, font, color });
  }

  function summaryLine(label: string, value: string, opts: { bold?: boolean; indent?: boolean } = {}) {
    ensureRoom(18);
    text(label, MARGIN + (opts.indent ? 14 : 0), 10, { bold: opts.bold });
    text(value, PAGE_W - MARGIN, 10, { bold: opts.bold, align: 'right' });
    y -= 17;
  }

  function divider() {
    ensureRoom(8);
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.8, 0.8, 0.83) });
    y -= 12;
  }

  // ── Summary page ─────────────────────────────────────────────────────
  text('Trust Account Reconciliation', PAGE_W / 2, 17, { bold: true, center: true }, y); y -= 22;
  if (input.company?.name) { text(input.company.name, PAGE_W / 2, 11, { bold: true, center: true }, y); y -= 16; }
  text(input.trustAccountName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 16;
  text(`Period: ${formatDate(input.periodStart)} – ${formatDate(input.periodEnd)}`, PAGE_W / 2, 10, { color: [0.4, 0.4, 0.45], center: true }, y); y -= 28;

  summaryLine('Opening Cash Book Balance', money(input.openingCashBookBalance));
  summaryLine('Add: Receipts', money(input.receiptsInPeriod), { indent: true });
  summaryLine('Less: Payments', money(input.paymentsInPeriod), { indent: true });
  divider();
  summaryLine('Cash Book Balance', money(input.cashBookBalance), { bold: true });
  summaryLine('Trust Ledger Balance', money(input.ledgerBalance));
  y -= 10;

  summaryLine('Bank Statement Balance', money(input.bankStatementBalance));
  summaryLine('Add: Unbanked Receipts', money(input.unbankedReceipts), { indent: true });
  summaryLine('Less: Unpresented Cheques', money(input.unpresentedPayments), { indent: true });
  divider();
  summaryLine('Reconciliation Balance', money(input.reconciliationBalance), { bold: true });
  y -= 4;

  const balanced = Math.abs(input.reconciliationBalance - input.cashBookBalance) < 0.005;
  ensureRoom(24);
  text(
    balanced ? 'Balanced: Reconciliation Balance agrees with the Cash Book Balance.' : `Out of balance by ${money(input.reconciliationBalance - input.cashBookBalance)}.`,
    MARGIN, 10, { bold: true, color: balanced ? [0.05, 0.5, 0.35] : [0.75, 0.15, 0.15] }
  );
  y -= 30;

  // ── Table renderer (shared by Receipts / Payments) ─────────────────────
  const COLS = [
    { key: 'date', label: 'Date', width: 70, align: 'left' as const },
    { key: 'description', label: 'Description', width: 260, align: 'left' as const },
    { key: 'reference', label: 'Reference', width: 90, align: 'left' as const },
    { key: 'amount', label: 'Amount', width: 78, align: 'right' as const },
  ];

  function renderTable(title: string, rows: BankReconciliationLine[]) {
    ensureRoom(50);
    text(title, MARGIN, 12, { bold: true }); y -= 20;
    let x = MARGIN;
    const colX: number[] = [];
    for (const col of COLS) { colX.push(x); x += col.width; }
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      text(col.label, col.align === 'right' ? colX[i] + col.width : colX[i], 8, { bold: true, color: [0.4, 0.4, 0.45], align: col.align });
    }
    y -= 6;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
    y -= 14;

    let total = 0;
    if (!rows.length) {
      text('No items.', MARGIN, 9, { color: [0.55, 0.55, 0.58] }); y -= 16;
    }
    const ROW_SIZE = 9, LINE_H = 11;
    for (const row of rows) {
      const values: Record<string, string> = { date: formatDate(row.date), description: row.description, reference: row.reference || '', amount: money(row.amount) };
      const wrapped = COLS.map(col => wrapPdfText(values[col.key] || '', regular, ROW_SIZE, col.width - 4));
      const lineCount = Math.max(1, ...wrapped.map(w => w.length));
      ensureRoom(lineCount * LINE_H + 4);
      for (let i = 0; i < COLS.length; i++) {
        const col = COLS[i];
        const colXPos = col.align === 'right' ? colX[i] + col.width : colX[i];
        wrapped[i].forEach((line, li) => text(line, colXPos, ROW_SIZE, { align: col.align }, y - li * LINE_H));
      }
      total += row.amount;
      y -= lineCount * LINE_H + 4;
    }
    ensureRoom(20);
    page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
    y -= 8;
    text('Total', colX[1], 9, { bold: true });
    text(money(total), colX[3] + COLS[3].width, 9, { bold: true, align: 'right' });
    y -= 26;
  }

  renderTable('Reconciled Receipts', input.receiptRows);
  renderTable('Reconciled Payments', input.paymentRows);

  // ── Sign-off page ────────────────────────────────────────────────────
  newPage();
  text('Sign-off', MARGIN, 14, { bold: true }); y -= 30;

  function signRow(label: string, value: string) {
    ensureRoom(40);
    text(label, MARGIN, 9, { color: [0.5, 0.5, 0.55] }); y -= 14;
    text(value || '—', MARGIN, 11); y -= 10;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: rgb(0.85, 0.85, 0.87) });
    y -= 24;
  }

  signRow('Prepared by', input.preparedBy || '');
  signRow('Date of preparation', formatDate(input.preparedAt));

  ensureRoom(20);
  text(
    input.reviewedBy
      ? `Digitally confirmed by ${input.reviewedBy} (Partner) via Diract on ${formatDate(input.reviewedAt)}.`
      : 'Not yet confirmed by a Partner.',
    MARGIN, 9, { color: input.reviewedBy ? [0.05, 0.5, 0.35] : [0.75, 0.15, 0.15] }
  );
  y -= 34;

  // Partner wet-signature block -- a real ruled line to physically sign
  // once printed, separate from (and in addition to) the digital
  // confirmation above. Print Name is pre-filled from whoever digitally
  // confirmed as a courtesy, but the line itself is left for a pen
  // signature; Date is left entirely blank for the day it's actually signed
  // on paper, which can differ from the digital confirmation date.
  ensureRoom(90);
  text('Partner Sign-off', MARGIN, 11, { bold: true }); y -= 26;

  const sigColW = (PAGE_W - MARGIN * 2 - 24) * 0.62;
  const dateColX = MARGIN + sigColW + 24;
  const sigLineY = y;
  page.drawLine({ start: { x: MARGIN, y: sigLineY }, end: { x: MARGIN + sigColW, y: sigLineY }, thickness: 0.75, color: rgb(0.4, 0.4, 0.45) });
  page.drawLine({ start: { x: dateColX, y: sigLineY }, end: { x: PAGE_W - MARGIN, y: sigLineY }, thickness: 0.75, color: rgb(0.4, 0.4, 0.45) });
  y -= 12;
  text('Signature', MARGIN, 9, { color: [0.5, 0.5, 0.55] });
  text('Date', dateColX, 9, { color: [0.5, 0.5, 0.55] });
  y -= 26;

  const nameLineY = y;
  page.drawLine({ start: { x: MARGIN, y: nameLineY }, end: { x: MARGIN + sigColW, y: nameLineY }, thickness: 0.5, color: rgb(0.85, 0.85, 0.87) });
  text(input.reviewedBy || '', MARGIN, 11, {}, nameLineY + 4);
  y -= 12;
  text('Print name (Partner)', MARGIN, 9, { color: [0.5, 0.5, 0.55] });
  y -= 20;

  // Pagination logic in this file can leave a trailing or interstitial page
  // with nothing actually drawn on it (an off-by-one in a row-count
  // estimate, a section that turned out to have zero rows) -- caught here,
  // BEFORE page numbers are stamped on, so a blank page is still detectably
  // blank (a page number would otherwise be the one thing drawn on it) and
  // "Page X of Y" reflects the pages that actually survive.
  removeBlankPages(pdfDoc);

  // ── Page numbering ───────────────────────────────────────────────────
  // Re-read from pdfDoc rather than reusing the local `pages` array above --
  // removeBlankPages may have dropped some of what's in it, and it's not
  // safe to keep drawing onto a page reference that's no longer part of the
  // document.
  const survivingPages = pdfDoc.getPages();
  survivingPages.forEach((p, i) => {
    const label = `Page ${i + 1} of ${survivingPages.length}`;
    p.drawText(label, {
      x: PAGE_W - MARGIN - regular.widthOfTextAtSize(label, 8),
      y: MARGIN - 22, size: 8, font: regular, color: rgb(0.6, 0.6, 0.63),
    });
  });

  return pdfDoc.save();
}
