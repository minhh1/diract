// Builds a printable trust payment advice -- the "Open PDF payment detail
// now" output from TrustPaymentModal.tsx. Unlike generateTrustChequePdf.ts
// (a physical cheque face + stub), a Trust Payment covers Bank Transfer /
// Direct Debit / Bank Cheque / Trust Cheque alike, so this is a single
// payment-advice document: firm header, payment details, payee bank
// details (when EFT), matter/reason. internal_note is deliberately NOT
// included -- it's an office-only note, not client-facing.
//
// Same letterhead/layout conventions as generateTrustReceiptPdf.ts
// (logo + right-aligned company block, left-aligned title, two-column meta
// rows, a MATTER/AMOUNT table) so the two documents read as a matched
// pair -- this is the withdrawal-side counterpart of that deposit receipt.
import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface GenerateTrustPaymentPdfInput {
  company: { name: string; abn: string | null; address: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
  payment: {
    paymentNumber: string;
    date: string | null;
    payTo: string | null;
    payeeAddress: string | null;
    amount: number;
    paymentType: string | null;
    transferType: string | null;
    accountName: string | null;
    bsb: string | null;
    accountNumber: string | null;
    reason: string | null;
    matterNumber: string | null;
    matterName: string | null;
    trustAccountName: string | null;
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

  function hr(atY: number) {
    page.drawLine({ start: { x: MARGIN, y: atY }, end: { x: PAGE_W - MARGIN, y: atY }, thickness: 0.75, color: rgb(0.85, 0.85, 0.87) });
  }

  let logoH = 0;
  if (logoImage) {
    const scale = Math.min(160 / logoImage.width, 60 / logoImage.height, 1);
    const w = logoImage.width * scale, h = logoImage.height * scale;
    page.drawImage(logoImage, { x: MARGIN, y: y - h, width: w, height: h });
    logoH = h;
  }
  let companyInfoH = 20;
  {
    let fy = y;
    text(input.company.name, PAGE_W - MARGIN, 16, { bold: true, align: 'right' }, fy);
    fy -= 20;
    if (input.company.abn) { text(`ABN ${input.company.abn}`, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] }, fy); fy -= 13; companyInfoH += 13; }
    if (input.company.address) { text(input.company.address, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] }, fy); fy -= 13; companyInfoH += 13; }
  }

  // Clearance below the letterhead driven by whichever block (logo or
  // company name/ABN/address) actually turned out taller -- see
  // generateTrustReceiptPdf.ts's identical comment.
  y -= Math.max(logoH, companyInfoH) + 24;
  text('TRUST PAYMENT ADVICE', MARGIN, 20, { bold: true }, y);
  y -= 26;
  text(`Payment No. ${input.payment.paymentNumber}`, MARGIN, 11, {}, y);
  text(`Date: ${formatDate(input.payment.date)}`, MARGIN + 260, 11, {}, y);
  y -= 16;
  if (input.payment.trustAccountName) text(`Trust: ${input.payment.trustAccountName}`, MARGIN, 11, {}, y);
  if (input.payment.paymentType) text(`Method: ${input.payment.paymentType}${input.payment.transferType ? ` (${input.payment.transferType})` : ''}`, MARGIN + 260, 11, {}, y);

  y -= 40;
  text('PAID TO', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
  y -= 14;
  text(input.payment.payTo || '—', MARGIN, 12, { bold: true }, y);
  y -= 14;

  if (input.payment.payeeAddress) {
    text(input.payment.payeeAddress, MARGIN, 10, { color: [0.4, 0.4, 0.45] }, y);
    y -= 14;
  }

  if (input.payment.reason) {
    y -= 8;
    text(`Reason: ${input.payment.reason}`, MARGIN, 10, { color: [0.4, 0.4, 0.45] }, y);
    y -= 14;
  }

  y -= 10;
  hr(y);
  y -= 20;

  text('MATTER', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
  text('AMOUNT', PAGE_W - MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6], align: 'right' }, y);
  y -= 16;
  const matterText = input.payment.matterName
    ? (input.payment.matterNumber ? `${input.payment.matterNumber} - ${input.payment.matterName}` : input.payment.matterName)
    : '—';
  text(matterText, MARGIN, 11, {}, y);
  text(money(input.payment.amount), PAGE_W - MARGIN, 11, { align: 'right' }, y);
  y -= 16;

  y -= 6;
  hr(y);
  y -= 20;
  text('Total', MARGIN, 12, { bold: true }, y);
  text(money(input.payment.amount), PAGE_W - MARGIN, 12, { bold: true, align: 'right' }, y);
  y -= 40;

  if (input.payment.accountName || input.payment.bsb || input.payment.accountNumber) {
    text('PAYEE BANK DETAILS', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
    y -= 14;
    const details = [
      input.payment.accountName ? `Account Name: ${input.payment.accountName}` : null,
      input.payment.bsb ? `BSB: ${input.payment.bsb}` : null,
      input.payment.accountNumber ? `Account Number: ${input.payment.accountNumber}` : null,
    ].filter(Boolean).join('   ');
    text(details, MARGIN, 10, { color: [0.4, 0.4, 0.45] }, y);
  }

  return pdfDoc.save();
}
