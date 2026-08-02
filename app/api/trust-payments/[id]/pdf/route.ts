// app/api/trust-payments/[id]/pdf/route.ts
// GET -> the printable payment advice for one Trust Transactions withdrawal
// record (Bank Cheque/Bank Transfer/Direct Debit/Trust Cheque). Mirrors
// app/api/trust-cheques/[id]/pdf/route.ts's shape.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateTrustPaymentPdf } from "@/lib/trust/generateTrustPaymentPdf";
import { hydrateTrustPaymentForRender } from "@/lib/trust/hydrateTrustPayment";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { id } = await params;

  const hydrated = await hydrateTrustPaymentForRender(admin, id, companyId);
  if (!hydrated) return NextResponse.json({ error: 'Payment not found' }, { status: 404 });

  const bytes = await generateTrustPaymentPdf(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hydrated.paymentNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
    },
  });
}
