// Trust Cash Book PDF -- generated entirely client-side (pdf-lib runs fine
// in the browser, same as lib/pdfeditor/applyEdits.ts already does) because,
// unlike a receipt/ledger/reconciliation, this "report" has no fixed record
// id to hydrate from later -- it's whatever date range + account the user
// currently has the widget filtered to, so printing exactly what's on
// screen (no server round-trip, no query params to keep in sync with the
// widget's own filter state) is the correct shape here, not a mismatch with
// the rest of the app's server-rendered PDF pattern.
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { wrapPdfText } from "./pdfTextWrap";
import { removeBlankPages } from "@/lib/pdf/removeBlankPages";

export interface TrustCashBookRow {
  date: string | null;
  receiptNumber: string | null;
  matterNumber: string | null;
  matterName: string | null;
  particulars: string;
  amountIn: number;
  amountOut: number;
  running: number;
}

export interface GenerateTrustCashBookPdfInput {
  companyName: string;
  trustAccountName: string;
  from: string;
  to: string;
  openingBalance: number;
  rows: TrustCashBookRow[];
  periodIn: number;
  periodOut: number;
  closingBalance: number;
}

const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape -- 8 columns
const MARGIN = 40;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}
function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return (d || '').slice(0, 10); }
}

// Widths kept within PAGE_W - 2*MARGIN (761.89pt usable) -- the original
// set summed past the page's right edge, so Running Total (and part of Out)
// was being drawn past where the page actually ends and never appeared
// when printed/exported.
const COLS: { key: keyof TrustCashBookRow; label: string; width: number; align: 'left' | 'right' }[] = [
  { key: 'date', label: 'Date', width: 59, align: 'left' },
  { key: 'receiptNumber', label: 'Receipt No.', width: 68, align: 'left' },
  { key: 'matterNumber', label: 'Matter No.', width: 68, align: 'left' },
  { key: 'matterName', label: 'Matter', width: 175, align: 'left' },
  { key: 'particulars', label: 'Particulars', width: 175, align: 'left' },
  { key: 'amountIn', label: 'In', width: 65, align: 'right' },
  { key: 'amountOut', label: 'Out', width: 65, align: 'right' },
  { key: 'running', label: 'Running Total', width: 74, align: 'right' },
];

export async function generateTrustCashBookPdf(input: GenerateTrustCashBookPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const MIN_Y = MARGIN + 30;

  function newPage() { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  function ensureRoom(needed: number) { if (y - needed < MIN_Y) newPage(); }

  function text(str: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right'; center?: boolean } = {}, atY?: number) {
    const font = opts.bold ? bold : regular;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    let drawX = x;
    if (opts.align === 'right') drawX = x - font.widthOfTextAtSize(str, size);
    else if (opts.center) drawX = x - font.widthOfTextAtSize(str, size) / 2;
    page.drawText(str, { x: drawX, y: atY ?? y, size, font, color });
  }

  text('Trust Cash Book', PAGE_W / 2, 18, { bold: true, center: true }, y); y -= 24;
  if (input.companyName) { text(input.companyName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 18; }
  text(input.trustAccountName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 16;
  text(`Period: ${formatDate(input.from)} – ${formatDate(input.to)}`, PAGE_W / 2, 10, { color: [0.4, 0.4, 0.45], center: true }, y); y -= 28;

  let x = MARGIN;
  const colX: number[] = [];
  for (const col of COLS) { colX.push(x); x += col.width; }
  for (let i = 0; i < COLS.length; i++) {
    const col = COLS[i];
    text(col.label, col.align === 'right' ? colX[i] + col.width : colX[i], 8, { bold: true, color: [0.4, 0.4, 0.45], align: col.align }, y);
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 14;

  text(`Opening balance (before ${formatDate(input.from)})`, MARGIN, 9, { color: [0.5, 0.5, 0.55] }, y);
  text(money(input.openingBalance), colX[7] + COLS[7].width, 9, { bold: true, align: 'right' }, y);
  y -= 16;

  const ROW_SIZE = 8, LINE_H = 10;

  for (const row of input.rows) {
    const values: Record<string, string> = {
      date: formatDate(row.date), receiptNumber: row.receiptNumber || '', matterNumber: row.matterNumber || '',
      matterName: row.matterName || '', particulars: row.particulars,
      amountIn: row.amountIn ? money(row.amountIn) : '', amountOut: row.amountOut ? money(row.amountOut) : '', running: money(row.running),
    };
    const wrapped = COLS.map(col => wrapPdfText(values[col.key] || '', regular, ROW_SIZE, col.width - 4));
    const lineCount = Math.max(1, ...wrapped.map(w => w.length));
    ensureRoom(lineCount * LINE_H + 4);
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      const colXPos = col.align === 'right' ? colX[i] + col.width : colX[i];
      wrapped[i].forEach((line, li) => text(line, colXPos, ROW_SIZE, { align: col.align }, y - li * LINE_H));
    }
    y -= lineCount * LINE_H + 4;
  }
  if (!input.rows.length) {
    ensureRoom(16);
    text('No trust transactions in this period.', MARGIN, 9, { color: [0.5, 0.5, 0.55] }, y);
    y -= 14;
  }

  ensureRoom(24);
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 8;
  text('Period totals', colX[4], 9, { bold: true }, y);
  text(money(input.periodIn), colX[5] + COLS[5].width, 9, { bold: true, align: 'right' }, y);
  text(money(input.periodOut), colX[6] + COLS[6].width, 9, { bold: true, align: 'right' }, y);
  text(money(input.closingBalance), colX[7] + COLS[7].width, 9, { bold: true, align: 'right' }, y);

  // Pagination logic in this file can leave a trailing or interstitial
  // page with nothing actually drawn on it (an off-by-one in a row-count
  // estimate, a section that turned out to have zero rows) -- caught here
  // rather than trusted not to happen.
  removeBlankPages(pdfDoc);
  return pdfDoc.save();
}
