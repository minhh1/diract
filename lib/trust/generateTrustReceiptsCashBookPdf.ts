// Receipts Cash Book PDF -- sibling of generateTrustCashBookPdf.ts, see that
// file's header for why this generates client-side. No running balance
// column (see TrustReceiptsCashBookWidget.tsx's header for why).
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { wrapPdfText } from "./pdfTextWrap";

export interface TrustReceiptsCashBookRow {
  date: string | null;
  receiptNumber: string | null;
  formOfFunds: string | null;
  receivedFrom: string | null;
  reason: string | null;
  matterNumber: string | null;
  clientName: string | null;
  matterType: string | null;
  description: string | null;
  credit: number;
  banked: boolean;
}

export interface GenerateTrustReceiptsCashBookPdfInput {
  companyName: string;
  trustAccountName: string;
  from: string;
  to: string;
  rows: TrustReceiptsCashBookRow[];
  totalCredit: number;
}

const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape
const MARGIN = 30;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}
function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return (d || '').slice(0, 10); }
}

const COLS: { key: keyof TrustReceiptsCashBookRow; label: string; width: number; align: 'left' | 'right' | 'center' }[] = [
  // Widths kept within PAGE_W - 2*MARGIN (781.89pt usable on this landscape
  // page) -- the original set summed to ~865pt, wider than the page itself,
  // so the rightmost columns (Credit/Banked) were being drawn past the
  // page's right edge and never appeared when printed/exported.
  { key: 'date', label: 'Date', width: 56, align: 'left' },
  { key: 'receiptNumber', label: 'Receipt No.', width: 61, align: 'left' },
  { key: 'formOfFunds', label: 'Form of Funds', width: 63, align: 'left' },
  { key: 'receivedFrom', label: 'Received From', width: 94, align: 'left' },
  { key: 'reason', label: 'Reason', width: 94, align: 'left' },
  { key: 'matterNumber', label: 'Matter Ref', width: 56, align: 'left' },
  { key: 'clientName', label: 'Client', width: 90, align: 'left' },
  { key: 'matterType', label: 'Matter Type', width: 70, align: 'left' },
  { key: 'description', label: 'Description', width: 99, align: 'left' },
  { key: 'credit', label: 'Credit', width: 58, align: 'right' },
  { key: 'banked', label: 'Banked', width: 36, align: 'center' },
];

export async function generateTrustReceiptsCashBookPdf(input: GenerateTrustReceiptsCashBookPdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const MIN_Y = MARGIN + 30;

  function newPage() { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; }
  function ensureRoom(needed: number) { if (y - needed < MIN_Y) newPage(); }

  function text(str: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center'; center?: boolean } = {}, atY?: number) {
    const font = opts.bold ? bold : regular;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    let drawX = x;
    if (opts.align === 'right') drawX = x - font.widthOfTextAtSize(str, size);
    else if (opts.align === 'center' || opts.center) drawX = x - font.widthOfTextAtSize(str, size) / 2;
    page.drawText(str, { x: drawX, y: atY ?? y, size, font, color });
  }

  text('Receipts Cash Book', PAGE_W / 2, 18, { bold: true, center: true }, y); y -= 24;
  if (input.companyName) { text(input.companyName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 18; }
  text(input.trustAccountName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 16;
  text(`Period: ${formatDate(input.from)} – ${formatDate(input.to)}`, PAGE_W / 2, 10, { color: [0.4, 0.4, 0.45], center: true }, y); y -= 28;

  let x = MARGIN;
  const colX: number[] = [];
  for (const col of COLS) { colX.push(x); x += col.width; }
  for (let i = 0; i < COLS.length; i++) {
    const col = COLS[i];
    const labelX = col.align === 'right' ? colX[i] + col.width : col.align === 'center' ? colX[i] + col.width / 2 : colX[i];
    text(col.label, labelX, 7.5, { bold: true, color: [0.4, 0.4, 0.45], align: col.align }, y);
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 14;

  const ROW_SIZE = 7.5, LINE_H = 9;

  for (const row of input.rows) {
    const values: Record<string, string> = {
      date: formatDate(row.date), receiptNumber: row.receiptNumber || '', formOfFunds: row.formOfFunds || '',
      receivedFrom: row.receivedFrom || '', reason: row.reason || '', matterNumber: row.matterNumber || '',
      clientName: row.clientName || '', matterType: row.matterType || '', description: row.description || '',
      credit: money(row.credit), banked: row.banked ? 'Y' : '',
    };
    const wrapped = COLS.map(col => wrapPdfText(values[col.key] || '', regular, ROW_SIZE, col.width - 4));
    const lineCount = Math.max(1, ...wrapped.map(w => w.length));
    ensureRoom(lineCount * LINE_H + 4);
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      const labelX = col.align === 'right' ? colX[i] + col.width : col.align === 'center' ? colX[i] + col.width / 2 : colX[i];
      wrapped[i].forEach((line, li) => text(line, labelX, ROW_SIZE, { align: col.align }, y - li * LINE_H));
    }
    y -= lineCount * LINE_H + 4;
  }
  if (!input.rows.length) {
    ensureRoom(16);
    text('No receipts in this period.', MARGIN, 9, { color: [0.5, 0.5, 0.55] }, y);
    y -= 14;
  }

  ensureRoom(24);
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 8;
  text('Period total', colX[8], 9, { bold: true }, y);
  text(money(input.totalCredit), colX[9] + COLS[9].width, 9, { bold: true, align: 'right' }, y);

  return pdfDoc.save();
}
