// app/api/finance-model/classification-rules/route.ts
// CRUD for the "Finance Model Classification Rules" custom table, used by
// lib/financeModel/classifyTransaction.ts's "Apply rules" bulk action. A
// rule with no project set applies to every project in the company (a
// company-wide default, e.g. "any transaction from 'ATO' -> Other/Tax"),
// so GET returns project-specific rules plus company-wide ones together --
// that OR condition can't go through
// lib/customTableAdmin.ts#listCustomTableRows's single-value-equality
// filter, so this route loads every rule for the company (a handful of
// rows in practice) and filters in memory instead.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listAllCustomTableRows, createCustomTableRow, updateCustomTableRow, deleteCustomTableRow } from "@/lib/customTableAdmin";
import { CLASSIFICATION_RULES_SLUG } from "@/lib/financeModel/data";

const MATCH_FIELDS = ["Contact", "Reference"];
const MATCH_TYPES = ["Equals", "Contains", "Starts With"];

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, CLASSIFICATION_RULES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Classification Rules table is not provisioned" }, { status: 500 });

  const all = await listAllCustomTableRows(admin, table);
  const rules = all.filter(r => !r.project || r.project === projectId);
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const matchField: string | undefined = body?.matchField;
  const matchType: string | undefined = body?.matchType;
  const matchValue: string | undefined = body?.matchValue;
  const budgetLineId: string | undefined = body?.budgetLineId;
  if (!matchField || !MATCH_FIELDS.includes(matchField)) return NextResponse.json({ error: `matchField must be one of: ${MATCH_FIELDS.join(", ")}` }, { status: 400 });
  if (!matchType || !MATCH_TYPES.includes(matchType)) return NextResponse.json({ error: `matchType must be one of: ${MATCH_TYPES.join(", ")}` }, { status: 400 });
  if (!matchValue?.trim()) return NextResponse.json({ error: "matchValue is required" }, { status: 400 });
  if (!budgetLineId) return NextResponse.json({ error: "budgetLineId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, CLASSIFICATION_RULES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Classification Rules table is not provisioned" }, { status: 500 });

  const existing = await listAllCustomTableRows(admin, table);

  const id = await createCustomTableRow(admin, table, user.id, {
    project: body?.projectId || null,
    match_field: matchField,
    match_type: matchType,
    match_value: matchValue.trim(),
    budget_line: budgetLineId,
    display_order: existing.length,
    is_active: true,
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

  const table = await getCustomTable(admin, companyId, CLASSIFICATION_RULES_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Classification Rules table is not provisioned" }, { status: 500 });

  const updates: Record<string, any> = {};
  if (body.matchField !== undefined) updates.match_field = body.matchField;
  if (body.matchType !== undefined) updates.match_type = body.matchType;
  if (body.matchValue !== undefined) updates.match_value = String(body.matchValue).trim();
  if (body.budgetLineId !== undefined) updates.budget_line = body.budgetLineId;
  if (body.isActive !== undefined) updates.is_active = !!body.isActive;

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
