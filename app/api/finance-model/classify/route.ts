// app/api/finance-model/classify/route.ts
// "Apply rules" bulk action -- runs lib/financeModel/classifyTransaction.ts
// against every currently-unclassified transaction for a project, and
// writes back a budget_line for the ones that match. Already-classified
// transactions are left alone (this never overrides a manual/previous
// classification).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { getCustomTable, listCustomTableRows, listAllCustomTableRows, updateCustomTableRow } from "@/lib/customTableAdmin";
import { TRANSACTIONS_SLUG, CLASSIFICATION_RULES_SLUG } from "@/lib/financeModel/data";
import { classifyTransaction, type ClassificationRule } from "@/lib/financeModel/classifyTransaction";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const [txTable, rulesTable] = await Promise.all([
    getCustomTable(admin, companyId, TRANSACTIONS_SLUG),
    getCustomTable(admin, companyId, CLASSIFICATION_RULES_SLUG),
  ]);
  if (!txTable || !rulesTable) return NextResponse.json({ error: "Finance Model tables are not provisioned" }, { status: 500 });

  const [transactions, allRules] = await Promise.all([
    listCustomTableRows(admin, txTable, "project", projectId),
    listAllCustomTableRows(admin, rulesTable),
  ]);
  const rules = allRules as unknown as ClassificationRule[];

  let classified = 0;
  for (const tx of transactions) {
    if (tx.budget_line) continue; // already classified -- never override
    const budgetLineId = classifyTransaction({ project: projectId, contact: tx.contact, reference: tx.reference, description: tx.description ?? null }, rules);
    if (budgetLineId) {
      await updateCustomTableRow(admin, txTable, tx.id, { budget_line: budgetLineId });
      classified++;
    }
  }

  return NextResponse.json({ classified, checked: transactions.length });
}
