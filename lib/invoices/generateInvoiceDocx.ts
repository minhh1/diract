// Builds a .docx version of the FLEXIBLE invoice template's content (same
// numbers/fields as generateInvoicePdf.ts, a plain single-document layout --
// not an attempt to replicate the Detailed style's 4-page structure in Word
// form too, see the plan). Uses the `docx` npm package to build the OOXML
// programmatically from this data, the same way pdf-lib is used for the PDF
// -- chosen over this app's existing docxtemplater/pizzip path (used by
// Precedents) because that path only ever fills merge tags into an
// ADMIN-UPLOADED .docx template with flat scalar values; invoices have no
// uploaded template, and repeating table rows (fee/disbursement lines) would
// need docxtemplater loop syntax this codebase has never used before.
import { PDFDocument } from "pdf-lib";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, ImageRun, VerticalAlign,
} from "docx";
import type { GenerateInvoicePdfInput } from "./generateInvoicePdf";

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: 'CCCCCC' };
const cellBorders = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function p(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; color?: string } = {}) {
  return new Paragraph({
    alignment: opts.align,
    children: [new TextRun({ text, bold: opts.bold, size: (opts.size ?? 10) * 2, color: opts.color })],
  });
}

function cell(text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; width?: number; shade?: string } = {}) {
  return new TableCell({
    borders: cellBorders,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.shade ? { fill: opts.shade } : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [p(text, { bold: opts.bold, size: 9, align: opts.align })],
  });
}

export async function generateInvoiceDocx(input: GenerateInvoicePdfInput): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];

  // Logo -- reuses pdf-lib (already a dependency) just to read the image's
  // native pixel dimensions for aspect-correct scaling, same as the PDF
  // renderer does with pdfDoc.embedPng/embedJpg -- `docx`'s ImageRun has no
  // dimension-reading of its own, it just stretches to whatever
  // transformation.width/height you give it.
  if (input.company.logoBytes) {
    try {
      const probe = await PDFDocument.create();
      const img = input.company.logoIsPng ? await probe.embedPng(input.company.logoBytes) : await probe.embedJpg(input.company.logoBytes);
      const maxW = 160, maxH = 60;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      children.push(new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new ImageRun({
          data: input.company.logoBytes, transformation: { width: img.width * scale, height: img.height * scale },
          type: input.company.logoIsPng ? 'png' : 'jpg',
        })],
      }));
    } catch {
      // A malformed/unreadable logo shouldn't block generating the rest of the document.
    }
  }

  children.push(p(input.company.name, { bold: true, size: 16, align: AlignmentType.RIGHT }));
  if (input.company.abn) children.push(p(`ABN ${input.company.abn}`, { size: 9, color: '666666', align: AlignmentType.RIGHT }));
  if (input.company.address) children.push(p(input.company.address, { size: 9, color: '666666', align: AlignmentType.RIGHT }));
  children.push(p(''));

  children.push(p('TAX INVOICE', { bold: true, size: 18 }));
  children.push(p(`Invoice number: ${input.invoice.invoiceNumber}    Issue date: ${formatDate(input.invoice.issueDate)}`, { size: 10 }));
  if (input.display.showDueDate && input.invoice.dueDate) children.push(p(`Due date: ${formatDate(input.invoice.dueDate)}`, { size: 10 }));
  if (input.invoice.matterName) children.push(p(`Matter: ${input.invoice.matterName}`, { size: 10 }));
  children.push(p(''));

  children.push(p('BILL TO', { bold: true, size: 8, color: '888888' }));
  // One or more debtors (e.g. joint purchasers) -- each its own paragraph
  // with a blank line between them. Word reflows naturally, unlike the
  // fixed-position pdf-lib renderers, so this is just N paragraphs.
  const debtorLines = input.invoice.debtorNames.length ? input.invoice.debtorNames : ['-'];
  debtorLines.forEach((name, i) => {
    children.push(p(name, { bold: true, size: 11 }));
    if (i < debtorLines.length - 1) children.push(p(''));
  });
  children.push(p(''));

  // Professional fees table -- same column set/toggles as generateInvoicePdf.ts.
  if (input.feeLines.length) {
    children.push(p('PROFESSIONAL FEES', { bold: true, size: 10 }));
    const cols: { key: string; header: string; width: number; align?: typeof AlignmentType.RIGHT }[] = [
      { key: 'date', header: 'Date', width: 12 },
    ];
    if (input.display.showStaffInitials) cols.push({ key: 'staff', header: 'Staff', width: 8 });
    if (input.display.showLineDescriptions) cols.push({ key: 'desc', header: 'Description', width: 40 });
    if (input.display.showRatePerLine) cols.push({ key: 'rate', header: 'Rate', width: 10, align: AlignmentType.RIGHT });
    if (input.display.showHoursPerLine) cols.push({ key: 'hours', header: 'Hours', width: 10, align: AlignmentType.RIGHT });
    if (input.display.showAmountAndGstPerLine) {
      cols.push({ key: 'gst', header: 'GST', width: 10, align: AlignmentType.RIGHT });
      cols.push({ key: 'amount', header: 'Amount', width: 10, align: AlignmentType.RIGHT });
    }
    const valueFor = (l: GenerateInvoicePdfInput['feeLines'][number], key: string) => {
      switch (key) {
        case 'date': return formatDate(l.date);
        case 'staff': return l.staffInitials || '';
        case 'desc': return l.description || '';
        case 'rate': return l.rate != null ? money(l.rate) : '';
        case 'hours': return l.isFixedFee ? 'Fixed Fee' : (l.hours != null ? l.hours.toFixed(2) : '');
        case 'gst': return money(l.gstAmount);
        case 'amount': return money(l.billedAmount);
        default: return '';
      }
    };
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: cols.map(c => cell(c.header, { bold: true, align: c.align, width: c.width, shade: 'EEEEEE' })) }),
        ...input.feeLines.map(l => new TableRow({ children: cols.map(c => cell(valueFor(l, c.key), { align: c.align, width: c.width })) })),
      ],
    }));
    if (input.display.showFeeSubtotal) {
      const feesTotal = input.feeLines.reduce((s, l) => s + l.billedAmount, 0);
      children.push(p(`Fees subtotal: ${money(feesTotal)}`, { bold: true, size: 10, align: AlignmentType.RIGHT }));
    }
    children.push(p(''));
  }

  // Disbursements table.
  if (input.disbursementLines.length) {
    children.push(p('DISBURSEMENTS', { bold: true, size: 10 }));
    const cols: { key: string; header: string; width: number; align?: typeof AlignmentType.RIGHT }[] = [
      { key: 'date', header: 'Date', width: 15 },
      { key: 'desc', header: 'Description', width: input.display.showAmountAndGstPerLine ? 55 : 85 },
    ];
    if (input.display.showAmountAndGstPerLine) cols.push({ key: 'gst', header: 'GST', width: 15, align: AlignmentType.RIGHT });
    cols.push({ key: 'amount', header: 'Amount', width: 15, align: AlignmentType.RIGHT });
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: cols.map(c => cell(c.header, { bold: true, align: c.align, width: c.width, shade: 'EEEEEE' })) }),
        ...input.disbursementLines.map(l => new TableRow({
          children: cols.map(c => cell(
            c.key === 'date' ? formatDate(l.date) : c.key === 'desc' ? (l.description || '') : c.key === 'gst' ? money(l.gstAmount) : money(l.amount),
            { align: c.align, width: c.width }
          )),
        })),
      ],
    }));
    if (input.display.showDisbursementSubtotal) {
      const disbTotal = input.disbursementLines.reduce((s, l) => s + l.amount, 0);
      children.push(p(`Disbursements subtotal: ${money(disbTotal)}`, { bold: true, size: 10, align: AlignmentType.RIGHT }));
    }
    children.push(p(''));
  }

  // Totals.
  const totalRow = (label: string, value: number, bold = false) => p(`${label}: ${money(value)}`, { bold, size: 11, align: AlignmentType.RIGHT });
  if (input.display.showPriorBalance && input.invoice.priorBalance) children.push(totalRow('Opening balance', input.invoice.priorBalance));
  children.push(totalRow('Subtotal (ex. GST)', input.invoice.subtotal));
  children.push(totalRow('GST', input.invoice.gst));
  children.push(totalRow('Total (inc. GST)', input.invoice.totalIncGst, true));
  if (input.display.showPaymentSummary) {
    if (input.invoice.trustApplied) children.push(totalRow('Trust funds applied', -input.invoice.trustApplied));
    if (input.invoice.payments) children.push(totalRow('Payments received', -input.invoice.payments));
    if (input.invoice.waivedAmount) children.push(totalRow('Amount waived', -input.invoice.waivedAmount));
    children.push(totalRow('Amount due', input.invoice.amountDue, true));
  }
  children.push(p(''));

  // Terms / footer.
  if (input.creditTerms) children.push(p(input.creditTerms, { size: 9, color: '666666' }));
  if (input.bankDetails && (input.bankDetails.accountName || input.bankDetails.bsb || input.bankDetails.accountNumber)) {
    const parts = [
      input.bankDetails.accountName && `Account name: ${input.bankDetails.accountName}`,
      input.bankDetails.bsb && `BSB: ${input.bankDetails.bsb}`,
      input.bankDetails.accountNumber && `Account: ${input.bankDetails.accountNumber}`,
      input.bankDetails.reference && `Reference: ${input.bankDetails.reference}`,
    ].filter(Boolean).join('   ·   ');
    children.push(p(parts as string, { size: 9, color: '666666' }));
  }
  if (input.otherTerms) children.push(p(input.otherTerms, { size: 9, color: '666666' }));
  children.push(p(
    'You have the right to request an itemised bill and to have this bill assessed under applicable legal costs legislation. Any request must be made within the time limits set out in that legislation.',
    { size: 8, color: '999999' }
  ));

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
