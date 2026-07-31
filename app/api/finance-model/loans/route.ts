// app/api/finance-model/loans/route.ts
// CRUD for the "Finance Model Loans" custom table -- senior/mezzanine/
// money-partner loans against a project, with borrower/guarantor entities,
// repayment terms, extension rights, and security. Interest rate history
// and repayment-type phases live in their own tables (loan-interest-rates,
// loan-phases routes) since both are one-to-many against a loan.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow, deleteCustomTableRow } from "@/lib/customTableAdmin";
import { LOANS_SLUG } from "@/lib/financeModel/data";

const LENDER_TYPES = ["Senior", "Mezzanine", "Money Partner", "Other"];
const REPAYMENT_PERIODS = ["Monthly", "Six-Monthly", "At End of Term"];

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, LOANS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loans table is not provisioned" }, { status: 500 });

  const loans = await listCustomTableRows(admin, table, "project", projectId);
  return NextResponse.json({ loans });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  const borrowerId: string | undefined = body?.borrowerId;
  if (!projectId || !borrowerId) return NextResponse.json({ error: "projectId and borrowerId are required" }, { status: 400 });
  if (body.lenderType && !LENDER_TYPES.includes(body.lenderType)) return NextResponse.json({ error: `lenderType must be one of: ${LENDER_TYPES.join(", ")}` }, { status: 400 });
  if (body.repaymentPeriod && !REPAYMENT_PERIODS.includes(body.repaymentPeriod)) return NextResponse.json({ error: `repaymentPeriod must be one of: ${REPAYMENT_PERIODS.join(", ")}` }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const table = await getCustomTable(admin, companyId, LOANS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loans table is not provisioned" }, { status: 500 });

  const id = await createCustomTableRow(admin, table, user.id, {
    project: projectId,
    name: body?.name?.trim() || null,
    lender_type: body?.lenderType || null,
    borrower: borrowerId,
    guarantors: Array.isArray(body?.guarantorIds) ? body.guarantorIds : [],
    principal_amount: Number.isFinite(Number(body?.principalAmount)) ? Number(body.principalAmount) : null,
    start_date: body?.startDate || null,
    repayment_date: body?.repaymentDate || null,
    repayment_period: body?.repaymentPeriod || null,
    extension_right: !!body?.extensionRight,
    extension_terms: body?.extensionTerms?.trim() || null,
    early_repayment_allowed: !!body?.earlyRepaymentAllowed,
    early_repayment_terms: body?.earlyRepaymentTerms?.trim() || null,
    security: body?.security?.trim() || null,
    notes: body?.notes?.trim() || null,
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

  const table = await getCustomTable(admin, companyId, LOANS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loans table is not provisioned" }, { status: 500 });

  const fieldMap: Record<string, string> = {
    name: "name", lenderType: "lender_type", borrowerId: "borrower", guarantorIds: "guarantors",
    principalAmount: "principal_amount", startDate: "start_date", repaymentDate: "repayment_date",
    repaymentPeriod: "repayment_period", extensionRight: "extension_right", extensionTerms: "extension_terms",
    earlyRepaymentAllowed: "early_repayment_allowed", earlyRepaymentTerms: "early_repayment_terms",
    security: "security", notes: "notes",
  };
  const updates: Record<string, any> = {};
  for (const [bodyKey, fieldKey] of Object.entries(fieldMap)) {
    if (body[bodyKey] !== undefined) updates[fieldKey] = body[bodyKey];
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
