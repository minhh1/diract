// app/api/finance-model/transactions/route.ts
// CRUD for one project's Finance Model transaction ledger (the "Finance
// Model Transactions" custom table). Rows come from two places: manual
// entry through this route (source: "Manual"), or the explicit "Sync from
// Xero" action (lib/xero/syncFinanceModelTransactions.ts, source: "Xero").
// No server-side sort/filter -- the Transactions subtab loads a project's
// full row set and sorts/filters client-side (see
// components/public/financeModel/TransactionsSubtab.tsx), same tradeoff
// components/dashboard/tabs/InvoicesTab.tsx already makes for its own
// custom-table-backed list.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow, deleteCustomTableRow } from "@/lib/customTableAdmin";
import { TRANSACTIONS_SLUG } from "@/lib/financeModel/data";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, TRANSACTIONS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Transactions table is not provisioned" }, { status: 500 });

  const [rows, { data: project }] = await Promise.all([
    listCustomTableRows(admin, table, "project", projectId),
    admin.from("projects").select("created_at").eq("id", projectId).maybeSingle(),
  ]);
  return NextResponse.json({ transactions: rows, projectCreatedAt: project?.created_at ?? null });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const table = await getCustomTable(admin, companyId, TRANSACTIONS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Transactions table is not provisioned" }, { status: 500 });

  const id = await createCustomTableRow(admin, table, user.id, {
    project: projectId,
    date: body?.date || null,
    type: body?.type || null,
    contact: body?.contact?.trim() || null,
    reference: body?.reference?.trim() || null,
    amount: Number.isFinite(Number(body?.amount)) ? Number(body.amount) : null,
    budget_line: body?.budgetLineId || null,
    source: "Manual",
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

  const table = await getCustomTable(admin, companyId, TRANSACTIONS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Transactions table is not provisioned" }, { status: 500 });

  const updates: Record<string, any> = {};
  if (body.date !== undefined) updates.date = body.date;
  if (body.type !== undefined) updates.type = body.type;
  if (body.contact !== undefined) updates.contact = body.contact?.trim() || null;
  if (body.reference !== undefined) updates.reference = body.reference?.trim() || null;
  if (body.amount !== undefined) {
    const n = Number(body.amount);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "amount must be a number" }, { status: 400 });
    updates.amount = n;
  }
  if (body.budgetLineId !== undefined) updates.budget_line = body.budgetLineId || null;

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
