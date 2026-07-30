// app/api/trust-ledger/[matterId]/pdf/route.ts
// GET -> the printable Trust Account Ledger PDF for one matter, covering
// every trust account it has entries against. Mirrors the invoice/receipt
// PDF routes' shape.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateTrustLedgerPdf } from "@/lib/trust/generateTrustLedgerPdf";
import { hydrateTrustLedgerForRender } from "@/lib/trust/hydrateTrustLedger";

export async function GET(req: NextRequest, { params }: { params: Promise<{ matterId: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { matterId } = await params;

  const hydrated = await hydrateTrustLedgerForRender(admin, matterId, companyId);
  if (!hydrated) return NextResponse.json({ error: 'Matter not found' }, { status: 404 });

  const bytes = await generateTrustLedgerPdf(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${hydrated.matterName.replace(/[^a-zA-Z0-9-]/g, '_')}_trust_ledger.pdf"`,
    },
  });
}
