// app/api/invoices/[invoiceId]/docx/route.ts
// GET -> a .docx version of the invoice, same hydration as the PDF route
// (lib/invoices/hydrateInvoice.ts). Always renders via
// generateInvoiceDocx.ts's flexible-template content, regardless of the
// selected template's `style` -- see that file's header comment for why a
// Detailed-style Word document isn't attempted this pass.
// `?download=1` forces a Content-Disposition attachment; otherwise served
// inline (most browsers will still prompt to download/open in Word either
// way, unlike a PDF).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateInvoiceDocx } from "@/lib/invoices/generateInvoiceDocx";
import { hydrateInvoiceForRender } from "@/lib/invoices/hydrateInvoice";

export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { invoiceId } = await params;

  const hydrated = await hydrateInvoiceForRender(admin, invoiceId, companyId);
  if (!hydrated) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

  const buffer = await generateInvoiceDocx(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hydrated.invoiceNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.docx"`,
    },
  });
}
