// app/api/finance-model/loan-interest-rates/route.ts
// CRUD for the "Finance Model Loan Interest Rates" custom table -- a dated
// rate history per loan (development loans are frequently variable-rate
// and get repriced over the term). lib/loanCalculator.ts picks whichever
// entry is effective on any given date, rather than assuming one static
// rate for the whole loan.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow, deleteCustomTableRow } from "@/lib/customTableAdmin";
import { LOAN_INTEREST_RATES_SLUG } from "@/lib/financeModel/data";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const loanId = req.nextUrl.searchParams.get("loanId");
  if (!loanId) return NextResponse.json({ error: "loanId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, LOAN_INTEREST_RATES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loan Interest Rates table is not provisioned" }, { status: 500 });

  const rates = await listCustomTableRows(admin, table, "loan", loanId);
  return NextResponse.json({ rates });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const loanId: string | undefined = body?.loanId;
  const effectiveDate: string | undefined = body?.effectiveDate;
  const interestRatePa = Number(body?.interestRatePa);
  if (!loanId || !effectiveDate || !Number.isFinite(interestRatePa)) {
    return NextResponse.json({ error: "loanId, effectiveDate, and interestRatePa are required" }, { status: 400 });
  }

  const table = await getCustomTable(admin, companyId, LOAN_INTEREST_RATES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loan Interest Rates table is not provisioned" }, { status: 500 });

  const id = await createCustomTableRow(admin, table, user.id, { loan: loanId, effective_date: effectiveDate, interest_rate_pa: interestRatePa });
  return NextResponse.json({ id });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, LOAN_INTEREST_RATES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loan Interest Rates table is not provisioned" }, { status: 500 });

  const updates: Record<string, any> = {};
  if (body.effectiveDate !== undefined) updates.effective_date = body.effectiveDate;
  if (body.interestRatePa !== undefined) {
    const n = Number(body.interestRatePa);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "interestRatePa must be a number" }, { status: 400 });
    updates.interest_rate_pa = n;
  }

  await updateCustomTableRow(admin, table, id, updates);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  await deleteCustomTableRow(admin, id);
  return NextResponse.json({ success: true });
}
