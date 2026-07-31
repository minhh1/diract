// app/api/finance-model/budget-lines/route.ts
// CRUD for one entity's Finance Model budget line items
// (finance_model_budget_lines -- see supabase/migrations/
// 20260731220000_finance_model_budget_lines.sql). Any company member can
// add/edit/remove a line, same as editing any other record field in this
// app -- not admin-gated, unlike the Xero connection management itself.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

const CATEGORIES = ["Acquisition", "Construction", "Professional Fees", "Finance Costs", "Contingency", "Revenue", "Other"];

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const entityId: string | undefined = body?.entityId;
  const category: string | undefined = body?.category;
  const label: string | undefined = body?.label;
  const budgetedAmount = Number(body?.budgetedAmount);
  const xeroAccountCode: string | null = body?.xeroAccountCode?.trim() || null;

  if (!entityId || !category || !label?.trim() || !Number.isFinite(budgetedAmount)) {
    return NextResponse.json({ error: "entityId, category, label, and budgetedAmount are required" }, { status: 400 });
  }
  if (!CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `category must be one of: ${CATEGORIES.join(", ")}` }, { status: 400 });
  }

  const { data: entity } = await admin.from("entities").select("id").eq("id", entityId).eq("company_id", companyId).maybeSingle();
  if (!entity) return NextResponse.json({ error: "Entity not found" }, { status: 404 });

  const { count } = await admin
    .from("finance_model_budget_lines")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", entityId);

  const { data, error } = await admin
    .from("finance_model_budget_lines")
    .insert({
      company_id: companyId,
      entity_id: entityId,
      category,
      label: label.trim(),
      budgeted_amount: budgetedAmount,
      xero_account_code: xeroAccountCode,
      display_order: count ?? 0,
      created_by: user.id,
    })
    .select("id, category, label, budgeted_amount, xero_account_code, display_order")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ budgetLine: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

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
  updates.updated_at = new Date().toISOString();

  const { error } = await admin.from("finance_model_budget_lines").update(updates).eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await admin.from("finance_model_budget_lines").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
