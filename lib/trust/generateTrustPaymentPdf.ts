// Builds a printable trust payment advice -- the "Open PDF payment detail
// now" output from TrustPaymentModal.tsx. Unlike generateTrustChequePdf.ts
// (a physical cheque face + stub), a Trust Payment covers Bank Transfer /
// Direct Debit / Bank Cheque / Trust Cheque alike, so this is a single
// payment-advice document: firm header, payment details, payee bank
// details (when EFT), matter/reason. internal_note is deliberately NOT
// included -- it's an office-only note, not client-facing.
//
// Layout is deliberately plain: everything left-aligned in a single column
// (no tab stops/second column for values), one consistent 10pt body size
// throughout, with only the firm name and the "TRUST PAYMENT ADVICE" title
// set larger. "Arial" isn't one of pdf-lib's embeddable standard fonts (no
// font file to embed) -- Helvetica is the metrically-compatible standard
// substitute and what every other trust PDF in this app already uses.
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
    matterNumber: string | null;
    matterName: string | null;
    trustAccountName: string | null;
  };
}

const PAGE_W = 595.28, PAGE_H = 841.89; // A4 portrait -- a fixed-format payment advice, same as the cheque/receipt
const MARGIN = 50;
const BODY_SIZE = 10; // every line except the firm name and title

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

  // Always drawn from x -- no align option, since nothing on this page is
  // ever right-aligned or tabbed to a second column.
  function text(str: string, size: number, opts: { bold?: boolean; color?: [number, number, number] } = {}, atY?: number) {
    const font = opts.bold ? bold : regular;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    page.drawText(str, { x: MARGIN, y: atY ?? y, size, font, color });
  }
  function line(str: string, opts: { bold?: boolean; color?: [number, number, number] } = {}) {
    text(str, BODY_SIZE, opts, y);
    y -= 16;
  }
  function label(str: string) {
    line(str, { bold: true, color: [0.55, 0.55, 0.6] });
  }

  if (logoImage) {
    const scale = Math.min(120 / logoImage.width, 45 / logoImage.height, 1);
    page.drawImage(logoImage, { x: MARGIN, y: y - logoImage.height * scale, width: logoImage.width * scale, height: logoImage.height * scale });
    y -= (logoImage.height * scale) + 14;
  }
  text(input.company.name, 14, { bold: true }, y); y -= 16;
  if (input.company.abn) { text(`ABN ${input.company.abn}`, BODY_SIZE, { color: [0.4, 0.4, 0.45] }, y); y -= 14; }
  if (input.company.address) { text(input.company.address, BODY_SIZE, { color: [0.4, 0.4, 0.45] }, y); y -= 14; }
  y -= 10;

  text('TRUST PAYMENT ADVICE', 16, { bold: true }, y);
  page.drawLine({ start: { x: MARGIN, y: y - 8 }, end: { x: PAGE_W - MARGIN, y: y - 8 }, thickness: 1, color: rgb(0.15, 0.45, 0.4) });
  y -= 34;

  line(`Payment No. ${input.payment.paymentNumber}`, { bold: true });
  line(formatDate(input.payment.date));
  if (input.payment.trustAccountName) line(`Trust Account: ${input.payment.trustAccountName}`, { color: [0.4, 0.4, 0.45] });
  if (input.payment.matterName) {
    const matterText = input.payment.matterNumber ? `${input.payment.matterNumber} - ${input.payment.matterName}` : input.payment.matterName;
    line(`Matter: ${matterText}`, { color: [0.4, 0.4, 0.45] });
  }
  y -= 10;

  label('PAID TO');
  line(input.payment.payTo || '—', { bold: true });
  y -= 10;

  label('AMOUNT');
  line(money(input.payment.amount), { bold: true });
  y -= 10;

  label('PAYMENT TYPE');
  line(input.payment.paymentType || '—');
  if (input.payment.transferType) {
    label('TRANSFER TYPE');
    line(input.payment.transferType);
  }
  y -= 6;

  if (input.payment.accountName || input.payment.bsb || input.payment.accountNumber) {
    label('PAYEE BANK DETAILS');
    if (input.payment.accountName) line(`Account Name: ${input.payment.accountName}`);
    if (input.payment.bsb) line(`BSB: ${input.payment.bsb}`);
    if (input.payment.accountNumber) line(`Account Number: ${input.payment.accountNumber}`);
    y -= 6;
  }

  if (input.payment.reason) {
    label('REASON');
    line(input.payment.reason);
  }

  return pdfDoc.save();
}
