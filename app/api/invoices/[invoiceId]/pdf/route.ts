// app/api/invoices/[invoiceId]/pdf/route.ts
// GET -> the tax invoice PDF for one Invoices-table record. Hydration
// (invoice EAV fields, company/matter/debtor, frozen invoice_line_items
// snapshot) lives in lib/invoices/hydrateInvoice.ts, shared with the docx
// download route. Branches on the selected template's `style` to pick which
// renderer builds the PDF -- 'detailed' (generateDetailedInvoicePdf.ts) is
// the fixed multi-page law-firm style; anything else (including no
// template at all) is the flexible, layout-editable renderer
// (generateInvoicePdf.ts).
// `?download=1` forces a Content-Disposition attachment; otherwise the PDF
// is served inline for the in-tab preview.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateInvoicePdf } from "@/lib/invoices/generateInvoicePdf";
import { generateDetailedInvoicePdf } from "@/lib/invoices/generateDetailedInvoicePdf";
import { hydrateInvoiceForRender } from "@/lib/invoices/hydrateInvoice";

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { invoiceId } = await params;

  const hydrated = await hydrateInvoiceForRender(admin, invoiceId, companyId);
  if (!hydrated) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const bytes = hydrated.selectedTemplate?.style === 'detailed'
    ? await generateDetailedInvoicePdf(hydrated.input)
    : await generateInvoicePdf(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hydrated.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
    },
  });
}
