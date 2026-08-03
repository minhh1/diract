// Builds a payment receipt PDF for one Receipts-ledger row (see
// supabase/migrations/20260730120000_receipts_ledger.sql) with pdf-lib --
// same primitives/letterhead conventions as generateInvoicePdf.ts, but a
// single fixed-layout page (no line-item tables, no per-template
// customization) since a receipt is a short confirmation, not a bill.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";

export interface GenerateReceiptPdfInput {
  company: { name: string; abn: string | null; address: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
  receipt: {
    receiptNumber: string;
    date: string | null;
    paymentMethod: string | null;
    bankReference: string | null;
    receivedBy: string | null;
    amountReceived: number;
    waivedAmount: number;
    waivedReason: string | null;
    balanceAfter: number;
  };
  invoice: {
    invoiceNumber: string;
    matterName: string | null;
    debtorNames: string[];
    totalIncGst: number;
    // Payments recorded against this invoice BEFORE this receipt -- i.e.
    // the invoice's current cumulative `payments` minus this receipt's own
    // amountReceived, so the "previously paid" line doesn't double-count.
    priorPaid: number;
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

export async function generateReceiptPdf(input: GenerateReceiptPdfInput): Promise<Uint8Array> {
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

  // ── Letterhead ─────────────────────────────────────────────────────
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
    if (input.company.abn) {
      text(`ABN ${input.company.abn}`, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] }, fy);
      fy -= 13;
      companyInfoH += 13;
    }
    if (input.company.address) {
      text(input.company.address, PAGE_W - MARGIN, 10, { align: 'right', color: [0.4, 0.4, 0.45] }, fy);
      fy -= 13;
      companyInfoH += 13;
    }
  }

  // ── Title + receipt meta ─────────────────────────────────────────────
  // Clearance driven by whichever block (logo or company name/ABN/address)
  // actually turned out taller -- not a fixed guess. There's no per-
  // document layout control here for a user to fix an overlap themselves.
  y -= Math.max(logoH, companyInfoH) + 24;
  text('RECEIPT', MARGIN, 20, { bold: true }, y);
  y -= 26;
  text(`Receipt No. ${input.receipt.receiptNumber}`, MARGIN, 11, {}, y);
  text(`Date: ${formatDate(input.receipt.date)}`, MARGIN + 260, 11, {}, y);
  y -= 16;
  text(`Invoice: ${input.invoice.invoiceNumber}`, MARGIN, 11, {}, y);
  if (input.invoice.matterName) text(`Matter: ${input.invoice.matterName}`, MARGIN + 260, 11, {}, y);

  // ── Received from ─────────────────────────────────────────────────
  y -= 40;
  text('RECEIVED FROM', MARGIN, 9, { bold: true, color: [0.55, 0.55, 0.6] }, y);
  y -= 14;
  const debtorLines = input.invoice.debtorNames.length ? input.invoice.debtorNames : ['—'];
  debtorLines.forEach(name => { text(name, MARGIN, 12, { bold: true }, y); y -= 14; });

  y -= 10;
  hr(y);
  y -= 24;

  // ── Payment detail ────────────────────────────────────────────────
  const labelX = MARGIN, valueX = PAGE_W - MARGIN;
  function row(label: string, value: string, opts: { bold?: boolean; color?: [number, number, number] } = {}) {
    text(label, labelX, 11, opts);
    text(value, valueX, 11, { align: 'right', ...opts });
    y -= 18;
  }
  row('Invoice total (inc. GST)', money(input.invoice.totalIncGst));
  if (input.invoice.priorPaid > 0.004) row('Previously paid', money(input.invoice.priorPaid));

  const methodSuffix = [input.receipt.paymentMethod, input.receipt.bankReference].filter(Boolean).join(', ref ');
  row(
    `Amount received this receipt${methodSuffix ? ` (${methodSuffix})` : ''}`,
    money(input.receipt.amountReceived),
    { bold: true }
  );

  if (input.receipt.waivedAmount > 0.004) {
    row(
      `Amount waived${input.receipt.waivedReason ? ` (${input.receipt.waivedReason})` : ''}`,
      money(input.receipt.waivedAmount)
    );
  }

  y -= 6;
  hr(y);
  y -= 20;
  row('Balance remaining', money(input.receipt.balanceAfter), { bold: true });

  y -= 30;
  if (input.receipt.receivedBy) {
    text(`Received by: ${input.receipt.receivedBy}`, MARGIN, 10, { color: [0.4, 0.4, 0.45] });
    y -= 16;
  }
  text('Computer-generated receipt. No signature required.', MARGIN, 9, { color: [0.6, 0.6, 0.64] });

  return pdfDoc.save();
}
