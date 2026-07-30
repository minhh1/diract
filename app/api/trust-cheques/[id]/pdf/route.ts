// app/api/trust-cheques/[id]/pdf/route.ts
// GET -> the printable cheque PDF for one Trust Transactions
// withdrawal-by-cheque record. Mirrors app/api/receipts/[receiptId]/pdf/route.ts's shape.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateTrustChequePdf } from "@/lib/trust/generateTrustChequePdf";
import { hydrateTrustChequeForRender } from "@/lib/trust/hydrateTrustCheque";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { id } = await params;

  const hydrated = await hydrateTrustChequeForRender(admin, id, companyId);
  if (!hydrated) return NextResponse.json({ error: 'Cheque not found' }, { status: 404 });

  const bytes = await generateTrustChequePdf(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hydrated.chequeNumber.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf"`,
    },
  });
}
