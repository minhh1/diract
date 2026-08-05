// Builds a printable trust cheque + remittance stub. Same pdf-lib
// primitives/letterhead conventions as generateTrustReceiptPdf.ts.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { removeBlankPages } from "@/lib/pdf/removeBlankPages";

export interface GenerateTrustChequePdfInput {
  company: { name: string; abn: string | null; address: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
  cheque: {
    chequeNumber: string;
    date: string | null;
    payTo: string | null;
    amount: number;
    memo: string | null;
    matterNumber: string | null;
    matterName: string | null;
  };
}

const PAGE_W = 595.28, PAGE_H = 841.89; // A4, points
const MARGIN = 50;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigitsToWords(n: number): string {
  let s = '';
  if (n >= 100) { s += `${ONES[Math.floor(n / 100)]} Hundred `; n %= 100; }
  if (n >= 20) { s += `${TENS[Math.floor(n / 10)]} `; n %= 10; }
  if (n > 0) s += `${ONES[n]} `;
  return s.trim();
}

// Amount-in-words -- conventional on a physical cheque so the numeral and
// the words cross-check each other. Handles up to hundreds of millions,
// comfortably past any real trust withdrawal.
function amountInWords(amount: number): string {
  const dollars = Math.floor(amount);
  const cents = Math.round((amount - dollars) * 100);
  if (dollars === 0 && cents === 0) return 'Zero dollars only';
  let whole = dollars;
  const parts: string[] = [];
  const millions = Math.floor(whole / 1_000_000); whole %= 1_000_000;
  const thousands = Math.floor(whole / 1_000); whole %= 1_000;
  if (millions) parts.push(`${threeDigitsToWords(millions)} Million`);
  if (thousands) parts.push(`${threeDigitsToWords(thousands)} Thousand`);
  if (whole) parts.push(threeDigitsToWords(whole));
  const dollarWords = parts.length ? parts.join(' ') : 'Zero';
  const centsWords = cents > 0 ? ` and ${cents}/100` : '';
  return `${dollarWords} dollars${centsWords} only`;
}

export async function generateTrustChequePdf(input: GenerateTrustChequePdfInput): Promise<Uint8Array> {
  const matterText = input.cheque.matterName
    ? (input.cheque.matterNumber ? `${input.cheque.matterNumber} - ${input.cheque.matterName}` : input.cheque.matterName)
    : null;
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoImage = input.company.logoBytes
    ? await (input.company.logoIsPng ? pdfDoc.embedPng(input.company.logoBytes) : pdfDoc.embedJpg(input.company.logoBytes))
    : null;

  const page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function text(str: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' } = {}, atY?: number) {
    const font = opts.bold ? bold : regular;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    const drawX = opts.align === 'right' ? x - font.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: drawX, y: atY ?? y, size, font, color });
  }

  function box(x: number, boxY: number, w: number, h: number) {
    page.drawRectangle({ x, y: boxY, width: w, height: h, borderColor: rgb(0.7, 0.7, 0.74), borderWidth: 1 });
  }

  // ── Cheque face ──────────────────────────────────────────────────────
  const chequeTop = y;
  const chequeH = 220;
  box(MARGIN, chequeTop - chequeH, PAGE_W - MARGIN * 2, chequeH);

  // Company name/ABN sit to the RIGHT of the logo, not stacked under it --
  // both used to anchor at the exact same corner (MARGIN+16, chequeTop-16),
  // so a logo anywhere near its height cap (45pt) drew straight through the
  // name/ABN text. There's no per-document layout control on a cheque for
  // a user to fix that themselves.
  let nameX = MARGIN + 16;
  if (logoImage) {
    const scale = Math.min(120 / logoImage.width, 45 / logoImage.height, 1);
    const w = logoImage.width * scale, h = logoImage.height * scale;
    page.drawImage(logoImage, { x: MARGIN + 16, y: chequeTop - 16 - h, width: w, height: h });
    nameX = MARGIN + 16 + w + 12;
  }
  text(input.company.name, nameX, 13, { bold: true }, chequeTop - 24);
  if (input.company.abn) text(`ABN ${input.company.abn}`, nameX, 9, { color: [0.4, 0.4, 0.45] }, chequeTop - 38);

  text(`No. ${input.cheque.chequeNumber}`, PAGE_W - MARGIN - 16, 12, { bold: true, align: 'right' }, chequeTop - 24);
  text(formatDate(input.cheque.date), PAGE_W - MARGIN - 16, 11, { align: 'right' }, chequeTop - 40);

  text('PAY', MARGIN + 16, 9, { bold: true, color: [0.55, 0.55, 0.6] }, chequeTop - 80);
  text(input.cheque.payTo || '—', MARGIN + 16, 14, { bold: true }, chequeTop - 96);

  text('THE SUM OF', MARGIN + 16, 9, { bold: true, color: [0.55, 0.55, 0.6] }, chequeTop - 124);
  text(amountInWords(input.cheque.amount), MARGIN + 16, 11, {}, chequeTop - 140);

  text('AMOUNT', PAGE_W - MARGIN - 130, 9, { bold: true, color: [0.55, 0.55, 0.6] }, chequeTop - 124);
  box(PAGE_W - MARGIN - 130, chequeTop - 148, 114, 20);
  text(money(input.cheque.amount), PAGE_W - MARGIN - 24, 13, { bold: true, align: 'right' }, chequeTop - 142);

  if (matterText) text(`Matter: ${matterText}`, MARGIN + 16, 10, { color: [0.4, 0.4, 0.45] }, chequeTop - 172);
  if (input.cheque.memo) text(`Memo: ${input.cheque.memo}`, MARGIN + 16, 10, { color: [0.4, 0.4, 0.45] }, chequeTop - 186);

  page.drawLine({ start: { x: PAGE_W - MARGIN - 200, y: chequeTop - chequeH + 30 }, end: { x: PAGE_W - MARGIN - 16, y: chequeTop - chequeH + 30 }, thickness: 0.75, color: rgb(0.7, 0.7, 0.74) });
  text('Authorised signature', PAGE_W - MARGIN - 200, 8, { color: [0.6, 0.6, 0.64] }, chequeTop - chequeH + 18);

  // ── Remittance stub ───────────────────────────────────────────────────
  y = chequeTop - chequeH - 40;
  text('REMITTANCE ADVICE', MARGIN, 11, { bold: true }, y);
  y -= 20;
  text(`Cheque No. ${input.cheque.chequeNumber}`, MARGIN, 10, {}, y);
  text(formatDate(input.cheque.date), MARGIN + 200, 10, {}, y);
  y -= 16;
  text(`Pay to: ${input.cheque.payTo || '—'}`, MARGIN, 10, {}, y);
  y -= 16;
  if (matterText) { text(`Matter: ${matterText}`, MARGIN, 10, {}, y); y -= 16; }
  if (input.cheque.memo) { text(`Memo: ${input.cheque.memo}`, MARGIN, 10, {}, y); y -= 16; }
  y -= 8;
  text('Amount', MARGIN, 10, { bold: true }, y);
  text(money(input.cheque.amount), PAGE_W - MARGIN, 12, { bold: true, align: 'right' }, y);

  // Pagination logic in this file can leave a trailing or interstitial
  // page with nothing actually drawn on it (an off-by-one in a row-count
  // estimate, a section that turned out to have zero rows) -- caught here
  // rather than trusted not to happen.
  removeBlankPages(pdfDoc);
  return pdfDoc.save();
}
