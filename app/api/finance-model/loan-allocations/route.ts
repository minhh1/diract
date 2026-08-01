// app/api/finance-model/loan-allocations/route.ts
// Lets one Finance Model loan be split across more than one project (e.g.
// a single construction facility funding two adjoining sites), via the
// finance_model_loan_allocations table (supabase/migrations/
// 20260801270000_finance_model_loan_allocations.sql). A loan with zero
// rows there is unsplit -- 100% attributed to its own `project` field,
// exactly as before this table existed -- so GET synthesizes that as a
// single virtual 100% row rather than requiring the UI to special-case
// "no allocations yet".
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, getCustomTableRow } from "@/lib/customTableAdmin";
import { LOANS_SLUG } from "@/lib/financeModel/data";

const SUM_EPSILON = 0.01;

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const loanId = req.nextUrl.searchParams.get("loanId");
  if (!loanId) return NextResponse.json({ error: "loanId is required" }, { status: 400 });

  const table = await getCustomTable(admin, companyId, LOANS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loans table is not provisioned" }, { status: 500 });
  const loan = await getCustomTableRow(admin, table, loanId);
  if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  const { data: rows } = await admin
    .from("finance_model_loan_allocations")
    .select("id, project_id, split_percent")
    .eq("loan_id", loanId)
    .eq("company_id", companyId);

  const projectIds = rows?.length ? rows.map((r: any) => r.project_id) : [loan.project].filter(Boolean);
  const { data: projects } = await admin.from("projects").select("id, name").in("id", projectIds).eq("company_id", companyId);
  const nameById = new Map((projects || []).map((p: any) => [p.id, p.name]));

  const allocations = rows?.length
    ? rows.map((r: any) => ({ id: r.id, projectId: r.project_id, projectName: nameById.get(r.project_id) || "Unknown project", splitPercent: Number(r.split_percent) }))
    : loan.project
      ? [{ id: null, projectId: loan.project, projectName: nameById.get(loan.project) || "Unknown project", splitPercent: 100 }]
      : [];

  return NextResponse.json({ allocations, homeProjectId: loan.project || null });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const loanId: string | undefined = body?.loanId;
  const allocations: { projectId?: string; splitPercent?: number }[] | undefined = body?.allocations;
  if (!loanId || !Array.isArray(allocations) || !allocations.length) {
    return NextResponse.json({ error: "loanId and a non-empty allocations array are required" }, { status: 400 });
  }

  const table = await getCustomTable(admin, companyId, LOANS_SLUG);
  if (!table) return NextResponse.json({ error: "Finance Model Loans table is not provisioned" }, { status: 500 });
  const loan = await getCustomTableRow(admin, table, loanId);
  if (!loan) return NextResponse.json({ error: "Loan not found" }, { status: 404 });

  const projectIds = new Set<string>();
  for (const a of allocations) {
    if (!a.projectId || !Number.isFinite(a.splitPercent) || (a.splitPercent as number) <= 0) {
      return NextResponse.json({ error: "Every allocation needs a projectId and a splitPercent > 0" }, { status: 400 });
    }
    if (projectIds.has(a.projectId)) return NextResponse.json({ error: "Each project can only appear once in the split" }, { status: 400 });
    projectIds.add(a.projectId);
  }

  const sum = allocations.reduce((s, a) => s + (a.splitPercent as number), 0);
  if (Math.abs(sum - 100) > SUM_EPSILON) {
    return NextResponse.json({ error: `Split percentages must sum to 100 (currently ${sum.toFixed(2)})` }, { status: 400 });
  }

  const { data: validProjects } = await admin.from("projects").select("id").in("id", [...projectIds]).eq("company_id", companyId);
  if ((validProjects?.length || 0) !== projectIds.size) {
    return NextResponse.json({ error: "One or more projects were not found" }, { status: 400 });
  }

  // Collapses back to the "unsplit" invariant (zero rows) when the
  // resulting set is just the loan's own home project at ~100% -- keeps
  // every other reader's "no rows = 100% at home project" assumption
  // correct without needing a separate "un-split" endpoint.
  const isUnsplit = allocations.length === 1 && allocations[0].projectId === loan.project && Math.abs((allocations[0].splitPercent as number) - 100) <= SUM_EPSILON;

  await admin.from("finance_model_loan_allocations").delete().eq("loan_id", loanId).eq("company_id", companyId);
  if (!isUnsplit) {
    await admin.from("finance_model_loan_allocations").insert(
      allocations.map(a => ({ loan_id: loanId, project_id: a.projectId, company_id: companyId, split_percent: a.splitPercent, created_by: user.id }))
    );
  }

  return NextResponse.json({ success: true });
}
