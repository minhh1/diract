// app/api/precedents/route.ts
// The firm's precedent library (see supabase/migrations/..._precedents.sql).
// GET is used both by the admin "Precedent library" management UI and by the
// record-page "Precedent" tab (components/dashboard/tabs/PrecedentsTab.tsx) —
// scoped by recordTable, defaulting to 'projects' (Matters). Only a company
// admin can create/reorder/edit — any company member can read the list to
// issue from it (see app/api/precedents/[id]/issue/route.ts).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const recordTable = req.nextUrl.searchParams.get("recordTable") || "projects";
  const { data, error } = await admin
    .from("precedents")
    .select("id, name, description, ai_instructions, display_order, created_at")
    .eq("company_id", companyId)
    .eq("record_table", recordTable)
    .is("deleted_at", null)
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ precedents: data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId, isAdmin } = auth;
  if (!isAdmin) return NextResponse.json({ error: "Only a company admin can add precedents" }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = String(body?.name || "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const { data: maxOrderRow } = await admin
    .from("precedents").select("display_order").eq("company_id", companyId).order("display_order", { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxOrderRow?.display_order ?? -1) + 1;

  const { data, error } = await admin.from("precedents").insert({
    company_id: companyId,
    record_table: String(body?.recordTable || "projects"),
    name,
    description: body?.description ? String(body.description) : null,
    ai_instructions: body?.aiInstructions ? String(body.aiInstructions) : null,
    display_order: nextOrder,
    created_by: user.id,
  }).select("id, name, description, ai_instructions, display_order, created_at").single();

  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to create precedent" }, { status: 500 });
  return NextResponse.json({ ok: true, precedent: data });
}
