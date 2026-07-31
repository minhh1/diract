// app/api/finance-model/sync-xero/route.ts
// The explicit "Sync from Xero" button in the Transactions subtab -- see
// lib/xero/syncFinanceModelTransactions.ts for what this actually does.
// Never called automatically; Xero is one optional import path among
// several (manual entry, future accounting-software integrations).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { syncFinanceModelTransactions } from "@/lib/xero/syncFinanceModelTransactions";

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const projectId: string | undefined = body?.projectId;
  if (!projectId) return NextResponse.json({ error: "projectId is required" }, { status: 400 });

  const { data: project } = await admin.from("projects").select("id").eq("id", projectId).eq("company_id", companyId).maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const result = await syncFinanceModelTransactions(admin, companyId, projectId);
  if (result.error) return NextResponse.json(result, { status: 502 });
  return NextResponse.json(result);
}
