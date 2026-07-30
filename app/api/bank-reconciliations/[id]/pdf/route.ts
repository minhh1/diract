// app/api/bank-reconciliations/[id]/pdf/route.ts
// GET -> the printable, signed-off Bank Reconciliation PDF. Mirrors the
// trust receipt/ledger PDF routes' shape.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { generateBankReconciliationPdf } from "@/lib/trust/generateBankReconciliationPdf";
import { hydrateBankReconciliationForRender } from "@/lib/trust/hydrateBankReconciliation";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeCompanyMember();
  if ("error" in auth) return auth.error;
  const { admin, companyId } = auth;
  const { id } = await params;

  const hydrated = await hydrateBankReconciliationForRender(admin, id, companyId);
  if (!hydrated) return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });

  const bytes = await generateBankReconciliationPdf(hydrated.input);

  const download = req.nextUrl.searchParams.get('download') === '1';
  return new NextResponse(bytes as any, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${(hydrated.input.trustAccountName || 'trust').replace(/[^a-zA-Z0-9-]/g, '_')}_reconciliation.pdf"`,
    },
  });
}
