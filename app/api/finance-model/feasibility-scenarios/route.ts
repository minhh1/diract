// app/api/finance-model/feasibility-scenarios/route.ts
// CRUD for saved, named "what-if" scenarios on the Feasibility calculator
// (e.g. "Sale price -10%") -- only override deltas are stored, never
// computed outputs, so a scenario stays correct if the base feasibility
// inputs change later (see lib/feasibilityCalculator.ts's runScenarios
// for the always-live computation). Same shape as
// app/api/finance-model/budget-lines/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow, deleteCustomTableRow } from "@/lib/customTableAdmin";
import { FEASIBILITY_SCENARIOS_SLUG } from "@/lib/financeModel/data";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, FEASIBILITY_SCENARIOS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Feasibility Scenarios table is not provisioned" }, { status: 500 });

  const scenarios = await listCustomTableRows(admin, table, "project", projectId);
  return NextResponse.json({ scenarios });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  const name: string | undefined = body?.name;
  if (!projectId || !name?.trim()) return NextResponse.json({ error: "projectId and name are required" }, { status: 400 });

  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

  const table = await getCustomTable(admin, companyId, FEASIBILITY_SCENARIOS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Feasibility Scenarios table is not provisioned" }, { status: 500 });

  const id = await createCustomTableRow(admin, table, user.id, {
    project: projectId,
    name: name.trim(),
    sale_price_delta_pct: num(body.salePriceDeltaPct),
    sale_price_override: num(body.salePriceOverride),
    construction_cost_delta_pct: num(body.constructionCostDeltaPct),
    notes: body.notes?.trim() || null,
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

  const table = await getCustomTable(admin, companyId, FEASIBILITY_SCENARIOS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Feasibility Scenarios table is not provisioned" }, { status: 500 });

  const num = (v: unknown) => (v === null || v === "" ? null : Number(v));
  const updates: Record<string, any> = {};
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.salePriceDeltaPct !== undefined) updates.sale_price_delta_pct = num(body.salePriceDeltaPct);
  if (body.salePriceOverride !== undefined) updates.sale_price_override = num(body.salePriceOverride);
  if (body.constructionCostDeltaPct !== undefined) updates.construction_cost_delta_pct = num(body.constructionCostDeltaPct);
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;

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
