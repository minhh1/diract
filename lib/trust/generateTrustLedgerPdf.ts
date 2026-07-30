// Builds a matter-level Trust Account Ledger PDF -- matches the reference
// sample: firm header, matter identification, one "Trust: {account name}"
// section per trust account the matter has entries in, a table (Transaction
// Date/Entered Date/Reference/Description/Reason/Paid By/Paid To/Multi
// Amount/Debit/Credit/Balance), and a totals row. Same pdf-lib primitives as
// generateTrustReceiptPdf.ts.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface TrustLedgerRow {
  transactionDate: string | null;
  enteredDate: string | null;
  reference: string | null;
  description: string;
  reason: string | null;
  paidBy: string | null;
  paidTo: string | null;
  multiAmount: number | null;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrustLedgerSection {
  trustAccountName: string;
  rows: TrustLedgerRow[];
}

export interface GenerateTrustLedgerPdfInput {
  matterName: string;
  sections: TrustLedgerSection[];
  company?: { name: string; abn: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
}

const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape -- this table has 11 columns
const MARGIN = 40;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return (d || '').slice(0, 10); }
}

const COLS: { key: keyof TrustLedgerRow | 'multiAmount'; label: string; width: number; align: 'left' | 'right' }[] = [
  { key: 'transactionDate', label: 'Transaction Date', width: 72, align: 'left' },
  { key: 'enteredDate', label: 'Entered Date', width: 70, align: 'left' },
  { key: 'reference', label: 'Reference', width: 60, align: 'left' },
  { key: 'description', label: 'Description', width: 140, align: 'left' },
  { key: 'reason', label: 'Reason', width: 90, align: 'left' },
  { key: 'paidBy', label: 'Paid By', width: 90, align: 'left' },
  { key: 'paidTo', label: 'Paid To', width: 90, align: 'left' },
  { key: 'multiAmount', label: 'Multi Amount', width: 62, align: 'right' },
  { key: 'debit', label: 'Debit', width: 62, align: 'right' },
  { key: 'credit', label: 'Credit', width: 62, align: 'right' },
  { key: 'balance', label: 'Balance', width: 62, align: 'right' },
];

export async function generateTrustLedgerPdf(input: GenerateTrustLedgerPdfInput): Promise<Uint8Array> {
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

  // ── Header ───────────────────────────────────────────────────────────
  text('Trust Account Ledger', PAGE_W / 2, 18, { bold: true, center: true }, y);
  y -= 24;
  if (input.company?.name) { text(input.company.name, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 18; }
  text(input.matterName, PAGE_W / 2, 13, { bold: true, center: true }, y);
  y -= 30;

  for (const section of input.sections) {
    ensureRoom(60);
    text(`Trust: ${section.trustAccountName}`, MARGIN, 11, { bold: true }, y);
    y -= 20;

    // Column header
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

    let totalDebit = 0, totalCredit = 0;
    for (const row of section.rows) {
      ensureRoom(30);
      const values: Record<string, string> = {
        transactionDate: formatDate(row.transactionDate), enteredDate: formatDate(row.enteredDate),
        reference: row.reference || '', description: row.description, reason: row.reason || '',
        paidBy: row.paidBy || '', paidTo: row.paidTo || '',
        multiAmount: row.multiAmount != null ? money(row.multiAmount) : '',
        debit: row.debit ? money(row.debit) : '', credit: row.credit ? money(row.credit) : '', balance: money(row.balance),
      };
      for (let i = 0; i < COLS.length; i++) {
        const col = COLS[i];
        const raw = values[col.key as string] || '';
        const font = regular;
        const size = 8;
        const truncated = font.widthOfTextAtSize(raw, size) > col.width - 4
          ? (() => { let s = raw; while (s.length > 1 && font.widthOfTextAtSize(s + '…', size) > col.width - 4) s = s.slice(0, -1); return s + '…'; })()
          : raw;
        text(truncated, col.align === 'right' ? colX[i] + col.width : colX[i], size, { align: col.align }, y);
      }
      totalDebit += row.debit; totalCredit += row.credit;
      y -= 14;
    }

    ensureRoom(20);
    page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
    y -= 8;
    text('Totals', colX[3], 9, { bold: true }, y);
    text(money(totalDebit), colX[8] + COLS[8].width, 9, { bold: true, align: 'right' }, y);
    text(money(totalCredit), colX[9] + COLS[9].width, 9, { bold: true, align: 'right' }, y);
    if (section.rows.length) text(money(section.rows[section.rows.length - 1].balance), colX[10] + COLS[10].width, 9, { bold: true, align: 'right' }, y);
    y -= 30;
  }

  if (!input.sections.length) {
    text('No trust transactions recorded for this matter.', MARGIN, 11, { color: [0.5, 0.5, 0.55] }, y);
  }

  return pdfDoc.save();
}
