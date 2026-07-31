// app/api/finance-model/loan-phases/route.ts
// CRUD for the "Finance Model Loan Phases" custom table -- an ordered
// sequence of repayment-type segments per loan (e.g. 5 years Interest
// Only, then Amortizing for the remainder). See lib/loanCalculator.ts for
// how phases chain together.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow, deleteCustomTableRow } from "@/lib/customTableAdmin";
import { LOAN_PHASES_SLUG } from "@/lib/financeModel/data";

const REPAYMENT_TYPES = ["Interest Only", "Amortizing"];
const FREQUENCIES = ["Monthly", "Quarterly", "Six-Monthly", "Annually", "At Maturity"];

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const loanId = req.nextUrl.searchParams.get("loanId");
  if (!loanId) return NextResponse.json({ error: "loanId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, LOAN_PHASES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loan Phases table is not provisioned" }, { status: 500 });

  const phases = await listCustomTableRows(admin, table, "loan", loanId);
  return NextResponse.json({ phases });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const loanId: string | undefined = body?.loanId;
  const repaymentType: string | undefined = body?.repaymentType;
  const startDate: string | undefined = body?.startDate;
  const endDate: string | undefined = body?.endDate;
  if (!loanId || !repaymentType || !startDate || !endDate) {
    return NextResponse.json({ error: "loanId, repaymentType, startDate, and endDate are required" }, { status: 400 });
  }
  if (!REPAYMENT_TYPES.includes(repaymentType)) return NextResponse.json({ error: `repaymentType must be one of: ${REPAYMENT_TYPES.join(", ")}` }, { status: 400 });
  if (body.paymentFrequency && !FREQUENCIES.includes(body.paymentFrequency)) return NextResponse.json({ error: `paymentFrequency must be one of: ${FREQUENCIES.join(", ")}` }, { status: 400 });

  const table = await getCustomTable(admin, companyId, LOAN_PHASES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loan Phases table is not provisioned" }, { status: 500 });

  const existing = await listCustomTableRows(admin, table, "loan", loanId);

  const id = await createCustomTableRow(admin, table, user.id, {
    loan: loanId,
    phase_order: existing.length,
    repayment_type: repaymentType,
    start_date: startDate,
    end_date: endDate,
    payment_frequency: body?.paymentFrequency || "Monthly",
  });

  return NextResponse.json({ id });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, LOAN_PHASES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loan Phases table is not provisioned" }, { status: 500 });

  const updates: Record<string, any> = {};
  if (body.repaymentType !== undefined) updates.repayment_type = body.repaymentType;
  if (body.startDate !== undefined) updates.start_date = body.startDate;
  if (body.endDate !== undefined) updates.end_date = body.endDate;
  if (body.paymentFrequency !== undefined) updates.payment_frequency = body.paymentFrequency;
  if (body.phaseOrder !== undefined) updates.phase_order = body.phaseOrder;

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
