// Builds a printable trust payment advice -- the "Open PDF payment detail
// now" output from TrustPaymentModal.tsx. Unlike generateTrustChequePdf.ts
// (a physical cheque face + stub), a Trust Payment covers Bank Transfer /
// Direct Debit / Bank Cheque / Trust Cheque alike, so this is a single
// payment-advice document: firm header, payment details, payee bank
// details (when EFT), matter/reason. internal_note is deliberately NOT
// included -- it's an office-only note, not client-facing.
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface GenerateTrustPaymentPdfInput {
  company: { name: string; abn: string | null; address: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
  payment: {
    paymentNumber: string;
    date: string | null;
    payTo: string | null;
    amount: number;
    paymentType: string | null;
    transferType: string | null;
    accountName: string | null;
    bsb: string | null;
    accountNumber: string | null;
    reason: string | null;
    matterName: string | null;
    trustAccountName: string | null;
  };
}

const PAGE_W = 595.28, PAGE_H = 841.89; // A4 portrait -- a fixed-format payment advice, same as the cheque/receipt
const MARGIN = 50;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}
function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

export async function generateTrustPaymentPdf(input: GenerateTrustPaymentPdfInput): Promise<Uint8Array> {
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

  if (logoImage) {
    const scale = Math.min(120 / logoImage.width, 45 / logoImage.height, 1);
    page.drawImage(logoImage, { x: MARGIN, y: y - logoImage.height * scale, width: logoImage.width * scale, height: logoImage.height * scale });
    y -= (logoImage.height * scale) + 14;
  }
  text(input.company.name, MARGIN, 14, { bold: true }, y); y -= 16;
  if (input.company.abn) { text(`ABN ${input.company.abn}`, MARGIN, 9, { color: [0.4, 0.4, 0.45] }, y); y -= 12; }
  if (input.company.address) { text(input.company.address, MARGIN, 9, { color: [0.4, 0.4, 0.45] }, y); y -= 12; }
  y -= 10;

  text('TRUST PAYMENT ADVICE', PAGE_W / 2, 16, { bold: true, align: undefined }, y);
  page.drawLine({ start: { x: MARGIN, y: y - 8 }, end: { x: PAGE_W - MARGIN, y: y - 8 }, thickness: 1, color: rgb(0.15, 0.45, 0.4) });
  y -= 34;

  text(`Payment No. ${input.payment.paymentNumber}`, MARGIN, 11, { bold: true }, y);
  text(formatDate(input.payment.date), PAGE_W - MARGIN, 11, { align: 'right' }, y);
  y -= 22;

  if (input.payment.trustAccountName) { text(`Trust Account: ${input.payment.trustAccountName}`, MARGIN, 10, { color: [0.4, 0.4, 0.45] }, y); y -= 16; }
  if (input.payment.matterName) { text(`Matter: ${input.payment.matterName}`, MARGIN, 10, { color: [0.4, 0.4, 0.45] }, y); y -= 16; }
  y -= 10;

  text('PAID TO', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y); y -= 15;
  text(input.payment.payTo || '—', MARGIN, 13, { bold: true }, y); y -= 26;

  text('AMOUNT', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y); y -= 16;
  text(money(input.payment.amount), MARGIN, 16, { bold: true }, y); y -= 28;

  text('PAYMENT TYPE', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
  text(input.payment.paymentType || '—', MARGIN + 300, 9, {}, y);
  y -= 16;
  if (input.payment.transferType) {
    text('TRANSFER TYPE', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
    text(input.payment.transferType, MARGIN + 300, 9, {}, y);
    y -= 16;
  }
  y -= 8;

  if (input.payment.accountName || input.payment.bsb || input.payment.accountNumber) {
    text('PAYEE BANK DETAILS', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y); y -= 15;
    if (input.payment.accountName) { text(`Account Name: ${input.payment.accountName}`, MARGIN, 10, {}, y); y -= 15; }
    if (input.payment.bsb) { text(`BSB: ${input.payment.bsb}`, MARGIN, 10, {}, y); y -= 15; }
    if (input.payment.accountNumber) { text(`Account Number: ${input.payment.accountNumber}`, MARGIN, 10, {}, y); y -= 15; }
    y -= 8;
  }

  if (input.payment.reason) {
    text('REASON', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y); y -= 15;
    text(input.payment.reason, MARGIN, 10, {}, y); y -= 20;
  }

  page.drawLine({ start: { x: MARGIN, y: MARGIN + 60 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 60 }, thickness: 0.75, color: rgb(0.85, 0.85, 0.87) });
  text('This is a payment advice for trust accounting records -- not a negotiable instrument.', MARGIN, 8, { color: [0.55, 0.55, 0.6] }, MARGIN + 40);

  return pdfDoc.save();
}
