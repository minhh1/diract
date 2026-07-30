// app/api/trust-receipts/[receiptNumber]/pdf/route.ts
// GET -> the trust receipt PDF for every Trust Transactions row sharing one
// receipt number (a deposit split across several matters gets ONE shared
// number -- see DepositFundsModal.tsx). Mirrors app/api/receipts/[receiptId]/pdf/route.ts's
// shape, keyed by number instead of a single record id.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateTrustReceiptPdf } from "@/lib/trust/generateTrustReceiptPdf";
import { hydrateTrustReceiptForRender } from "@/lib/trust/hydrateTrustReceipt";

export async function GET(req: NextRequest, { params }: { params: Promise<{ receiptNumber: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { receiptNumber } = await params;

  const hydrated = await hydrateTrustReceiptForRender(admin, decodeURIComponent(receiptNumber), companyId);
  if (!hydrated) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });

  const bytes = await generateTrustReceiptPdf(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hydrated.receiptNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
    },
  });
}
