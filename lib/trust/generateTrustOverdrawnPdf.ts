// Trust Ledger Overdrawn PDF -- see TrustOverdrawnWidget.tsx's header for
// why this should always print with "No entries found."
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { removeBlankPages } from "@/lib/pdf/removeBlankPages";

export interface TrustOverdrawnRow {
  matterNumber: string | null;
  matterName: string;
  balance: number;
}

export interface GenerateTrustOverdrawnPdfInput {
  companyName: string;
  trustAccountName: string;
  asOf: string;
  rows: TrustOverdrawnRow[];
}

const PAGE_W = 841.89, PAGE_H = 595.28; // A4 landscape -- standardised orientation across every trust report -- three columns is plenty
const MARGIN = 50;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}
function formatDate(d: string): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

export async function generateTrustOverdrawnPdf(input: GenerateTrustOverdrawnPdfInput): Promise<Uint8Array> {
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

  text('Trust Ledger Overdrawn', PAGE_W / 2, 18, { bold: true, center: true }, y); y -= 24;
  if (input.companyName) { text(input.companyName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 18; }
  text(input.trustAccountName, PAGE_W / 2, 12, { bold: true, center: true }, y); y -= 16;
  text(`As at ${formatDate(input.asOf)}`, PAGE_W / 2, 10, { color: [0.4, 0.4, 0.45], center: true }, y); y -= 30;

  const col1 = MARGIN, col2 = MARGIN + 90, col3 = PAGE_W - MARGIN;
  text('Matter No.', col1, 9, { bold: true, color: [0.4, 0.4, 0.45] }, y);
  text('Matter', col2, 9, { bold: true, color: [0.4, 0.4, 0.45] }, y);
  text('Balance', col3, 9, { bold: true, color: [0.4, 0.4, 0.45], align: 'right' }, y);
  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.75, color: rgb(0.75, 0.75, 0.78) });
  y -= 16;

  if (!input.rows.length) {
    ensureRoom(20);
    text('No entries found.', PAGE_W / 2, 10, { color: [0.5, 0.5, 0.55], center: true }, y);
    y -= 16;
  }

  for (const row of input.rows) {
    ensureRoom(18);
    text(row.matterNumber || '—', col1, 9, {}, y);
    text(row.matterName, col2, 9, {}, y);
    text(money(row.balance), col3, 9, { bold: true, color: [0.72, 0.11, 0.24], align: 'right' }, y);
    y -= 16;
  }

  // Pagination logic in this file can leave a trailing or interstitial
  // page with nothing actually drawn on it (an off-by-one in a row-count
  // estimate, a section that turned out to have zero rows) -- caught here
  // rather than trusted not to happen.
  removeBlankPages(pdfDoc);
  return pdfDoc.save();
}
