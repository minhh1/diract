// app/api/precedents/route.ts
// The firm's precedent library (see supabase/migrations/..._precedents.sql).
// GET is used both by the Precedents settings screen's library section and
// by the record-page "Precedent" tab (components/dashboard/tabs/PrecedentsTab.tsx) —
// scoped by recordTable, defaulting to 'projects' (Matters). Any company
// member can add a new precedent; editing/reordering/deleting an existing
// one is admin-only (see app/api/precedents/[id]/route.ts).
import { NextRequest, NextResponse } from "next/server";
import { authorizeCompanyMember } from "@/lib/documentTemplateAuth";

export async function GET(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, companyId } = auth;

  const recordTable = req.nextUrl.searchParams.get("recordTable") || "projects";
  const { data, error } = await admin
    .from("precedents")
    .select(
      "id, name, description, ai_instructions, display_order, created_at, " +
      // Library taxonomy -- drives grouping, matter/jurisdiction scoping and
      // the review badge in PrecedentsTab. See
      // supabase/migrations/20260802180000_precedent_library.sql.
      "category, subcategory, jurisdictions, matter_types, document_type, requires_review, review_note, library_key"
    )
    .eq("company_id", companyId)
    .eq("record_table", recordTable)
    .eq("is_system", false)
    .is("deleted_at", null)
    // Category first so the flat list arrives pre-grouped; display_order
    // still orders within a category.
    .order("category", { nullsFirst: false })
    .order("display_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Optional: when called from a matter's Precedents tab, also resolve that
  // matter's own matter_type so the tab can default to the handful of
  // precedents relevant to it instead of the whole library. Resolved here
  // rather than prop-drilled through RecordDashboard so the tab stays one
  // round trip and self-contained. Best-effort -- a company that hasn't got
  // a matter_type field just gets null and sees everything.
  const projectId = req.nextUrl.searchParams.get("projectId");
  let matterType: string | null = null;
  if (projectId) {
    const { data: matterField } = await admin
      .from("company_custom_fields")
      .select("id")
      .eq("company_id", companyId)
      .eq("table_name", "projects")
      .eq("field_key", "matter_type")
      .is("deleted_at", null)
      .maybeSingle();
    if (matterField) {
      const { data: valueRow } = await admin
        .from("company_custom_field_values")
        .select("value_text")
        .eq("field_id", matterField.id)
        .eq("record_id", projectId)
        .maybeSingle();
      matterType = valueRow?.value_text ?? null;
    }
  }

  return NextResponse.json({ precedents: data || [], matterType });
}

export async function POST(req: NextRequest) {
  const auth = await authorizeCompanyMember();
  if (auth.error) return auth.error;
  const { admin, user, companyId } = auth;

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
