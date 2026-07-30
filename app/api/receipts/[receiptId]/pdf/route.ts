// app/api/receipts/[receiptId]/pdf/route.ts
// GET -> the payment receipt PDF for one Receipts-ledger record. Mirrors
// app/api/invoices/[invoiceId]/pdf/route.ts's shape -- hydration lives in
// lib/invoices/hydrateReceipt.ts, rendering in lib/invoices/generateReceiptPdf.ts.
// `?download=1` forces a Content-Disposition attachment; otherwise the PDF
// is served inline for the in-tab preview (see PdfPreviewModal.tsx).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateReceiptPdf } from "@/lib/invoices/generateReceiptPdf";
import { hydrateReceiptForRender } from "@/lib/invoices/hydrateReceipt";

export async function GET(req: NextRequest, { params }: { params: Promise<{ receiptId: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { receiptId } = await params;

  const hydrated = await hydrateReceiptForRender(admin, receiptId, companyId);
  if (!hydrated) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

  const bytes = await generateReceiptPdf(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hydrated.receiptNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
    },
  });
}
