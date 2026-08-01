// Trust Journal Transfers PDF -- sibling of generateTrustReceiptsCashBookPdf.ts.
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { wrapPdfText } from "./pdfTextWrap";

export interface TrustJournalTransferRow {
  date: string | null;
  journalNumber: string | null;
  reason: string | null;
  matterNumber: string | null;
  clientName: string | null;
  description: string | null;
  authorisedBy: string | null;
  credit: number;
  debit: number;
}

export interface GenerateTrustJournalTransfersPdfInput {
  companyName: string;
  trustAccountName: string;
  from: string;
  to: string;
  rows: TrustJournalTransferRow[];
  totalCredit: number;
  totalDebit: number;
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

const COLS: { key: keyof TrustJournalTransferRow; label: string; width: number; align: 'left' | 'right' }[] = [
  // Widths kept within PAGE_W - 2*MARGIN (781.89pt usable) -- see
  // generateTrustReceiptsCashBookPdf.ts's matching comment; the original
  // set summed past the page's right edge.
  { key: 'date', label: 'Date', width: 62, align: 'left' },
  { key: 'journalNumber', label: 'Journal No.', width: 69, align: 'left' },
  { key: 'reason', label: 'Reason', width: 125, align: 'left' },
  { key: 'matterNumber', label: 'Matter Ref', width: 62, align: 'left' },
  { key: 'clientName', label: 'Client', width: 106, align: 'left' },
  { key: 'description', label: 'Matter Description', width: 125, align: 'left' },
  { key: 'authorisedBy', label: 'Authorised By', width: 101, align: 'left' },
  { key: 'credit', label: 'Credit', width: 62, align: 'right' },
  { key: 'debit', label: 'Debit', width: 62, align: 'right' },
];

export async function generateTrustJournalTransfersPdf(input: GenerateTrustJournalTransfersPdfInput): Promise<Uint8Array> {
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

  text('Trust Journal Transfers', PAGE_W / 2, 18, { bold: true, center: true }, y); y -= 24;
  if (input.companyName) { text(input.companyName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 18; }
  text(input.trustAccountName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 16;
  text(`Period: ${formatDate(input.from)} – ${formatDate(input.to)}`, PAGE_W / 2, 10, { color: [0.4, 0.4, 0.45], center: true }, y); y -= 28;

  let x = MARGIN;
  const colX: number[] = [];
  for (const col of COLS) { colX.push(x); x += col.width; }
  for (let i = 0; i < COLS.length; i++) {
    const col = COLS[i];
    text(col.label, col.align === 'right' ? colX[i] + col.width : colX[i], 7.5, { bold: true, color: [0.4, 0.4, 0.45], align: col.align }, y);
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 14;

  if (!input.rows.length) {
    ensureRoom(20);
    text('No journal transfers in this period.', MARGIN, 9, { color: [0.5, 0.5, 0.55] }, y);
    y -= 14;
  }

  const ROW_SIZE = 7.5, LINE_H = 9;

  for (const row of input.rows) {
    const values: Record<string, string> = {
      date: formatDate(row.date), journalNumber: row.journalNumber || '', reason: row.reason || '',
      matterNumber: row.matterNumber || '', clientName: row.clientName || '', description: row.description || '',
      authorisedBy: row.authorisedBy || '', credit: row.credit ? money(row.credit) : '', debit: row.debit ? money(row.debit) : '',
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

  ensureRoom(24);
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 8;
  text('Period totals', colX[6], 9, { bold: true }, y);
  text(money(input.totalCredit), colX[7] + COLS[7].width, 9, { bold: true, align: 'right' }, y);
  text(money(input.totalDebit), colX[8] + COLS[8].width, 9, { bold: true, align: 'right' }, y);

  return pdfDoc.save();
}
