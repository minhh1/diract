// Dormant Trust Balances PDF -- client-side generated, same reasoning as
// generateTrustCashBookPdf.ts (a live, filter-driven report, not a fixed
// record to hydrate server-side).
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { wrapPdfText } from "./pdfTextWrap";
import { removeBlankPages } from "@/lib/pdf/removeBlankPages";

export interface DormantTrustBalanceRow {
  matterNumber: string | null;
  matterName: string;
  lastDate: string | null;
  daysDormant: number | null;
  balance: number;
}

export interface GenerateDormantTrustBalancesPdfInput {
  companyName: string;
  trustAccountName: string;
  dormantDays: number;
  balances: DormantTrustBalanceRow[];
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

const COLS: { key: keyof DormantTrustBalanceRow; label: string; width: number; align: 'left' | 'right' }[] = [
  { key: 'matterNumber', label: 'Matter No.', width: 80, align: 'left' },
  { key: 'matterName', label: 'Matter', width: 190, align: 'left' },
  { key: 'lastDate', label: 'Last Activity', width: 90, align: 'left' },
  { key: 'daysDormant', label: 'Days Dormant', width: 80, align: 'right' },
  { key: 'balance', label: 'Balance', width: 60, align: 'right' },
];

export async function generateDormantTrustBalancesPdf(input: GenerateDormantTrustBalancesPdfInput): Promise<Uint8Array> {
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

  text('Dormant Trust Balances', PAGE_W / 2, 17, { bold: true, center: true }, y); y -= 22;
  if (input.companyName) { text(input.companyName, PAGE_W / 2, 11, { bold: true, center: true }, y); y -= 16; }
  text(input.trustAccountName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 16;
  text(`Matters with a live balance and no transaction for ${input.dormantDays}+ days`, PAGE_W / 2, 10, { color: [0.4, 0.4, 0.45], center: true }, y); y -= 28;

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

  const ROW_SIZE = 9, LINE_H = 11;

  for (const b of input.balances) {
    const values: Record<string, string> = {
      matterNumber: b.matterNumber || '', matterName: b.matterName, lastDate: formatDate(b.lastDate),
      daysDormant: b.daysDormant != null && Number.isFinite(b.daysDormant) ? String(b.daysDormant) : '—',
      balance: money(b.balance),
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
  if (!input.balances.length) {
    ensureRoom(16);
    text('No dormant trust balances.', MARGIN, 10, { color: [0.5, 0.5, 0.55] }, y);
  }

  // Pagination logic in this file can leave a trailing or interstitial
  // page with nothing actually drawn on it (an off-by-one in a row-count
  // estimate, a section that turned out to have zero rows) -- caught here
  // rather than trusted not to happen.
  removeBlankPages(pdfDoc);
  return pdfDoc.save();
}
