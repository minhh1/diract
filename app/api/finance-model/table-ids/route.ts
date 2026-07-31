// app/api/finance-model/table-ids/route.ts
// The Finance Model subtabs' own forms use components/dashboard/
// RelationPicker.tsx directly for relation fields (budget_line, loan,
// borrower/guarantors, project) rather than bespoke search dropdowns --
// RelationPicker takes a custom table's real company_tables.id
// (`linkedTableId`), which the frontend doesn't otherwise know since these
// tables are provisioned by migration, not created through the normal
// "New table" UI. One small lookup instead of hardcoding ids client-side.
import { NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import {
  BUDGET_LINES_SLUG, TRANSACTIONS_SLUG, CLASSIFICATION_RULES_SLUG,
  LOANS_SLUG, LOAN_INTEREST_RATES_SLUG, LOAN_PHASES_SLUG,
} from "@/lib/financeModel/data";

const SLUGS = {
  budgetLinesTableId: BUDGET_LINES_SLUG,
  transactionsTableId: TRANSACTIONS_SLUG,
  classificationRulesTableId: CLASSIFICATION_RULES_SLUG,
  loansTableId: LOANS_SLUG,
  loanInterestRatesTableId: LOAN_INTEREST_RATES_SLUG,
  loanPhasesTableId: LOAN_PHASES_SLUG,
};

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data: tables } = await admin.from("company_tables").select("id, slug").eq("company_id", companyId).is("deleted_at", null);
  const idBySlug = new Map((tables || []).map((t: any) => [t.slug, t.id]));

  const result: Record<string, string | null> = {};
  for (const [key, slug] of Object.entries(SLUGS)) result[key] = idBySlug.get(slug) ?? null;

  return NextResponse.json(result);
}
