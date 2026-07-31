// Builds a trust receipt PDF -- mirrors lib/invoices/generateReceiptPdf.ts's
// letterhead/layout conventions exactly, but sourced from Trust Transactions
// (receipt_number series "TR-", distinct from the operating-account
// Receipts table's "OA-" series) and able to list several matters under one
// receipt number (DepositFundsModal.tsx's shared-receipt multi-matter split).
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface GenerateTrustReceiptPdfInput {
  company: { name: string; abn: string | null; address: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
  receipt: {
    receiptNumber: string;
    date: string | null;
    paymentMethod: string | null;
    payorPayee: string | null;
    purpose: string | null;
    trustAccountName: string | null;
    isDeposit: boolean;
  };
  lines: { matterName: string; amount: number }[];
  total: number;
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

export async function generateTrustReceiptPdf(input: GenerateTrustReceiptPdfInput): Promise<Uint8Array> {
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

  function hr(atY: number) {
    page.drawLine({ start: { x: MARGIN, y: atY }, end: { x: PAGE_W - MARGIN, y: atY }, thickness: 0.75, color: rgb(0.85, 0.85, 0.87) });
  }

  if (logoImage) {
    const scale = Math.min(160 / logoImage.width, 60 / logoImage.height, 1);
    const w = logoImage.width * scale, h = logoImage.height * scale;
    page.drawImage(logoImage, { x: MARGIN, y: y - h, width: w, height: h });
  }
  {
    let fy = y;
    text(input.company.name, PAGE_W - MARGIN, 16, { bold: true, align: 'right' }, fy);
    fy -= 20;
    if (input.company.abn) { text(`ABN ${input.company.abn}`, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] }, fy); fy -= 13; }
    if (input.company.address) { text(input.company.address, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] }, fy); fy -= 13; }
  }

  y -= 66;
  text('TRUST RECEIPT', MARGIN, 20, { bold: true }, y);
  y -= 26;
  text(`Receipt No. ${input.receipt.receiptNumber}`, MARGIN, 11, {}, y);
  text(`Date: ${formatDate(input.receipt.date)}`, MARGIN + 260, 11, {}, y);
  y -= 16;
  if (input.receipt.trustAccountName) text(`Trust: ${input.receipt.trustAccountName}`, MARGIN, 11, {}, y);
  if (input.receipt.paymentMethod) text(`Method: ${input.receipt.paymentMethod}`, MARGIN + 260, 11, {}, y);

  y -= 40;
  text(input.receipt.isDeposit ? 'RECEIVED FROM' : 'PAID TO', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
  y -= 14;
  text(input.receipt.payorPayee || '—', MARGIN, 12, { bold: true }, y);
  y -= 14;

  if (input.receipt.purpose) {
    y -= 8;
    text(`Purpose: ${input.receipt.purpose}`, MARGIN, 10, { color: [0.4, 0.4, 0.45] }, y);
    y -= 14;
  }

  y -= 10;
  hr(y);
  y -= 20;

  text('MATTER', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
  text('AMOUNT', PAGE_W - MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6], align: 'right' }, y);
  y -= 16;
  for (const line of input.lines) {
    text(line.matterName, MARGIN, 11, {}, y);
    text(money(line.amount), PAGE_W - MARGIN, 11, { align: 'right' }, y);
    y -= 16;
  }

  y -= 6;
  hr(y);
  y -= 20;
  text('Total', MARGIN, 12, { bold: true }, y);
  text(money(input.total), PAGE_W - MARGIN, 12, { bold: true, align: 'right' }, y);

  y -= 40;
  text('Computer-generated receipt. No signature required.', MARGIN, 9, { color: [0.6, 0.6, 0.64] }, y);

  return pdfDoc.save();
}
