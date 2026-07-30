// Builds a compliant Australian tax invoice PDF from scratch with pdf-lib --
// the same library/primitives lib/pdfeditor/applyEdits.ts already uses
// (PDFDocument, embedPng, drawText/drawRectangle/drawLine), just building a
// new document instead of editing one. Sections follow ATO tax-invoice
// requirements (ABN, fees ex-GST + GST + total inc. GST, unique invoice
// number) plus Legal Profession Uniform Law practice (itemised dated time
// entries, a costs-assessment/itemised-bill rights notice) -- researched
// this session, see the plan file for sources.
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { totalDiscount } from "./apportionment";

export interface InvoiceTemplateDisplay {
  showStaffInitials: boolean;
  showLineDescriptions: boolean;
  showRatePerLine: boolean;
  showHoursPerLine: boolean;
  showAmountAndGstPerLine: boolean;
  showFeeSubtotal: boolean;
  showDisbursementSubtotal: boolean;
  showPriorBalance: boolean;
  showDueDate: boolean;
  showPaymentSummary: boolean;
  showAccountSummary: boolean;
  // Detailed style only (see generateDetailedInvoicePdf.ts) -- optional,
  // undefined means "show" (matches every template saved before these
  // existed, whose stored `display` JSON simply lacks the keys, without
  // needing a data migration). Independent toggles: a firm might want
  // neither itemised breakdown on the invoice at all, just the summary
  // totals -- when Professional Fees is off, CreateInvoiceModal requires a
  // manually-typed description of the work instead (there's no itemised
  // list left for the client to infer it from).
  showProfessionalFeesTable?: boolean;
  showSummaryFeesByLawyerTable?: boolean;
}

export const DEFAULT_INVOICE_DISPLAY: InvoiceTemplateDisplay = {
  showStaffInitials: true,
  showLineDescriptions: true,
  showRatePerLine: false,
  showHoursPerLine: true,
  showAmountAndGstPerLine: true,
  showFeeSubtotal: true,
  showDisbursementSubtotal: true,
  showPriorBalance: false,
  showDueDate: true,
  showPaymentSummary: true,
  showAccountSummary: false,
};

// Curated to pdf-lib's own built-in "standard 14" fonts -- no font files to
// source/bundle/license, works everywhere immediately. Real custom fonts
// (Google Fonts, uploads) would need @pdf-lib/fontkit and shipped font
// files; deliberately out of scope.
export type InvoiceFontFamily = 'helvetica' | 'times' | 'courier';

export interface InvoiceTypographyEntry { family: InvoiceFontFamily; size: number }

// One entry per distinct visual "part" of the invoice a user might want to
// restyle independently -- see generateInvoicePdf's draw calls below, each
// tagged with which entry it reads from.
export interface InvoiceTypography {
  firmName: InvoiceTypographyEntry;
  firmSubDetails: InvoiceTypographyEntry; // ABN + address, under the firm name
  title: InvoiceTypographyEntry; // "TAX INVOICE"
  invoiceMeta: InvoiceTypographyEntry; // invoice number / issue date / due date / matter
  billToLabel: InvoiceTypographyEntry; // "BILL TO"
  debtorName: InvoiceTypographyEntry;
  sectionHeading: InvoiceTypographyEntry; // "PROFESSIONAL FEES" / "DISBURSEMENTS"
  tableRow: InvoiceTypographyEntry; // every fee + disbursement line item (one shared size/family)
  subtotal: InvoiceTypographyEntry; // fees/disbursements subtotal + discount/markup lines
  totals: InvoiceTypographyEntry; // opening balance / subtotal / GST / total / trust / payments / amount due
  footer: InvoiceTypographyEntry; // credit terms / bank details / other terms
  complianceNotice: InvoiceTypographyEntry;
}

export const DEFAULT_INVOICE_TYPOGRAPHY: InvoiceTypography = {
  firmName: { family: 'helvetica', size: 16 },
  firmSubDetails: { family: 'helvetica', size: 10 },
  title: { family: 'helvetica', size: 20 },
  invoiceMeta: { family: 'helvetica', size: 11 },
  billToLabel: { family: 'helvetica', size: 9 },
  debtorName: { family: 'helvetica', size: 12 },
  sectionHeading: { family: 'helvetica', size: 10 },
  tableRow: { family: 'helvetica', size: 9 },
  subtotal: { family: 'helvetica', size: 10 },
  totals: { family: 'helvetica', size: 11 },
  footer: { family: 'helvetica', size: 9 },
  complianceNotice: { family: 'helvetica', size: 8 },
};

// Visual layout for the HEADER region only (logo, firm details, title/meta,
// bill-to) -- everything drawn before the fee/disbursement tables. These are
// the only freely-positionable elements (see InvoiceLayoutEditor.tsx): the
// tables' start position stays fixed just below the header (their height is
// row-count-dependent, so they can't be freely placed without risking
// collision with whatever the user put below them), and totals/footer stay
// sequential/flowing after the tables exactly as before -- only the header
// anchors and the tables' own column order/width are configurable.
export interface InvoiceLayoutAnchor { x: number; y: number }
export interface InvoiceLayoutColumn { key: 'rate' | 'hours' | 'gst' | 'amount'; width: number }
export interface InvoiceLayout {
  logo: { x: number; y: number; maxWidth: number; maxHeight: number };
  firmDetails: InvoiceLayoutAnchor; // firm name/ABN/address, right-aligned block
  titleBlock: InvoiceLayoutAnchor; // "TAX INVOICE" + invoice number/dates/matter
  billTo: InvoiceLayoutAnchor;
  feeColumns: InvoiceLayoutColumn[]; // draw order, right-to-left
  disbColumns: InvoiceLayoutColumn[];
  margin: number; // page margin, points, applied on all 4 sides
  typography: InvoiceTypography;
}

export interface InvoiceFeeLine {
  date: string | null;
  staffInitials: string | null;
  description: string | null;
  rate: number | null;
  hours: number | null;
  originalAmount: number;
  billedAmount: number;
  // GST portion of billedAmount -- see lib/invoices/apportionment.ts's
  // splitGst(). billedAmount itself is always the ex-GST figure (matches
  // what feeds fees_total/subtotal), so a GST Inclusive line's full charged
  // amount is billedAmount + gstAmount, not billedAmount alone.
  gstAmount: number;
  // Both optional -- generateInvoicePdf() (the flexible/single-page
  // renderer) never reads either; generateDetailedInvoicePdf.ts's "Summary
  // Fees by Lawyer" table (staffPosition, from entities.timekeeper_level,
  // snapshotted onto invoice_line_items) and its GST-split disbursement
  // summary (gstStatus) do. Kept here rather than on a separate type so
  // both renderers can share one hydration step (lib/invoices/hydrateInvoice.ts).
  staffPosition?: string | null;
  gstStatus?: string | null;
  staffName?: string | null;
  // Time & Fee Entries' 'type' = 'Fixed Fee' -- hours is a synthetic 1 (see
  // DashboardQuickAddForm.tsx), never a real figure, so every hours-column
  // renderer prints "Fixed Fee" here instead of a number.
  isFixedFee?: boolean;
}

export interface InvoiceDisbursementLine {
  date: string | null;
  description: string | null;
  amount: number;
  gstAmount: number;
  gstStatus?: string | null;
}

export interface GenerateInvoicePdfInput {
  company: { name: string; abn: string | null; address: string | null; logoBytes: Uint8Array | null; logoIsPng: boolean };
  creditTerms: string;
  otherTerms: string;
  bankDetails: { accountName?: string; bsb?: string; accountNumber?: string; reference?: string } | null;
  display: InvoiceTemplateDisplay;
  layout?: InvoiceLayout;
  invoice: {
    invoiceNumber: string;
    issueDate: string | null;
    dueDate: string | null;
    matterName: string | null;
    // One or more entities (e.g. joint purchasers) -- each renders as its
    // own paragraph wherever the debtor's name appears, with a blank line
    // between them when there's more than one.
    debtorNames: string[];
    subtotal: number;
    gst: number;
    totalIncGst: number;
    trustApplied: number;
    payments: number;
    waivedAmount: number;
    amountDue: number;
    priorBalance: number;
    // Detailed-template-only fields (generateDetailedInvoicePdf.ts) -- the
    // flexible renderer below never reads these.
    responsiblePartnerName?: string | null;
    ourReference?: string | null;
    yourReference?: string | null;
    periodEnd?: string | null;
    paymentTermsDays?: number;
    // Only read when display.showProfessionalFeesTable is false -- replaces
    // the generic "Professional Services Rendered" row label on page 1 with
    // a manually-typed explanation of the work, since there's no itemised
    // table left on the invoice for the client to infer it from otherwise.
    professionalFeesDescription?: string | null;
  };
  feeLines: InvoiceFeeLine[];
  disbursementLines: InvoiceDisbursementLine[];
}

const PAGE_W = 595.28, PAGE_H = 841.89; // A4, points

// Vertical spacing constants for the header region (assuming a company has
// both an ABN and a one-line address -- the common case): firm block is
// 20(name gap)+13(abn)+13(address line)+20(trailing gap) = 66pt tall, title
// block is 26+16+24 = 66pt, bill-to block is 14+26 = 40pt then +20 for the
// hr()+gap = 60pt. Independent of margin -- only the header's horizontal
// starting edge and top-of-page y depend on margin (see buildHeaderAnchors).
const FIRM_BLOCK_H = 66;
const TITLE_BLOCK_H = 66;

// Builds the 4 header anchors for a given margin -- used both by
// DEFAULT_INVOICE_LAYOUT and by the Compact/Formal presets below, so each
// preset's header still starts at ITS OWN margin, not always 50.
function buildHeaderAnchors(margin: number) {
  const headerTopY = PAGE_H - margin;
  return {
    logo: { x: margin, y: headerTopY, maxWidth: 160, maxHeight: 60 },
    firmDetails: { x: PAGE_W - margin, y: headerTopY },
    titleBlock: { x: margin, y: headerTopY - FIRM_BLOCK_H },
    billTo: { x: margin, y: headerTopY - FIRM_BLOCK_H - TITLE_BLOCK_H },
  };
}

const DEFAULT_FEE_COLUMNS: InvoiceLayoutColumn[] = [
  { key: 'amount', width: 70 }, { key: 'gst', width: 60 }, { key: 'hours', width: 50 }, { key: 'rate', width: 60 },
];
const DEFAULT_DISB_COLUMNS: InvoiceLayoutColumn[] = [{ key: 'amount', width: 70 }, { key: 'gst', width: 60 }];

// A template saved before this change (or before InvoiceLayoutEditor.tsx
// existed at all) has no saved `layout` -- see InvoiceTemplateConfig.layout's
// optional type in lib/invoices/types.ts -- and falls back to this,
// rendering pixel-identical to every version of this file before it.
export const DEFAULT_INVOICE_LAYOUT: InvoiceLayout = {
  ...buildHeaderAnchors(50),
  // Rightmost column first -- rightColumnLayout() assigns positions in this
  // order starting from the page's right edge, so array order IS visual
  // draw order right-to-left (matches the old hardcoded Amount, GST, Hours,
  // Rate right-to-left sequence exactly).
  feeColumns: DEFAULT_FEE_COLUMNS,
  disbColumns: DEFAULT_DISB_COLUMNS,
  margin: 50,
  typography: DEFAULT_INVOICE_TYPOGRAPHY,
};

// "Select a layout" presets -- a firm picks one as a starting point from
// InvoiceTemplateSettingsTab.tsx, then can still fine-tune further in
// InvoiceLayoutEditor.tsx exactly as with any other saved layout.
export const COMPACT_INVOICE_LAYOUT: InvoiceLayout = {
  ...buildHeaderAnchors(36),
  feeColumns: DEFAULT_FEE_COLUMNS,
  disbColumns: DEFAULT_DISB_COLUMNS,
  margin: 36,
  typography: {
    ...DEFAULT_INVOICE_TYPOGRAPHY,
    title: { family: 'helvetica', size: 16 },
    tableRow: { family: 'helvetica', size: 8 },
    footer: { family: 'helvetica', size: 8 },
  },
};

export const FORMAL_INVOICE_LAYOUT: InvoiceLayout = {
  ...buildHeaderAnchors(60),
  feeColumns: DEFAULT_FEE_COLUMNS,
  disbColumns: DEFAULT_DISB_COLUMNS,
  margin: 60,
  typography: {
    firmName: { family: 'times', size: 17 },
    firmSubDetails: { family: 'times', size: 10 },
    title: { family: 'times', size: 24 },
    invoiceMeta: { family: 'times', size: 11 },
    billToLabel: { family: 'times', size: 9 },
    debtorName: { family: 'times', size: 12 },
    sectionHeading: { family: 'times', size: 10 },
    tableRow: { family: 'times', size: 9 },
    subtotal: { family: 'times', size: 10 },
    totals: { family: 'times', size: 11 },
    footer: { family: 'times', size: 9 },
    complianceNotice: { family: 'times', size: 8 },
  },
};

export const INVOICE_LAYOUT_PRESETS: { id: string; name: string; layout: InvoiceLayout }[] = [
  { id: 'classic', name: 'Classic', layout: DEFAULT_INVOICE_LAYOUT },
  { id: 'compact', name: 'Compact', layout: COMPACT_INVOICE_LAYOUT },
  { id: 'formal', name: 'Formal', layout: FORMAL_INVOICE_LAYOUT },
];

const FONT_STANDARDS: Record<InvoiceFontFamily, { regular: StandardFonts; bold: StandardFonts }> = {
  helvetica: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  times: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
  courier: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold },
};

function money(n: number): string {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

function formatDate(d: string | null): string {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
}

// Wraps `text` to fit `maxWidth`, breaking on word boundaries -- pdf-lib has
// no built-in text wrapping.
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

export async function generateInvoicePdf(input: GenerateInvoicePdfInput): Promise<Uint8Array> {
  const layout: InvoiceLayout = { ...DEFAULT_INVOICE_LAYOUT, ...input.layout };
  const typo = layout.typography;
  const margin = layout.margin;
  const CONTENT_W = PAGE_W - margin * 2;
  const MIN_Y = margin + 40; // leave room for the footer notice on every page

  const pdfDoc = await PDFDocument.create();
  // Embed every family/weight combination up front (cheap, no network/file
  // I/O for StandardFonts) so the `text()` helper below can stay a plain
  // synchronous function instead of needing every one of its ~30 call sites
  // to become async.
  const fonts: Record<InvoiceFontFamily, { regular: PDFFont; bold: PDFFont }> = {} as any;
  for (const family of Object.keys(FONT_STANDARDS) as InvoiceFontFamily[]) {
    fonts[family] = {
      regular: await pdfDoc.embedFont(FONT_STANDARDS[family].regular),
      bold: await pdfDoc.embedFont(FONT_STANDARDS[family].bold),
    };
  }
  const fontFor = (t: InvoiceTypographyEntry, bold: boolean) => fonts[t.family][bold ? 'bold' : 'regular'];

  const logoImage = input.company.logoBytes
    ? await (input.company.logoIsPng ? pdfDoc.embedPng(input.company.logoBytes) : pdfDoc.embedJpg(input.company.logoBytes))
    : null;

  let page: PDFPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
  // Flowing cursor -- only used from the fee table onward. The header
  // section (letterhead/title/bill-to) draws at its own independent
  // `layout` anchors instead (see `text`'s optional `atY`), since those are
  // now freely positioned rather than chained off each other.
  let y = PAGE_H - margin;

  function newPage() {
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - margin;
  }

  function ensureRoom(needed: number) {
    if (y - needed < MIN_Y) newPage();
  }

  function text(
    str: string, x: number, typoEntry: InvoiceTypographyEntry,
    opts: { bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' } = {},
    atY?: number
  ) {
    const font = fontFor(typoEntry, !!opts.bold);
    const size = typoEntry.size;
    const color = rgb(...(opts.color ?? [0.1, 0.1, 0.12]));
    const drawX = opts.align === 'right' ? x - font.widthOfTextAtSize(str, size) : x;
    page.drawText(str, { x: drawX, y: atY ?? y, size, font, color });
  }

  function hr(atY: number, color: [number, number, number] = [0.85, 0.85, 0.87]) {
    page.drawLine({ start: { x: margin, y: atY }, end: { x: PAGE_W - margin, y: atY }, thickness: 0.75, color: rgb(...color) });
  }

  // ── Letterhead ─────────────────────────────────────────────────────
  if (logoImage) {
    const scale = Math.min(layout.logo.maxWidth / logoImage.width, layout.logo.maxHeight / logoImage.height, 1);
    const w = logoImage.width * scale, h = logoImage.height * scale;
    page.drawImage(logoImage, { x: layout.logo.x, y: layout.logo.y - h, width: w, height: h });
  }
  {
    let fy = layout.firmDetails.y;
    text(input.company.name, layout.firmDetails.x, typo.firmName, { bold: true, align: 'right' }, fy);
    fy -= 20;
    if (input.company.abn) {
      text(`ABN ${input.company.abn}`, layout.firmDetails.x, typo.firmSubDetails, { align: 'right', color: [0.4, 0.4, 0.45] }, fy);
      fy -= 13;
    }
    if (input.company.address) {
      for (const line of wrapText(input.company.address, fontFor(typo.firmSubDetails, false), typo.firmSubDetails.size, 220)) {
        text(line, layout.firmDetails.x, typo.firmSubDetails, { align: 'right', color: [0.4, 0.4, 0.45] }, fy);
        fy -= 13;
      }
    }
  }

  // ── Title + invoice meta ─────────────────────────────────────────────
  {
    let ty = layout.titleBlock.y;
    text('TAX INVOICE', layout.titleBlock.x, typo.title, { bold: true }, ty);
    ty -= 26;
    text(`Invoice number: ${input.invoice.invoiceNumber}`, layout.titleBlock.x, typo.invoiceMeta, {}, ty);
    text(`Issue date: ${formatDate(input.invoice.issueDate)}`, layout.titleBlock.x + 260, typo.invoiceMeta, {}, ty);
    ty -= 16;
    if (input.display.showDueDate && input.invoice.dueDate) {
      text(`Due date: ${formatDate(input.invoice.dueDate)}`, layout.titleBlock.x + 260, typo.invoiceMeta, {}, ty);
    }
    if (input.invoice.matterName) text(`Matter: ${input.invoice.matterName}`, layout.titleBlock.x, typo.invoiceMeta, {}, ty);
  }

  // ── Bill to ───────────────────────────────────────────────────────
  text('BILL TO', layout.billTo.x, typo.billToLabel, { bold: true, color: [0.55, 0.55, 0.6] }, layout.billTo.y);
  // One or more debtors (e.g. joint purchasers) -- each its own paragraph,
  // with a blank line between them. The single-debtor case lands at
  // exactly the same y as before this existed (billTo.y - 14).
  const debtorLines = input.invoice.debtorNames.length ? input.invoice.debtorNames : ['—'];
  let debtorY = layout.billTo.y - 14;
  debtorLines.forEach((name, i) => {
    text(name, layout.billTo.x, typo.debtorName, { bold: true }, debtorY);
    debtorY -= 14;
    if (i < debtorLines.length - 1) debtorY -= 14;
  });
  const hrY = debtorY - 12;
  hr(hrY);

  // Tables start a fixed gap below wherever bill-to actually landed (not an
  // independent anchor of its own -- their height is row-count-dependent,
  // so letting them float freely risked colliding with whatever's below
  // them; deriving their start from bill-to instead of a hardcoded constant
  // means moving bill-to up/down to compress/expand the header still works
  // sensibly). Also grows with extra debtor lines so the table never
  // overlaps a multi-debtor bill-to block.
  y = hrY - 20;

  // ── Fee lines ─────────────────────────────────────────────────────
  if (input.feeLines.length) {
    text('PROFESSIONAL FEES', margin, typo.sectionHeading, { bold: true, color: [0.3, 0.3, 0.34] });
    y -= 18;
    ensureRoom(60);
    ({ page, y } = drawLineItemTable(pdfDoc, page, y, input, fonts, typo.tableRow, layout, margin, MIN_Y));
    if (input.display.showFeeSubtotal) {
      const feesTotal = input.feeLines.reduce((s, l) => s + l.billedAmount, 0);
      ensureRoom(20);
      text('Fees subtotal', PAGE_W - margin - 100, typo.subtotal, { align: 'right', bold: true });
      text(money(feesTotal), PAGE_W - margin, typo.subtotal, { align: 'right', bold: true });
      y -= 16;
    }
    const discount = totalDiscount(input.feeLines.map(l => ({ id: '', originalAmount: l.originalAmount, billedAmount: l.billedAmount })));
    if (Math.abs(discount) > 0.004) {
      ensureRoom(20);
      const label = discount > 0 ? 'Fee discount applied' : 'Fee markup applied';
      text(label, PAGE_W - margin - 100, typo.subtotal, { align: 'right', color: [0.5, 0.2, 0.2] });
      text((discount > 0 ? '-' : '+') + money(Math.abs(discount)), PAGE_W - margin, typo.subtotal, { align: 'right', color: [0.5, 0.2, 0.2] });
      y -= 16;
    }
    y -= 10;
  }

  // ── Disbursements ─────────────────────────────────────────────────
  if (input.disbursementLines.length) {
    ensureRoom(60);
    text('DISBURSEMENTS', margin, typo.sectionHeading, { bold: true, color: [0.3, 0.3, 0.34] });
    y -= 18;
    ({ page, y } = drawDisbursementTable(pdfDoc, page, y, input, fonts, typo.tableRow, layout, margin, MIN_Y));
    if (input.display.showDisbursementSubtotal) {
      const disbTotal = input.disbursementLines.reduce((s, l) => s + l.amount, 0);
      ensureRoom(20);
      text('Disbursements subtotal', PAGE_W - margin - 100, typo.subtotal, { align: 'right', bold: true });
      text(money(disbTotal), PAGE_W - margin, typo.subtotal, { align: 'right', bold: true });
      y -= 16;
    }
    y -= 10;
  }

  // ── Totals ────────────────────────────────────────────────────────
  ensureRoom(140);
  hr(y);
  y -= 20;
  const totalsX = PAGE_W - margin - 160;
  function totalRow(label: string, value: number, opts: { bold?: boolean } = {}) {
    text(label, totalsX, typo.totals, opts);
    text(money(value), PAGE_W - margin, typo.totals, { align: 'right', ...opts });
    y -= 16;
  }
  if (input.display.showPriorBalance && input.invoice.priorBalance) totalRow('Opening balance', input.invoice.priorBalance);
  totalRow('Subtotal (ex. GST)', input.invoice.subtotal);
  totalRow('GST', input.invoice.gst);
  totalRow('Total (inc. GST)', input.invoice.totalIncGst, { bold: true });
  if (input.display.showPaymentSummary) {
    y -= 4;
    if (input.invoice.trustApplied) totalRow('Trust funds applied', -input.invoice.trustApplied);
    if (input.invoice.payments) totalRow('Payments received', -input.invoice.payments);
    if (input.invoice.waivedAmount) totalRow('Amount waived', -input.invoice.waivedAmount);
    totalRow('Amount due', input.invoice.amountDue, { bold: true });
  }
  y -= 20;

  // ── Terms / footer ────────────────────────────────────────────────
  ensureRoom(120);
  hr(y);
  y -= 18;
  if (input.creditTerms) {
    for (const line of wrapText(input.creditTerms, fontFor(typo.footer, false), typo.footer.size, CONTENT_W)) { text(line, margin, typo.footer, { color: [0.4, 0.4, 0.45] }); y -= 12; }
    y -= 6;
  }
  if (input.bankDetails && (input.bankDetails.accountName || input.bankDetails.bsb || input.bankDetails.accountNumber)) {
    const parts = [
      input.bankDetails.accountName && `Account name: ${input.bankDetails.accountName}`,
      input.bankDetails.bsb && `BSB: ${input.bankDetails.bsb}`,
      input.bankDetails.accountNumber && `Account: ${input.bankDetails.accountNumber}`,
      input.bankDetails.reference && `Reference: ${input.bankDetails.reference}`,
    ].filter(Boolean).join('   ·   ');
    text(parts as string, margin, typo.footer, { color: [0.4, 0.4, 0.45] });
    y -= 16;
  }
  if (input.otherTerms) {
    for (const line of wrapText(input.otherTerms, fontFor(typo.footer, false), typo.footer.size, CONTENT_W)) { text(line, margin, typo.footer, { color: [0.4, 0.4, 0.45] }); y -= 12; }
    y -= 6;
  }
  // Compliance notice -- always shown, not a display toggle, since it's a
  // client-rights disclosure (Legal Profession Uniform Law), not a
  // preference. Harmless boilerplate for non-legal invoices too.
  ensureRoom(30);
  for (const line of wrapText(
    'You have the right to request an itemised bill and to have this bill assessed under applicable legal costs legislation. Any request must be made within the time limits set out in that legislation.',
    fontFor(typo.complianceNotice, false), typo.complianceNotice.size, CONTENT_W
  )) { text(line, margin, typo.complianceNotice, { color: [0.6, 0.6, 0.64] }); y -= 11; }

  return pdfDoc.save();
}

// Truncates `str` to fit `maxWidth` at `size` using the real font's glyph
// widths (binary-search-free: shrinks one character at a time, which is
// fine at invoice line-item lengths) rather than an approximate average
// character width, so right-aligned columns stay genuinely aligned.
function truncate(str: string, maxWidth: number, font: PDFFont, size: number): string {
  if (font.widthOfTextAtSize(str, size) <= maxWidth) return str;
  let end = str.length;
  while (end > 1 && font.widthOfTextAtSize(str.slice(0, end) + '…', size) > maxWidth) end--;
  return str.slice(0, end) + '…';
}

// True if `key`'s column should be reserved space at all, per the display
// toggles. `amount` is deliberately always reserved/positioned regardless of
// showAmountAndGstPerLine -- matches this table's own pre-existing behavior
// (disbursements draw their amount unconditionally; fees gate the actual
// DRAW of amount on that toggle at the call site, but still reserve its
// column width either way) -- only whether each column's *width* is
// reserved changes here, not per-line draw gating, which stays exactly as
// it was at each call site below.
function columnVisible(key: InvoiceLayoutColumn['key'], display: InvoiceTemplateDisplay): boolean {
  if (key === 'rate') return display.showRatePerLine;
  if (key === 'hours') return display.showHoursPerLine;
  if (key === 'gst') return display.showAmountAndGstPerLine;
  return true; // 'amount'
}

// Lays out the right-aligned numeric columns right-to-left in the ORDER
// `columns` gives them (reorderable/resizable per template -- see
// InvoiceLayoutEditor.tsx), skipping any column its display toggle has
// turned off. Deriving each column's x from a running `edge` (rather than
// hardcoded per-column offsets) is what keeps two visible columns from
// silently landing on the same x, whatever order/widths they're configured
// with. Returns each visible column's right-edge x (for
// `x - font.widthOfTextAtSize(str, size)` right-alignment) plus the total
// reserved width, so the description column knows how much room it has left.
function rightColumnLayout(display: InvoiceTemplateDisplay, columns: InvoiceLayoutColumn[], margin: number) {
  let edge = 0;
  const xByKey: Partial<Record<InvoiceLayoutColumn['key'], number>> = {};
  for (const col of columns) {
    if (!columnVisible(col.key, display)) continue;
    xByKey[col.key] = PAGE_W - margin - edge;
    edge += col.width;
  }
  return { xByKey, totalWidth: edge };
}

function drawLineItemTable(
  pdfDoc: PDFDocument, startPage: PDFPage, startY: number, input: GenerateInvoicePdfInput,
  fonts: Record<InvoiceFontFamily, { regular: PDFFont; bold: PDFFont }>, rowTypo: InvoiceTypographyEntry,
  layout: InvoiceLayout, margin: number, minY: number
): { page: PDFPage; y: number } {
  let page = startPage, y = startY;
  const font = fonts[rowTypo.family].regular;
  const size = rowTypo.size;
  const cols = rightColumnLayout(input.display, layout.feeColumns, margin);

  for (const line of input.feeLines) {
    let x = margin;
    page.drawText(formatDate(line.date), { x, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    x += 62;
    if (input.display.showStaffInitials && line.staffInitials) {
      page.drawText(line.staffInitials, { x, y, size, font, color: rgb(0.15, 0.15, 0.18) });
      x += 34;
    }
    if (input.display.showLineDescriptions && line.description) {
      const descMaxWidth = PAGE_W - margin - x - cols.totalWidth - 8;
      page.drawText(truncate(line.description, descMaxWidth, font, size), { x, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showRatePerLine && line.rate != null && cols.xByKey.rate != null) {
      const str = money(line.rate);
      page.drawText(str, { x: cols.xByKey.rate - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showHoursPerLine && (line.isFixedFee || line.hours != null) && cols.xByKey.hours != null) {
      const str = line.isFixedFee ? 'Fixed Fee' : line.hours!.toFixed(2);
      page.drawText(str, { x: cols.xByKey.hours - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showAmountAndGstPerLine && cols.xByKey.gst != null && cols.xByKey.amount != null) {
      const gstStr = money(line.gstAmount);
      page.drawText(gstStr, { x: cols.xByKey.gst - font.widthOfTextAtSize(gstStr, size), y, size, font, color: rgb(0.5, 0.5, 0.55) });
      const str = money(line.billedAmount);
      page.drawText(str, { x: cols.xByKey.amount - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    y -= 14;
    if (y < minY) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - margin; }
  }
  return { page, y: y - 4 };
}

function drawDisbursementTable(
  pdfDoc: PDFDocument, startPage: PDFPage, startY: number, input: GenerateInvoicePdfInput,
  fonts: Record<InvoiceFontFamily, { regular: PDFFont; bold: PDFFont }>, rowTypo: InvoiceTypographyEntry,
  layout: InvoiceLayout, margin: number, minY: number
): { page: PDFPage; y: number } {
  let page = startPage, y = startY;
  const font = fonts[rowTypo.family].regular;
  const size = rowTypo.size;
  const cols = rightColumnLayout(input.display, layout.disbColumns, margin);
  const disbRightWidth = cols.totalWidth;
  for (const line of input.disbursementLines) {
    page.drawText(formatDate(line.date), { x: margin, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    if (line.description) {
      const descMaxWidth = PAGE_W - margin * 2 - 62 - disbRightWidth;
      page.drawText(truncate(line.description, descMaxWidth, font, size), { x: margin + 62, y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    if (input.display.showAmountAndGstPerLine && cols.xByKey.gst != null) {
      const gstStr = money(line.gstAmount);
      page.drawText(gstStr, { x: cols.xByKey.gst - font.widthOfTextAtSize(gstStr, size), y, size, font, color: rgb(0.5, 0.5, 0.55) });
    }
    if (cols.xByKey.amount != null) {
      const str = money(line.amount);
      page.drawText(str, { x: cols.xByKey.amount - font.widthOfTextAtSize(str, size), y, size, font, color: rgb(0.15, 0.15, 0.18) });
    }
    y -= 14;
    if (y < minY) { page = pdfDoc.addPage([PAGE_W, PAGE_H]); y = PAGE_H - margin; }
  }
  return { page, y: y - 4 };
}
