// app/api/invoices/template-preview/route.ts
// POST -> a PDF built from a DRAFT (possibly unsaved) display/layout config,
// for InvoiceLayoutEditor.tsx's live preview pane. Unlike
// app/api/invoices/[invoiceId]/pdf/route.ts (which renders one real,
// already-saved invoice), this builds a synthetic sample invoice against
// the company's real branding/terms -- there's no invoice record to read
// yet while someone is still editing a template.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import {
  generateInvoicePdf, DEFAULT_INVOICE_DISPLAY, DEFAULT_INVOICE_LAYOUT,
  type InvoiceTemplateDisplay, type InvoiceLayout,
} from "@/lib/invoices/generateInvoicePdf";
import { splitGst } from "@/lib/invoices/apportionment";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => ({}));
  const display: InvoiceTemplateDisplay = { ...DEFAULT_INVOICE_DISPLAY, ...(body.display || {}) };
  const layout: InvoiceLayout = { ...DEFAULT_INVOICE_LAYOUT, ...(body.layout || {}) };

  const { data: company } = await admin
    .from('companies').select('name, abn, invoice_settings, logo_url').eq('id', companyId).maybeSingle();
  const invoiceSettings = (company?.invoice_settings as any) || {};

  let logoBytes: Uint8Array | null = null;
  let logoIsPng = true;
  if (company?.logo_url) {
    try {
      const res = await fetch(company.logo_url);
      if (res.ok) {
        logoBytes = new Uint8Array(await res.arrayBuffer());
        logoIsPng = !/\.jpe?g(\?|$)/i.test(company.logo_url);
      }
    } catch {
      // Logo fetch failing shouldn't block previewing the rest of the layout.
    }
  }

  // Fixed, plausible sample data, GST-split via the same splitGst a real
  // invoice save uses, so the preview's totals are internally consistent
  // (not just placeholder zeros) while someone drags things around.
  const today = new Date().toISOString().slice(0, 10);
  const feeSplit = splitGst(200, 'GST Exclusive');
  const disbFreeSplit = splitGst(50, 'GST Free');
  const disbIncSplit = splitGst(110, 'GST Inclusive');
  const subtotal = feeSplit.exGst + disbFreeSplit.exGst + disbIncSplit.exGst;
  const gst = feeSplit.gst + disbFreeSplit.gst + disbIncSplit.gst;

  const bytes = await generateInvoicePdf({
    company: {
      name: company?.name || 'Your Company', abn: company?.abn || null,
      address: invoiceSettings.firmAddress || null, logoBytes, logoIsPng,
    },
    creditTerms: invoiceSettings.creditTerms || '',
    otherTerms: invoiceSettings.otherTerms || '',
    bankDetails: invoiceSettings.bankDetails || null,
    display, layout,
    invoice: {
      invoiceNumber: 'SAMPLE-0001', issueDate: today, dueDate: today,
      matterName: 'Sample Matter', debtorName: 'Sample Client',
      subtotal, gst, totalIncGst: subtotal + gst, trustApplied: 0, payments: 0, amountDue: subtotal + gst, priorBalance: 0,
    },
    feeLines: [
      { date: today, staffInitials: 'AB', description: 'Sample professional fee line', rate: 100, hours: 2, originalAmount: 200, billedAmount: feeSplit.exGst, gstAmount: feeSplit.gst },
    ],
    disbursementLines: [
      { date: today, description: 'Sample disbursement (GST free)', amount: disbFreeSplit.exGst, gstAmount: disbFreeSplit.gst },
      { date: today, description: 'Sample disbursement (GST inclusive)', amount: disbIncSplit.exGst, gstAmount: disbIncSplit.gst },
    ],
  });

  return new NextResponse(bytes as any, { headers: { 'Content-Type': 'application/pdf' } });
}
