// app/api/finance-model/budget-categories/route.ts
// CRUD for the company's Finance Model budget-line categories (see
// supabase/migrations/20260801220000_niksen_finance_model_budget_categories.sql).
// "Revenue" is a protected, singular category -- can't be renamed or
// deleted (lib/cashFlowEngine.ts and friends key off that literal string
// to decide cash-in vs cash-out). Every Cost category is fully
// user-managed. Any company member can manage these, same as budget
// lines themselves -- not admin-gated.
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET() {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const { data, error } = await admin
    .from("finance_model_budget_categories")
    .select("id, name, kind, is_creditable, display_order")
    .eq("company_id", companyId)
    .order("display_order");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ categories: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId, user } = auth;

  const body = await req.json().catch(() => null);
  const name: string | undefined = body?.name?.trim();
  const isCreditable = body?.isCreditable !== false; // default true, matches most existing categories
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name === "Revenue") return NextResponse.json({ error: "\"Revenue\" is reserved" }, { status: 400 });

  const { count } = await admin.from("finance_model_budget_categories").select("id", { count: "exact", head: true }).eq("company_id", companyId);

  const { data, error } = await admin
    .from("finance_model_budget_categories")
    .insert({ company_id: companyId, name, kind: "Cost", is_creditable: isCreditable, display_order: count ?? 0, created_by: user.id })
    .select("id, name, kind, is_creditable, display_order")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ category: data });
}

export async function PATCH(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const body = await req.json().catch(() => null);
  const id: string | undefined = body?.id;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin.from("finance_model_budget_categories").select("kind").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });

  const updates: Record<string, any> = {};
  if (body.name !== undefined) {
    if (existing.kind === "Revenue") return NextResponse.json({ error: "\"Revenue\" can't be renamed" }, { status: 400 });
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: "name can't be empty" }, { status: 400 });
    if (name === "Revenue") return NextResponse.json({ error: "\"Revenue\" is reserved" }, { status: 400 });
    updates.name = name;
  }
  if (body.isCreditable !== undefined) updates.is_creditable = !!body.isCreditable;
  if (body.displayOrder !== undefined) updates.display_order = Number(body.displayOrder) || 0;

  const { error } = await admin.from("finance_model_budget_categories").update(updates).eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { data: existing } = await admin.from("finance_model_budget_categories").select("kind").eq("id", id).eq("company_id", companyId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  if (existing.kind === "Revenue") return NextResponse.json({ error: "\"Revenue\" can't be deleted" }, { status: 400 });

  const { error } = await admin.from("finance_model_budget_categories").delete().eq("id", id).eq("company_id", companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
