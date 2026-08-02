// Trust Trial Balance PDF -- per-matter ledger balances, the statutory
// summary block, and a sign-off block, matching what a practice's actual
// Trial Balance report looks like when printed. See
// TrustTrialBalanceWidget.tsx's header for why the summary/sign-off inputs
// aren't persisted fields.
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { wrapPdfText } from "./pdfTextWrap";

export interface TrustTrialBalanceRow {
  matterNumber: string | null;
  description: string;
  matterType: string | null;
  clientName: string | null;
  lastTransactionDate: string | null;
  balance: number;
}

export interface GenerateTrustTrialBalancePdfInput {
  companyName: string;
  trustAccountName: string;
  asOf: string;
  rows: TrustTrialBalanceRow[];
  totalLedgerAccounts: number;
  statutoryDeposit: number;
  total: number;
  reconciledCashBookBalance: number;
  variance: number;
  preparedBy: string;
  preparedDate: string;
  reviewedBy: string;
  reviewedDate: string;
}

const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape -- standardised orientation across every trust report
const MARGIN = 45;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}
function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

const COLS: { key: keyof TrustTrialBalanceRow; label: string; width: number; align: 'left' | 'right' }[] = [
  { key: 'matterNumber', label: 'Matter Ref', width: 60, align: 'left' },
  { key: 'description', label: 'Description', width: 130, align: 'left' },
  { key: 'matterType', label: 'Type', width: 70, align: 'left' },
  { key: 'clientName', label: 'Client(s)', width: 105, align: 'left' },
  { key: 'lastTransactionDate', label: 'Last Txn Date', width: 62, align: 'left' },
  { key: 'balance', label: 'Balance', width: 78, align: 'right' },
];

export async function generateTrustTrialBalancePdf(input: GenerateTrustTrialBalancePdfInput): Promise<Uint8Array> {
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

  text('Trial Balance', PAGE_W / 2, 18, { bold: true, center: true }, y); y -= 24;
  if (input.companyName) { text(input.companyName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 18; }
  text(input.trustAccountName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 16;
  text(`As at ${formatDate(input.asOf)}`, PAGE_W / 2, 10, { color: [0.4, 0.4, 0.45], center: true }, y); y -= 26;

  let x = MARGIN;
  const colX: number[] = [];
  for (const col of COLS) { colX.push(x); x += col.width; }
  for (let i = 0; i < COLS.length; i++) {
    const col = COLS[i];
    text(col.label, col.align === 'right' ? colX[i] + col.width : colX[i], 7.5, { bold: true, color: [0.4, 0.4, 0.45], align: col.align }, y);
  }
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 13;

  if (!input.rows.length) {
    ensureRoom(18);
    text('No trust transactions as at this date.', MARGIN, 9, { color: [0.5, 0.5, 0.55] }, y);
    y -= 14;
  }

  const ROW_SIZE = 7.5, LINE_H = 9;

  for (const row of input.rows) {
    const values: Record<string, string> = {
      matterNumber: row.matterNumber || '', description: row.description, matterType: row.matterType || '',
      clientName: row.clientName || '', lastTransactionDate: formatDate(row.lastTransactionDate), balance: money(row.balance),
    };
    const wrapped = COLS.map(col => wrapPdfText(values[col.key] || '', regular, ROW_SIZE, col.width - 4));
    const lineCount = Math.max(1, ...wrapped.map(w => w.length));
    ensureRoom(lineCount * LINE_H + 4);
    for (let i = 0; i < COLS.length; i++) {
      const col = COLS[i];
      const colXPos = col.align === 'right' ? colX[i] + col.width : colX[i];
      wrapped[i].forEach((line, li) => text(line, colXPos, ROW_SIZE, {
        align: col.align, color: col.key === 'balance' && row.balance < 0 ? [0.72, 0.11, 0.24] : undefined,
      }, y - li * LINE_H));
    }
    y -= lineCount * LINE_H + 4;
  }

  ensureRoom(20);
  page.drawLine({ start: { x: MARGIN, y: y + 6 }, end: { x: PAGE_W - MARGIN, y: y + 6 }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 8;
  text('Total Trust Ledger Accounts', colX[3], 9, { bold: true }, y);
  text(money(input.totalLedgerAccounts), colX[5] + COLS[5].width, 9, { bold: true, align: 'right' }, y);
  y -= 26;

  // ── Reconciliation summary ──
  ensureRoom(110);
  const boxTop = y;
  text('Reconciliation Summary', MARGIN, 10, { bold: true }, y); y -= 18;
  const labelX = MARGIN, valueX = PAGE_W - MARGIN;
  const summaryLines: [string, string, boolean?][] = [
    ['Total Trust Ledger Accounts', money(input.totalLedgerAccounts)],
    ['Statutory Deposit', money(input.statutoryDeposit)],
    ['Total', money(input.total), true],
    ['Reconciled Trust Cash Book Balance', money(input.reconciledCashBookBalance)],
    ['Variance', money(input.variance), true],
  ];
  for (const [label, value, isBold] of summaryLines) {
    text(label, labelX, 9.5, { bold: !!isBold }, y);
    text(value, valueX, 9.5, {
      bold: !!isBold, align: 'right',
      color: label === 'Variance' && Math.abs(input.variance) >= 0.005 ? [0.72, 0.11, 0.24] : undefined,
    }, y);
    y -= 15;
  }
  page.drawRectangle({ x: MARGIN - 8, y: y + 6, width: PAGE_W - 2 * MARGIN + 16, height: boxTop - y + 6, borderColor: rgb(0.85, 0.85, 0.87), borderWidth: 0.75, opacity: 0 });
  y -= 30;

  // ── Sign-off block ──
  ensureRoom(90);
  text('Prepared by:', MARGIN, 9.5, { bold: true }, y);
  text(input.preparedBy || '_______________________', MARGIN + 70, 9.5, {}, y);
  text('Date:', MARGIN + 300, 9.5, { bold: true }, y);
  text(input.preparedDate ? formatDate(input.preparedDate) : '_______________', MARGIN + 335, 9.5, {}, y);
  y -= 24;
  text('Reviewed by (Principal):', MARGIN, 9.5, { bold: true }, y);
  text(input.reviewedBy || '_______________________', MARGIN + 120, 9.5, {}, y);
  y -= 24;
  text('Signature:', MARGIN, 9.5, { bold: true }, y);
  page.drawLine({ start: { x: MARGIN + 62, y: y - 2 }, end: { x: MARGIN + 260, y: y - 2 }, thickness: 0.75, color: rgb(0.6, 0.6, 0.63) });
  text('Date:', MARGIN + 300, 9.5, { bold: true }, y);
  text(input.reviewedDate ? formatDate(input.reviewedDate) : '_______________', MARGIN + 335, 9.5, {}, y);

  return pdfDoc.save();
}
