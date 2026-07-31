// app/api/finance-model/budget-lines/route.ts
// CRUD for one project's Finance Model budget line items, now backed by
// the "Finance Model Budget Lines" custom table (see supabase/migrations/
// 20260731310000_niksen_finance_model_v2_tables.sql) instead of the old
// entity-scoped finance_model_budget_lines system table. Any company
// member can add/edit/remove a line, same as editing any other record
// field in this app -- not admin-gated.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow, deleteCustomTableRow } from "@/lib/customTableAdmin";
import { BUDGET_LINES_SLUG } from "@/lib/financeModel/data";

const CATEGORIES = ["Acquisition", "Construction", "Professional Fees", "Finance Costs", "Contingency", "Revenue", "Other"];

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, BUDGET_LINES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Budget Lines table is not provisioned" }, { status: 500 });

  const budgetLines = await listCustomTableRows(admin, table, "project", projectId);
  return NextResponse.json({ budgetLines });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  const category: string | undefined = body?.category;
  const label: string | undefined = body?.label;
  const budgetedAmount = Number(body?.budgetedAmount);
  const xeroAccountCode: string | null = body?.xeroAccountCode?.trim() || null;

  if (!projectId || !category || !label?.trim() || !Number.isFinite(budgetedAmount)) {
    return NextResponse.json({ error: "projectId, category, label, and budgetedAmount are required" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const table = await getCustomTable(admin, companyId, BUDGET_LINES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Budget Lines table is not provisioned" }, { status: 500 });

  const existing = await listCustomTableRows(admin, table, "project", projectId);

  const linkedTaskId: string | null = body?.linkedTaskId || null;
  const timingProfile: string | null = body?.timingProfile || null;
  const timingStartDate: string | null = body?.timingStartDate || null;
  const timingEndDate: string | null = body?.timingEndDate || null;

  const id = await createCustomTableRow(admin, table, user.id, {
    project: projectId,
    category,
    label: label.trim(),
    budgeted_amount: budgetedAmount,
    xero_account_code: xeroAccountCode,
    display_order: existing.length,
    linked_task_id: linkedTaskId,
    timing_profile: timingProfile,
    timing_start_date: timingStartDate,
    timing_end_date: timingEndDate,
  });

  return NextResponse.json({
    budgetLine: {
      id, category, label: label.trim(), budgeted_amount: budgetedAmount, xero_account_code: xeroAccountCode, display_order: existing.length,
      linked_task_id: linkedTaskId, timing_profile: timingProfile, timing_start_date: timingStartDate, timing_end_date: timingEndDate,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, BUDGET_LINES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Budget Lines table is not provisioned" }, { status: 500 });

  const updates: Record<string, any> = {};
  if (body.category !== undefined) {
    if (!CATEGORIES.includes(body.category)) return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
    updates.category = body.category;
  }
  if (body.label !== undefined) updates.label = String(body.label).trim();
  if (body.budgetedAmount !== undefined) {
    const n = Number(body.budgetedAmount);
    if (!Number.isFinite(n)) return NextResponse.json({ error: "budgetedAmount must be a number" }, { status: 400 });
    updates.budgeted_amount = n;
  }
  if (body.xeroAccountCode !== undefined) updates.xero_account_code = body.xeroAccountCode?.trim() || null;
  if (body.linkedTaskId !== undefined) updates.linked_task_id = body.linkedTaskId || null;
  if (body.timingProfile !== undefined) updates.timing_profile = body.timingProfile || null;
  if (body.timingStartDate !== undefined) updates.timing_start_date = body.timingStartDate || null;
  if (body.timingEndDate !== undefined) updates.timing_end_date = body.timingEndDate || null;

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
