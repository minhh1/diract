// Builds the "Detailed" invoice template -- a fixed, multi-page law-firm
// style (page 1: header + a Fees/GST/Total summary table + a disbursements
// summary split into GST-applicable vs GST-exempt + payment terms; pages
// 2+: itemised Professional Fees / Summary Fees by Lawyer / Disbursements
// bordered tables; final page: a remittance-advice payment slip + a notice
// of rights) -- modelled on a real reference invoice the user supplied.
// Deliberately a SEPARATE renderer from generateInvoicePdf.ts (the
// flexible, layout-editable template) rather than a mode inside it: the
// two structures don't share enough (fixed multi-page sections vs one
// flowing page with draggable anchors) to unify without contorting the
// flexible one. Does not use InvoiceLayout at all -- see
// InvoiceTemplateSettingsTab.tsx, which hides the layout editor/presets for
// a template with `style: 'detailed'`.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { GenerateInvoicePdfInput } from "./generateInvoicePdf";

const PAGE_W = 595.28, PAGE_H = 841.89; // A4, points
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null | undefined, style: 'short' | 'long' = 'short'): string {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('en-AU', style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

interface Column { header: string; width: number; align?: 'left' | 'right' }

// Generic bordered table with wrapped, dynamic-height rows and page-break
// support (redraws the header row on a new page) -- renders every bordered
// table in this file (page 1's two summary tables, the appendix's three
// itemised tables). `rows`/`opts.totalsValue` are pre-formatted strings,
// not numbers -- this helper only lays out and draws, callers own the
// number formatting/aggregation.
function drawBorderedTable(
  pdfDoc: PDFDocument, startPage: PDFPage, startY: number, xStart: number,
  columns: Column[], rows: string[][], font: PDFFont, bold: PDFFont,
  opts: { title?: string; totalsLabel?: string; totalsValue?: string } = {}
): { page: PDFPage; y: number } {
  let page = startPage, y = startY;
  const PAD = 6, ROW_SIZE = 9, HEADER_SIZE = 9, LINE_H = 11, MIN_Y = 70;
  const tableWidth = columns.reduce((s, c) => s + c.width, 0);
  const colX = (i: number) => xStart + columns.slice(0, i).reduce((s, c) => s + c.width, 0);

  function ensureRoom(needed: number): boolean {
    if (y - needed < MIN_Y) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - MARGIN; return true; }
    return false;
  }

  function cellText(str: string, x: number, yy: number, size: number, f: PDFFont, align: 'left' | 'right' | undefined, width: number) {
    const tx = align === 'right' ? x + width - PAD - f.widthOfTextAtSize(str, size) : x + PAD;
    page.drawText(str, { x: tx, y: yy, size, font: f, color: rgb(0.15, 0.15, 0.18) });
  }

  function drawHeaderRow() {
    const h = LINE_H + PAD * 2;
    page.drawRectangle({ x: xStart, y: y - h, width: tableWidth, height: h, color: rgb(0.93, 0.93, 0.95) });
    columns.forEach((c, i) => {
      const cx = colX(i);
      page.drawRectangle({ x: cx, y: y - h, width: c.width, height: h, borderColor: rgb(0.6, 0.6, 0.65), borderWidth: 0.5 });
      cellText(c.header, cx, y - PAD - 9, HEADER_SIZE, bold, c.align, c.width);
    });
    y -= h;
  }

  if (opts.title) {
    ensureRoom(40);
    const h = LINE_H + PAD * 2;
    page.drawRectangle({ x: xStart, y: y - h, width: tableWidth, height: h, borderColor: rgb(0.6, 0.6, 0.65), borderWidth: 0.5 });
    page.drawText(opts.title, { x: xStart + PAD, y: y - PAD - 9, size: 10, font: bold, color: rgb(0.1, 0.1, 0.12) });
    y -= h;
  }

  ensureRoom(40);
  drawHeaderRow();

  for (const row of rows) {
    const wrapped = row.map((cell, i) => wrapText(cell, font, ROW_SIZE, columns[i].width - PAD * 2));
    const lines = Math.max(1, ...wrapped.map(w => w.length));
    const rowH = lines * LINE_H + PAD * 2;
    if (ensureRoom(rowH)) drawHeaderRow();
    columns.forEach((c, i) => {
      const cx = colX(i);
      page.drawRectangle({ x: cx, y: y - rowH, width: c.width, height: rowH, borderColor: rgb(0.75, 0.75, 0.8), borderWidth: 0.5 });
      wrapped[i].forEach((line, li) => cellText(line, cx, y - PAD - 9 - li * LINE_H, ROW_SIZE, font, c.align, c.width));
    });
    y -= rowH;
  }

  if (opts.totalsLabel) {
    ensureRoom(30);
    const h = LINE_H + PAD * 2;
    page.drawRectangle({ x: xStart, y: y - h, width: tableWidth, height: h, borderColor: rgb(0.6, 0.6, 0.65), borderWidth: 0.5 });
    page.drawText(opts.totalsLabel, { x: xStart + PAD, y: y - PAD - 9, size: 10, font: bold, color: rgb(0.1, 0.1, 0.12) });
    if (opts.totalsValue) {
      const tx = xStart + tableWidth - PAD - bold.widthOfTextAtSize(opts.totalsValue, 10);
      page.drawText(opts.totalsValue, { x: tx, y: y - PAD - 9, size: 10, font: bold, color: rgb(0.1, 0.1, 0.12) });
    }
    y -= h;
  }

  return { page, y: y - 10 };
}

export async function generateDetailedInvoicePdf(input: GenerateInvoicePdfInput): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const logoImage = input.company.logoBytes
    ? await (input.company.logoIsPng ? pdfDoc.embedPng(input.company.logoBytes) : pdfDoc.embedJpg(input.company.logoBytes))
    : null;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  function text(str: string, x: number, size: number, opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center' } = {}, atY?: number) {
    const font = opts.bold ? bold : regular;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    const w = font.widthOfTextAtSize(str, size);
    const drawX = opts.align === 'right' ? x - w : opts.align === 'center' ? x - w / 2 : x;
    page.drawText(str, { x: drawX, y: atY ?? y, size, font, color });
  }
  function hr(atY: number) {
    page.drawLine({ start: { x: MARGIN, y: atY }, end: { x: PAGE_W - MARGIN, y: atY }, thickness: 0.75, color: rgb(0.85, 0.85, 0.87) });
  }

  // ── Page 1: letterhead ────────────────────────────────────────────
  if (logoImage) {
    const maxW = 150, maxH = 55;
    const scale = Math.min(maxW / logoImage.width, maxH / logoImage.height, 1);
    page.drawImage(logoImage, { x: MARGIN, y: y - logoImage.height * scale, width: logoImage.width * scale, height: logoImage.height * scale });
  }
  text(input.company.name, PAGE_W - MARGIN, 15, { bold: true, align: 'right' });
  y -= 18;
  if (input.company.abn) { text(`ABN ${input.company.abn}`, PAGE_W - MARGIN, 9, { align: 'right', color: [0.4, 0.4, 0.45] }); y -= 12; }
  y -= 24;

  text(`Tax Invoice No: ${input.invoice.invoiceNumber}`, PAGE_W / 2, 16, { bold: true, align: 'center' });
  y -= 28;

  // Left: debtor name. Right: issue date / our ref / your ref, label+value.
  text(input.invoice.debtorName || '—', MARGIN, 11);
  const metaX = MARGIN + 260, metaValueX = metaX + 90;
  text('Date of Issue:', metaX, 10);
  text(formatDate(input.invoice.issueDate), metaValueX, 10, { bold: true });
  y -= 14;
  text('Our Reference:', metaX, 10);
  text(input.invoice.ourReference || '', metaValueX, 10, { bold: true });
  y -= 14;
  text('Your Reference:', metaX, 10);
  text(input.invoice.yourReference || '', metaValueX, 10, { bold: true });
  y -= 22;

  if (input.invoice.responsiblePartnerName) {
    text('Responsible Partner:', MARGIN, 10, { bold: true });
    text(input.invoice.responsiblePartnerName, MARGIN + 120, 10);
    y -= 20;
  }
  if (input.invoice.matterName) {
    text(`RE: ${input.invoice.matterName}`, MARGIN, 11, { bold: true });
    y -= 4; hr(y); y -= 16;
  }
  text(`For Professional Services to ${formatDate(input.invoice.periodEnd || input.invoice.issueDate)}`, MARGIN, 10, { color: [0.3, 0.3, 0.34] });
  y -= 26;

  // ── Fees summary table ───────────────────────────────────────────
  if (input.feeLines.length) {
    const feesExGst = input.feeLines.reduce((s, l) => s + l.billedAmount, 0);
    const feesGst = input.feeLines.reduce((s, l) => s + l.gstAmount, 0);
    ({ page, y } = drawBorderedTable(
      pdfDoc, page, y, MARGIN,
      [
        { header: '', width: CONTENT_W - 100 * 3 },
        { header: 'Fees', width: 100, align: 'right' },
        { header: 'GST', width: 100, align: 'right' },
        { header: 'Total', width: 100, align: 'right' },
      ],
      [['Professional Services Rendered', money(feesExGst), money(feesGst), money(feesExGst + feesGst)]],
      regular, bold,
      { totalsLabel: 'Total Professional Fees Rendered', totalsValue: money(feesExGst + feesGst) }
    ));
    y -= 10;
  }

  // ── Disbursements summary, split by GST status ───────────────────
  if (input.disbursementLines.length) {
    const withGst = input.disbursementLines.filter(l => l.gstStatus !== 'GST Free');
    const exempt = input.disbursementLines.filter(l => l.gstStatus === 'GST Free');
    const sum = (lines: typeof input.disbursementLines) => ({
      amount: lines.reduce((s, l) => s + l.amount, 0), gst: lines.reduce((s, l) => s + l.gstAmount, 0),
    });
    const withGstSum = sum(withGst), exemptSum = sum(exempt);
    const rows: string[][] = [];
    if (withGst.length) rows.push(['Disbursements with GST', money(withGstSum.amount), money(withGstSum.gst), money(withGstSum.amount + withGstSum.gst)]);
    if (exempt.length) rows.push(['Disbursements Exempt from GST', money(exemptSum.amount), money(exemptSum.gst), money(exemptSum.amount + exemptSum.gst)]);
    const totalDisb = withGstSum.amount + withGstSum.gst + exemptSum.amount + exemptSum.gst;
    ({ page, y } = drawBorderedTable(
      pdfDoc, page, y, MARGIN,
      [
        { header: '', width: CONTENT_W - 100 * 3 },
        { header: 'Disb', width: 100, align: 'right' },
        { header: 'GST', width: 100, align: 'right' },
        { header: 'Total', width: 100, align: 'right' },
      ],
      rows, regular, bold,
      { totalsLabel: 'Total Disbursements Rendered', totalsValue: money(totalDisb) }
    ));
    y -= 10;
  }

  function totalLine(label: string, value: string, boldLine = false) {
    text(label, PAGE_W - MARGIN - 220, 11, { bold: boldLine });
    text(value, PAGE_W - MARGIN, 11, { align: 'right', bold: boldLine });
    y -= 18;
  }
  totalLine('Total Amount of GST', money(input.invoice.gst));
  y -= 4;
  totalLine('Total Tax Invoice Amount Due', money(input.invoice.totalIncGst), true);
  y -= 16;

  const days = input.invoice.paymentTermsDays ?? 14;
  for (const line of wrapText(
    `This account is due and payable within ${days} days. If you do not pay within 30 days of the date of this account, we may charge interest on the unpaid amount at the rate that is equal to the maximum percentage specified by the Reserve Bank of Australia as the Cash Rate Target as at the date this account was issued, plus 2%.`,
    regular, 9, CONTENT_W
  )) { text(line, MARGIN, 9, { color: [0.35, 0.35, 0.4] }); y -= 12; }
  y -= 16;
  text('With Compliments', MARGIN, 10); y -= 30;
  text('Yours faithfully', MARGIN, 10); y -= 16;
  text(input.company.name, MARGIN, 11, { bold: true });

  // ── Pages 2+: itemised appendix ───────────────────────────────────
  page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  y = PAGE_H - MARGIN;

  if (input.feeLines.length) {
    const feesTotal = input.feeLines.reduce((s, l) => s + l.billedAmount, 0);
    ({ page, y } = drawBorderedTable(
      pdfDoc, page, y, MARGIN,
      [
        { header: 'Date', width: 65 },
        { header: 'Narrative', width: CONTENT_W - (65 + 45 + 45 + 75) },
        { header: 'Initials', width: 45 },
        { header: 'Hours', width: 45, align: 'right' },
        { header: 'Amount ($)', width: 75, align: 'right' },
      ],
      input.feeLines.map(l => [formatDate(l.date), l.description || '', l.staffInitials || '', (l.hours ?? 0).toFixed(2), money(l.billedAmount)]),
      regular, bold,
      { title: 'Professional Fees', totalsLabel: 'Total Professional Fees Rendered', totalsValue: money(feesTotal) }
    ));
    y -= 14;

    // Summary Fees by Lawyer -- group fee lines by staffName.
    const byLawyer = new Map<string, { initials: string; position: string; rate: number; hours: number; amount: number }>();
    for (const l of input.feeLines) {
      const key = l.staffName || l.staffInitials || 'Unknown';
      const entry = byLawyer.get(key) || { initials: l.staffInitials || '', position: l.staffPosition || '', rate: l.rate ?? 0, hours: 0, amount: 0 };
      entry.hours += l.hours ?? 0;
      entry.amount += l.billedAmount;
      byLawyer.set(key, entry);
    }
    ({ page, y } = drawBorderedTable(
      pdfDoc, page, y, MARGIN,
      [
        { header: 'Initials', width: 50 },
        { header: 'Name', width: 145 },
        { header: 'Position', width: 100 },
        { header: 'Rate ($)', width: 70, align: 'right' },
        { header: 'Hours', width: 55, align: 'right' },
        { header: 'Amount ($)', width: CONTENT_W - (50 + 145 + 100 + 70 + 55), align: 'right' },
      ],
      [...byLawyer.entries()].map(([name, e]) => [e.initials, name, e.position, money(e.rate), e.hours.toFixed(2), money(e.amount)]),
      regular, bold,
      { title: 'Summary Fees by Lawyer', totalsLabel: 'Total Professional Fees Rendered', totalsValue: money(feesTotal) }
    ));
    y -= 14;
  }

  if (input.disbursementLines.length) {
    const totalDisbIncGst = input.disbursementLines.reduce((s, l) => s + l.amount + l.gstAmount, 0);
    ({ page, y } = drawBorderedTable(
      pdfDoc, page, y, MARGIN,
      [
        { header: 'Description', width: CONTENT_W - 105 },
        { header: 'Amount ($)', width: 105, align: 'right' },
      ],
      input.disbursementLines.map(l => [l.description || '', money(l.amount + l.gstAmount)]),
      regular, bold,
      { title: 'Disbursements', totalsLabel: 'Total Disbursements Rendered', totalsValue: money(totalDisbIncGst) }
    ));
  }

  // ── Final page: remittance advice + notice of rights ─────────────
  page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  y = PAGE_H - MARGIN;

  text(`${input.company.name.toUpperCase()} - REMITTANCE ADVICE`, MARGIN, 16, { bold: true });
  y -= 30;
  text('ABN:', MARGIN, 10); text(input.company.abn || '', MARGIN + 100, 10, { bold: true });
  text('Tax Invoice Number:', MARGIN + 260, 10); text(input.invoice.invoiceNumber, MARGIN + 260 + 130, 10, { bold: true });
  y -= 16;
  text('Our Ref:', MARGIN, 10); text(input.invoice.ourReference || '', MARGIN + 100, 10, { bold: true });
  text('Date of Tax Invoice:', MARGIN + 260, 10); text(formatDate(input.invoice.issueDate, 'long'), MARGIN + 260 + 130, 10, { bold: true });
  y -= 24;
  text('Payor Name:', MARGIN, 10); text(input.invoice.debtorName || '', MARGIN + 100, 10, { bold: true });
  y -= 4; hr(y); y -= 24;

  text('1.', MARGIN, 11, { bold: true }); text('BANK TRANSFER', MARGIN + 20, 11, { bold: true });
  y -= 18;
  text(`Transfer amount: AUD ${money(input.invoice.amountDue).replace('$', '')} to our account`, MARGIN, 10); y -= 14;
  if (input.bankDetails?.accountName) { text(`Account name: ${input.bankDetails.accountName}`, MARGIN, 10); y -= 14; }
  if (input.bankDetails?.bsb) { text(`BSB: ${input.bankDetails.bsb}`, MARGIN, 10); y -= 14; }
  if (input.bankDetails?.accountNumber) { text(`Account: ${input.bankDetails.accountNumber}`, MARGIN, 10); y -= 14; }
  if (input.bankDetails?.reference) { text(`Reference: ${input.bankDetails.reference}`, MARGIN, 10); y -= 14; }
  y -= 6; hr(y); y -= 22;

  text('2.', MARGIN, 11, { bold: true }); text('CHEQUE', MARGIN + 20, 11, { bold: true });
  y -= 18;
  for (const line of wrapText(`Please return this advice with your cheque payable to ${input.company.name} for AUD ${money(input.invoice.amountDue).replace('$', '')}.`, regular, 10, CONTENT_W)) {
    text(line, MARGIN, 10); y -= 13;
  }
  y -= 26;

  text('NOTICE OF RIGHTS', MARGIN, 10, { bold: true, color: [0.4, 0.4, 0.45] });
  y -= 16;
  const notice = [
    'If you have any concern about this tax invoice, please contact our firm. If we cannot satisfactorily resolve your concern, you may, depending on the circumstances:',
    '1. Seek a costs assessment by the costs assessor of the relevant jurisdiction under the applicable Legal Profession Uniform Law, within 12 months after the bill was given to you or payment was requested, or after the legal costs were paid if no bill or request was made. A costs assessor may, having regard to the delay and reasons for it, allow an assessment to proceed after that period.',
    '2. Make a costs complaint to the Legal Services Commissioner of the relevant jurisdiction within 60 days after the legal costs become payable (or within 30 days after an itemised bill you requested is provided). The Commissioner deals with cost disputes where the total legal costs do not exceed the applicable indexed threshold, and may allow a complaint outside that period having regard to the delay and reasons for it, provided we have not commenced legal proceedings for those costs.',
  ];
  for (const para of notice) {
    for (const line of wrapText(para, regular, 8.5, CONTENT_W)) { text(line, MARGIN, 8.5, { color: [0.4, 0.4, 0.45] }); y -= 12; }
    y -= 8;
  }

  return pdfDoc.save();
}
