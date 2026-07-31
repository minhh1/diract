// app/api/xero/finance-model/route.ts
// Authenticated data for the "Finance Model" record tab
// (components/dashboard/tabs/FinanceModelTab.tsx). See
// lib/xero/financeModelData.ts for what's actually returned -- this route
// just adds the company-membership auth check on top; the unauthenticated
// public-page equivalent is app/api/finance-model-pages/public/[pageId]/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";
import { loadFinanceModelData } from "@/lib/xero/financeModelData";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityId) return NextResponse.json({ error: "entityId is required" }, { status: 400 });

  const { data: entity } = await admin.from("entities").select("id").eq("id", entityId).eq("company_id", companyId).maybeSingle();
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  try {
    const data = await loadFinanceModelData(admin, entityId);
    if (!data) return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    if (data.error) return NextResponse.json(data, { status: 502 });
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to fetch Xero data" }, { status: 502 });
  }
}
