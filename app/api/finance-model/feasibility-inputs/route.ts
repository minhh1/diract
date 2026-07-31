// app/api/finance-model/feasibility-inputs/route.ts
// GET/PATCH for the one-row-per-project Feasibility calculator inputs
// (see lib/feasibilityCalculator.ts) -- GET returns nulls for any field
// never entered (never fabricates a default), PATCH creates the row on
// first save. Same shape as app/api/finance-model/settings/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, createCustomTableRow, updateCustomTableRow } from "@/lib/customTableAdmin";
import { FEASIBILITY_INPUTS_SLUG } from "@/lib/financeModel/data";

// JS camelCase key -> DB field_key. Every field is a plain number (or
// null) -- no validation beyond "is it a finite number if present",
// since these are free-form planning inputs, not something with a
// fixed valid range.
const FIELDS: Record<string, string> = {
  dwellingsCount: "dwellings_count",
  avgDwellingSizeSqm: "avg_dwelling_size_sqm",
  siteAreaSqm: "site_area_sqm",
  expectedSalePricePerDwelling: "expected_sale_price_per_dwelling",
  constructionRatePerSqm: "construction_rate_per_sqm",
  professionalFeesPct: "professional_fees_pct",
  contingencyPct: "contingency_pct",
  marketingSellingPct: "marketing_selling_pct",
  otherAcquisitionCosts: "other_acquisition_costs",
  holdingCostsAnnual: "holding_costs_annual",
  projectDurationMonths: "project_duration_months",
  interestRatePct: "interest_rate_pct",
  loanToCostPct: "loan_to_cost_pct",
  targetMarginPct: "target_margin_pct",
};

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, FEASIBILITY_INPUTS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Feasibility Inputs table is not provisioned" }, { status: 500 });

  const rows = await listCustomTableRows(admin, table, "project", projectId);
  const row = rows[0];
  const inputs: Record<string, number | null> = {};
  for (const [jsKey, dbKey] of Object.entries(FIELDS)) {
    inputs[jsKey] = row?.[dbKey] != null ? Number(row[dbKey]) : null;
  }
  return NextResponse.json({ inputs });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, FEASIBILITY_INPUTS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Feasibility Inputs table is not provisioned" }, { status: 500 });

  const updates: Record<string, number | null> = {};
  for (const [jsKey, dbKey] of Object.entries(FIELDS)) {
    if (!(jsKey in (body ?? {}))) continue;
    const raw = body[jsKey];
    if (raw === null || raw === "") { updates[dbKey] = null; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n)) return NextResponse.json({ error: `${jsKey} must be a number` }, { status: 400 });
    updates[dbKey] = n;
  }

  const rows = await listCustomTableRows(admin, table, "project", projectId);
  if (rows[0]) {
    await updateCustomTableRow(admin, table, rows[0].id, updates);
  } else {
    await createCustomTableRow(admin, table, user.id, { project: projectId, ...updates });
  }

  return NextResponse.json({ success: true });
}
